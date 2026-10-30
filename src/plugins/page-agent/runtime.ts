// 页面助手的运行时服务：全站唯一的 PageAgent 实例宿主。
//
// 为什么不把 PageAgent 塞进组件：面板是长生命周期的浮动 UI，路由切换不该重建 agent
// （否则每次跳页都丢历史、丢中断状态）。因此实例归服务，页面/触发器只调用它的
// 公开方法。
//
// 两级加载，对应两套可见性：
// - 启动器视图（免登录）：只回答「显不显示、长什么样」，用于外壳一进来就有入口；
// - 完整设置（需登录）：供应商、模型、提示词、脱敏规则，只在真正要跑任务时才拉，
//   并且配置改动后 `reload()` 能让下一次任务立即用上新参数。
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { PageAgent } from 'page-agent'
import type { HttpRegistry } from '@/kernel'
import {
  fetchLauncherView,
  fetchPageAgentSettings,
  type LauncherStyle,
  type MaskRule,
  type PageAgentSettingsView,
  type RouteInstruction,
} from './api'

/** 与 PageAgent 的状态机对齐，避免宿主自己再发明一套名字。 */
export type AgentState = 'idle' | 'running' | 'completed' | 'error' | 'stopped' | 'disposed'

export interface AgentHistoryItem {
  type: 'step' | 'observation' | 'user_takeover' | 'retry' | 'error'
  stepIndex?: number
  reflection?: { evaluation_previous_goal?: string; memory?: string; next_goal?: string }
  action?: { name: string; input: unknown; output: string }
  content?: string
  attempt?: number
  maxAttempts?: number
  message?: string
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
}

function token(): string | null {
  return localStorage.getItem('micro-admin.token')
}

/** 路径匹配：`re:` 前缀按正则，其它按前缀。 */
export function matchRoute(rules: RouteInstruction[], path: string): string {
  for (const rule of rules) {
    if (rule.pattern.startsWith('re:')) {
      try {
        if (new RegExp(rule.pattern.slice(3)).test(path)) return rule.instruction
      } catch {
        /* 非法正则当作不匹配，不让一条坏配置拖垮整个助手 */
      }
      continue
    }
    if (path === rule.pattern || path.startsWith(rule.pattern)) return rule.instruction
  }
  return ''
}

/** 脱敏：命中即替换。坏正则跳过，避免一条规则让整页内容发不出去。 */
export function maskContent(content: string, rules: MaskRule[]): string {
  let output = content
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue
    try {
      output = output.replace(new RegExp(rule.pattern, 'g'), rule.replacement || '***')
    } catch {
      /* 忽略非法规则 */
    }
  }
  return output
}

/** 允许运行助手的路径判定：空数组 = 全站。 */
export function pathAllowed(allowPaths: readonly string[], path: string): boolean {
  if (allowPaths.length === 0) return true
  return allowPaths.some((prefix) => path === prefix || path.startsWith(prefix))
}

/**
 * 配置未到达时的兜底外观。
 *
 * 这**不是**第二份默认值来源：真正的默认值只存在于后端 `settings.ts`，
 * 这里只是「视图还没拉回来」这一瞬间的占位，拉回后立即被覆盖。
 */
const LAUNCHER_PLACEHOLDER: LauncherStyle = {
  position: 'bottom-right',
  label: '页面助手',
  iconOnly: false,
  color: 'var(--brand)',
  textColor: '#ffffff',
}

export interface PageAgentRuntime {
  /** 启动器视图（免登录）；外壳据此决定入口是否出现。 */
  readonly launcherView: Ref<{ enabled: boolean; ready: boolean; allowPaths: string[] } | null>
  /** 完整设置（需登录）；打开面板/跑任务时才需要。 */
  readonly settings: Ref<PageAgentSettingsView | null>
  readonly loading: Ref<boolean>
  readonly error: Ref<string | null>
  readonly state: Ref<AgentState>
  readonly task: Ref<string>
  readonly history: Ref<AgentHistoryItem[]>
  readonly lastAnswer: Ref<{ success: boolean; text: string } | null>
  readonly panelOpen: Ref<boolean>
  readonly launcher: Ref<LauncherStyle>
  readonly zIndex: Ref<number>
  readonly panelPolicy: Ref<'auto' | 'always' | 'none'>
  readonly canRun: ComputedRef<boolean>
  /** 拉启动器视图；外壳启动时调用。 */
  loadLauncher(): Promise<void>
  /** 拉完整设置并重建实例；设置页保存后调用。 */
  reload(): Promise<void>
  open(): Promise<void>
  close(): void
  toggle(): Promise<void>
  run(task: string): Promise<void>
  stop(): Promise<void>
  syncPath(path: string): void
}

export function createPageAgentRuntime(options: { http: HttpRegistry }): PageAgentRuntime {
  const http = options.http
  const launcherView = shallowRef<{ enabled: boolean; ready: boolean; allowPaths: string[] } | null>(null)
  const settings = shallowRef<PageAgentSettingsView | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const state = ref<AgentState>('idle')
  const task = ref('')
  const history = ref<AgentHistoryItem[]>([])
  const lastAnswer = ref<{ success: boolean; text: string } | null>(null)
  const panelOpen = ref(false)
  const launcher = ref<LauncherStyle>({ ...LAUNCHER_PLACEHOLDER })
  const zIndex = ref(2_147_483_000)
  const panelPolicy = ref<'auto' | 'always' | 'none'>('auto')
  const currentPath = ref(typeof location === 'undefined' ? '/' : location.pathname)

  let agent: PageAgent | null = null
  // 面板是库自带 DOM，不参与 Vue 响应式；单独持有句柄用于同步显隐与配色。
  let panelEl: HTMLElement | null = null

  const canRun = computed(() => {
    const view = launcherView.value
    if (!view || !view.enabled || !view.ready) return false
    return pathAllowed(view.allowPaths, currentPath.value)
  })

  function bindAgentEvents(instance: PageAgent): void {
    const sync = (): void => {
      state.value = instance.status as AgentState
      history.value = [...(instance.history as AgentHistoryItem[])]
      const result = instance.lastResult
      if (result) lastAnswer.value = { success: result.success, text: String(result.data ?? '') }
      panelOpen.value = instance.panel.wrapper.style.display !== 'none'
    }
    instance.addEventListener('statuschange', sync)
    instance.addEventListener('historychange', sync)
    instance.addEventListener('activity', sync)
    instance.addEventListener('dispose', () => {
      state.value = 'disposed'
    })
    sync()
  }

  /**
   * 构造代理 fetch：密钥不在浏览器，请求统一带上登录令牌与本页路径。
   *
   * 路径用 query 传（而不是自定义头）是为了让代理端按 `allowPaths` 精准拒绝，
   * 且不依赖 CORS 预检里的自定义头白名单。
   */
  function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw, location.origin)
    url.searchParams.set('page', currentPath.value)
    const headers = new Headers(init?.headers)
    const bearer = token()
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
    return fetch(url.toString(), { ...init, headers })
  }

  function disposeAgent(): void {
    if (!agent) return
    try {
      agent.dispose()
    } catch {
      /* 库在 dispose 里会移除面板；已经移除过就不重复报错 */
    }
    agent = null
    panelEl = null
    history.value = []
    state.value = 'idle'
    panelOpen.value = false
  }

  /** 面板配色/尺寸全部来自设置：库的 CSS 变量名保持不变，宿主只改值。 */
  function stylePanel(): void {
    const panel = settings.value?.panel
    if (!panelEl || !panel) return
    const root = panelEl.style
    root.setProperty('--width', `${panel.width}px`)
    root.setProperty('--height', `${panel.height}px`)
    root.setProperty('--border-radius', `${panel.radius}px`)
    root.setProperty('--side-space', `${panel.sideSpace}px`)
    root.setProperty('--color-1', panel.colorFrom)
    root.setProperty('--color-2', panel.colorTo)
    root.setProperty('--color-3', panel.accent)
    root.setProperty('--color-4', panel.accent)
    root.bottom = `${panel.offsetBottom}px`
    root.zIndex = String(panel.zIndex)
    root.setProperty('text-align', 'left')
  }

  function ensureAgent(): PageAgent | null {
    const config = settings.value
    if (!config || !config.ready) return null
    if (agent) return agent

    agent = new PageAgent({
      // 供应商地址由后端持有；浏览器只知道同源代理，因此这里拼的是本站 API 前缀。
      baseURL: `${apiBase()}${config.proxyPath}`,
      model: config.model,
      // 占位而非真实密钥：真正的鉴权在代理端，浏览器侧永远拿不到 key。
      apiKey: 'proxy',
      language: config.language,
      maxSteps: config.maxSteps,
      stepDelay: config.stepDelay,
      maxRetries: config.maxRetries,
      disableNamedToolChoice: config.disableNamedToolChoice,
      enableMask: config.enableMask,
      promptForNextTask: config.promptForNextTask,
      customFetch: proxyFetch,
      experimentalScriptExecutionTool: config.experimentalScriptExecution,
      experimentalLlmsTxt: config.experimentalLlmsTxt,
      ...(config.customSystemPrompt ? { customSystemPrompt: config.customSystemPrompt } : {}),
      ...(config.systemInstructions || config.routeInstructions.length > 0
        ? {
            instructions: {
              ...(config.systemInstructions ? { system: config.systemInstructions } : {}),
              getPageInstructions: (url: string) => {
                const path = (() => {
                  try {
                    return new URL(url, location.origin).pathname
                  } catch {
                    return url
                  }
                })()
                return matchRoute(config.routeInstructions, path) || undefined
              },
            },
          }
        : {}),
      ...(config.maskRules.length > 0
        ? { transformPageContent: (content: string) => maskContent(content, config.maskRules) }
        : {}),
    })

    bindAgentEvents(agent)
    panelEl = agent.panel.wrapper
    stylePanel()
    if (panelPolicy.value === 'none') agent.panel.hide()
    return agent
  }

  /** 每次交互都以「当前真实路径」为准：白名单与页面指令都按它判定。 */
  function refreshPath(): void {
    if (typeof location !== 'undefined') currentPath.value = location.pathname
  }

  async function loadSettings(): Promise<PageAgentSettingsView | null> {
    if (settings.value) return settings.value
    try {
      const next = await fetchPageAgentSettings(http)
      settings.value = next
      return next
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '读取页面助手设置失败'
      return null
    }
  }

  async function open(): Promise<void> {
    refreshPath()
    if (!canRun.value) {
      const view = launcherView.value
      error.value = view?.enabled === false
        ? '页面助手已停用：在「页面助手」设置里打开总开关'
        : view?.ready === false
          ? '页面助手未配置完整：设置 baseUrl、模型与密钥'
          : '当前页面不在允许运行助手的路径白名单内'
      return
    }
    const config = await loadSettings()
    if (!config) return
    const instance = ensureAgent()
    if (!instance) return
    error.value = null
    instance.panel.show()
    panelOpen.value = true
  }

  function close(): void {
    agent?.panel.hide()
    panelOpen.value = false
  }

  async function toggle(): Promise<void> {
    if (panelOpen.value) close()
    else await open()
  }

  async function run(next: string): Promise<void> {
    const text = next.trim()
    if (!text) return
    refreshPath()
    if (!canRun.value) {
      await open()
      return
    }
    const config = await loadSettings()
    if (!config) return
    const instance = ensureAgent()
    if (!instance) return
    error.value = null
    task.value = text
    lastAnswer.value = null
    instance.panel.show()
    panelOpen.value = true
    try {
      await instance.execute(text)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      state.value = 'error'
    }
  }

  async function stop(): Promise<void> {
    await agent?.stop()
  }

  async function loadLauncher(): Promise<void> {
    try {
      const view = await fetchLauncherView(http)
      launcherView.value = { enabled: view.enabled, ready: view.ready, allowPaths: view.allowPaths }
      launcher.value = { ...view.launcher }
      zIndex.value = view.panel.zIndex
      panelPolicy.value = view.panelPolicy
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '读取页面助手启动器视图失败'
    }
  }

  /** 配置变了就重建：模型、步数、脱敏规则都必须在下一次任务前生效。 */
  async function reload(): Promise<void> {
    loading.value = true
    try {
      const [view, config] = await Promise.all([fetchLauncherView(http), fetchPageAgentSettings(http)])
      launcherView.value = { enabled: view.enabled, ready: view.ready, allowPaths: view.allowPaths }
      launcher.value = { ...view.launcher }
      zIndex.value = view.panel.zIndex
      panelPolicy.value = view.panelPolicy
      settings.value = config
      disposeAgent()
      error.value = null
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '读取页面助手设置失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 路由变化时调用：只更新路径，不销毁实例。
   *
   * 面板里留着上一条任务的结论，用户可能还在读；正在跑的任务也不该被换页打断。
   */
  function syncPath(path: string): void {
    currentPath.value = path
  }

  return {
    launcherView,
    settings,
    loading,
    error,
    state,
    task,
    history,
    lastAnswer,
    panelOpen,
    launcher,
    zIndex,
    panelPolicy,
    canRun,
    loadLauncher,
    reload,
    open,
    close,
    toggle,
    run,
    stop,
    syncPath,
  }
}
