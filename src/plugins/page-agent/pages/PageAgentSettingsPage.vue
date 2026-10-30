<script setup lang="ts">
// 页面助手设置：把 PageAgent 的每一个可调项都做成界面参数，不在组件里写死。
//
// 三条约束（沿用本仓库前端规范）：
// 1. 必填字段的红色星号与校验规则同源（`el-form` 的 rules），不靠提交后报错提示；
// 2. 每个动作只有一个入口：保存、自检、清空密钥各自一处，不在别处再放一遍；
// 3. 面板与启动器的外观、路径白名单、脱敏规则、附加指令都在这里改，改完立即对下一次任务生效。
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Connection, Delete, Plus, Promotion, Refresh, VideoPlay } from '@element-plus/icons-vue'
import { useRuntime, useService } from '@/shared/service'
import type { HttpClient } from '@/shared/http'
import {
  clearPageAgentKey,
  fetchPageAgentSettings,
  probePageAgent,
  savePageAgentSettings,
  type EditablePageAgentSettings,
  type PageAgentLanguage,
  type PageAgentSettingsView,
  type PanelPolicy,
} from '../api'
import type { PageAgentRuntime } from '../runtime'

const runtime = useService<PageAgentRuntime>('page-agent.runtime')
const appRuntime = useRuntime()
const http = useService<HttpClient>('http')

const formRef = ref<FormInstance>()
const loading = ref(false)
const saving = ref(false)
const probing = ref(false)
const probeResult = ref<{ ok: boolean; message: string; elapsedMs: number } | null>(null)
const saved = ref<PageAgentSettingsView | null>(null)

type Draft = EditablePageAgentSettings & {
  /**
   * 密钥**只在这个草稿里**临时存在：空表示「沿用服务端已保存的那把」，从不回填明文。
   * 放进表单模型是必须的——Element 的校验只读 `form.model[prop]`，
   * 绑独立 ref 会让 `prop="apiKey"` 永远读到 undefined，必填规则形同失效。
   */
  apiKey: string
}

/**
 * 结构占位：只声明字段形状，**不含任何默认值**。
 *
 * 真实默认值只有一份，在后端 `DEFAULT_PAGE_AGENT_SETTINGS`，随设置一起下发到
 * `defaults`；这个占位在首次读取回来之前被 `v-if` 挡住，永远不会被渲染或提交。
 */
function blankDraft(): Draft {
  return {
    enabled: false,
    baseUrl: '',
    model: '',
    language: 'zh-CN',
    maxSteps: 0,
    stepDelay: 0,
    maxRetries: 0,
    disableNamedToolChoice: false,
    extraBody: {},
    requestTimeoutMs: 0,
    enableMask: false,
    promptForNextTask: false,
    panel: { width: 0, height: 0, offsetBottom: 0, sideSpace: 0, radius: 0, colorFrom: '', colorTo: '', accent: '', zIndex: 0 },
    launcher: { position: 'bottom-right', label: '', iconOnly: false, color: '', textColor: '' },
    panelPolicy: 'auto',
    allowPaths: [],
    routeInstructions: [],
    maskRules: [],
    systemInstructions: '',
    customSystemPrompt: '',
    experimentalScriptExecution: false,
    experimentalLlmsTxt: false,
    apiKey: '',
  }
}

const draft = reactive<Draft>(blankDraft())

/** 必填与校验同源：星号由这些规则生成，提交时用的是同一份。 */
const rules: FormRules = {
  baseUrl: [
    { required: true, message: '请输入供应商地址', trigger: ['blur', 'change'] },
    { pattern: /^https?:\/\//, message: '需要以 http:// 或 https:// 开头', trigger: 'blur' },
  ],
  model: [{ required: true, message: '请输入模型名', trigger: ['blur', 'change'] }],
  'panel.width': [{ required: true, type: 'number', message: '请输入面板宽度', trigger: 'change' }],
  'panel.height': [{ required: true, type: 'number', message: '请输入面板高度', trigger: 'change' }],
  'launcher.label': [{ required: true, message: '请输入启动器文案', trigger: ['blur', 'change'] }],
  maxSteps: [{ required: true, type: 'number', message: '请输入最大步数', trigger: 'change' }],
}

/** 密钥为必填只在「还没存过」时成立：已存则留空表示沿用。 */
const keyRequired = computed(() => !saved.value?.hasApiKey)

/**
 * 必须用 `computed`：这个规则依赖「是否已存密钥」，而设置是异步读回来的。
 * 写成普通对象会在 setup 时按 `saved=null` 一次性求值，导致已存密钥后仍然强制重填、
 * 星号常驻，保存直接被校验拦住。
 */
const apiKeyRules = computed<FormRules>(() => ({
  apiKey: keyRequired.value
    ? [{ required: true, message: '请输入 API 密钥', trigger: ['blur', 'change'] }]
    : [],
}))

/**
 * 稳定的结构比较：`JSON.stringify` 对键顺序敏感，而草稿对象与 `draftOf()` 返回的
 * 键顺序并不一样，直接比会把「没改过」判成脏、保存按钮永远可点。这里按键名排序后再比。
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const dirty = computed(() => {
  if (!saved.value) return false
  return canonical({ ...draftOf(saved.value), apiKey: '' }) !== canonical(draft)
})

const allowList = computed(() => {
  if (draft.allowPaths.length === 0) return '全站可运行'
  if (draft.allowPaths.length === 1) return `仅 ${draft.allowPaths[0]}`
  return `${draft.allowPaths.length} 条路径前缀`
})

const panelPolicies: Array<{ value: PanelPolicy; label: string; hint: string }> = [
  { value: 'auto', label: '任务时展开', hint: '启动任务后自动展开面板，结束后保留结论' },
  { value: 'always', label: '常驻展开', hint: '打开即展开，适合把助手当表单填写器用' },
  { value: 'none', label: '不显示面板', hint: '静默执行，只留启动器角标' },
]

const languages: Array<{ value: PageAgentLanguage; label: string }> = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
]

const launcherPositions = [
  { value: 'bottom-right', label: '右下' },
  { value: 'bottom-left', label: '左下' },
  { value: 'top-right', label: '右上' },
  { value: 'top-left', label: '左上' },
] as const

/** 服务端视图 → 草稿：密钥永远从空开始（不回填明文）。 */
function draftOf(view: EditablePageAgentSettings): Draft {
  return {
    apiKey: '',
    enabled: view.enabled,
    baseUrl: view.baseUrl,
    model: view.model,
    language: view.language,
    maxSteps: view.maxSteps,
    stepDelay: view.stepDelay,
    maxRetries: view.maxRetries,
    disableNamedToolChoice: view.disableNamedToolChoice,
    extraBody: { ...view.extraBody },
    requestTimeoutMs: view.requestTimeoutMs,
    enableMask: view.enableMask,
    promptForNextTask: view.promptForNextTask,
    panel: { ...view.panel },
    launcher: { ...view.launcher },
    panelPolicy: view.panelPolicy,
    allowPaths: [...view.allowPaths],
    routeInstructions: view.routeInstructions.map((item) => ({ ...item })),
    maskRules: view.maskRules.map((item) => ({ ...item })),
    systemInstructions: view.systemInstructions,
    customSystemPrompt: view.customSystemPrompt,
    experimentalScriptExecution: view.experimentalScriptExecution,
    experimentalLlmsTxt: view.experimentalLlmsTxt,
  }
}

function apply(view: PageAgentSettingsView): void {
  saved.value = view
  Object.assign(draft, draftOf(view))
  draft.apiKey = ''
  parserText.value = JSON.stringify(view.extraBody ?? {}, null, 2)
}

// `extraBody` 用文本框编辑：它是各家网关的私有字段，表单化反而更差用。
const parserText = ref('{}')
const extraBodyError = ref<string | null>(null)

function parseExtraBody(): void {
  const raw = parserText.value.trim()
  if (!raw) {
    draft.extraBody = {}
    extraBodyError.value = null
    return
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      extraBodyError.value = '需要是一个 JSON 对象，例如 {"enable_thinking": false}'
      return
    }
    draft.extraBody = parsed as Record<string, unknown>
    extraBodyError.value = null
  } catch (error) {
    extraBodyError.value = error instanceof Error ? error.message : 'JSON 解析失败'
  }
}

/**
 * 恢复后端默认值：直接采用服务端下发的 `defaults`，浏览器不自带第二份默认表。
 * 只填表单，不自动保存——用户仍需确认后点「保存」。
 */
function restoreDefaults(): void {
  const defaults = saved.value?.defaults
  if (!defaults) return
  Object.assign(draft, draftOf(defaults))
  draft.apiKey = ''
  parserText.value = JSON.stringify(defaults.extraBody ?? {}, null, 2)
  void formRef.value?.clearValidate()
  ElMessage.info('已填入后端默认值，确认后点「保存」生效')
}

async function reloadSettings(): Promise<void> {
  loading.value = true
  try {
    apply(await fetchPageAgentSettings(http))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '读取设置失败')
  } finally {
    loading.value = false
  }
}

onMounted(reloadSettings)

async function save(): Promise<void> {
  parseExtraBody()
  if (extraBodyError.value) {
    ElMessage.warning('额外请求体不是合法 JSON，先修正再保存')
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    // 密钥留空 = 保留服务端原值（代理端才是唯一持有者）；非空才下发新值。
    const { apiKey, ...rest } = draft
    const view = await savePageAgentSettings(http, {
      ...rest,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    })
    apply(view)
    await runtime.reload()
    ElMessage.success('已保存，下一次任务立即生效（浏览器不会拿到密钥）')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败，检查是否有 system:page-agent:config 权限')
  } finally {
    saving.value = false
  }
}

async function probe(): Promise<void> {
  probing.value = true
  probeResult.value = null
  try {
    probeResult.value = await probePageAgent(http)
  } catch (error) {
    probeResult.value = { ok: false, message: error instanceof Error ? error.message : '自检失败', elapsedMs: 0 }
  } finally {
    probing.value = false
  }
}

async function clearKey(): Promise<void> {
  try {
    await ElMessageBox.confirm('清空后助手会立即不可用，直到重新填写密钥。确定清空？', '清空 API 密钥', { type: 'warning' })
  } catch {
    return
  }
  try {
    apply(await clearPageAgentKey(http))
    await runtime.reload()
    ElMessage.success('已清空密钥')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '清空失败')
  }
}

function addAllowPath(): void {
  draft.allowPaths.push('/')
}

function removeAllowPath(index: number): void {
  draft.allowPaths.splice(index, 1)
}

function addRouteInstruction(): void {
  draft.routeInstructions.push({ pattern: '/', instruction: '' })
}

function removeRouteInstruction(index: number): void {
  draft.routeInstructions.splice(index, 1)
}

function addMaskRule(): void {
  draft.maskRules.push({ label: '新规则', pattern: '', replacement: '***', enabled: true })
}

function removeMaskRule(index: number): void {
  draft.maskRules.splice(index, 1)
}

function runDemo(): void {
  void runtime.run('描述当前页面有哪些主要功能区块，并指出「保存」按钮在哪')
}

const stateLabel: Record<string, string> = {
  idle: '空闲',
  running: '执行中',
  completed: '已完成',
  error: '出错',
  stopped: '已停止',
  disposed: '已销毁',
}

const health = computed(() => {
  if (!draft.enabled) return { type: 'info' as const, text: '已停用' }
  if (!draft.baseUrl || !draft.model) return { type: 'warning' as const, text: '未填完供应商信息' }
  if (!saved.value?.hasApiKey && !draft.apiKey.trim()) return { type: 'warning' as const, text: '缺少密钥' }
  return { type: 'success' as const, text: '配置完整' }
})
</script>

<template>
  <div class="page page-agent" v-loading="loading">
    <header class="page-head">
      <div>
        <h1>页面助手</h1>
        <p>
          把 <code>alibaba/page-agent</code> 装进本后台：用自然语言操作当前页面。模型地址与密钥都留在服务端，
          浏览器只经同源代理调用；下面每一项都是可改的参数，无需发版。
        </p>
      </div>
      <div class="page-actions">
        <el-tag :type="health.type" effect="plain">{{ health.text }}</el-tag>
        <el-tag v-if="saved?.hasApiKey" type="info" effect="plain">密钥 {{ saved.apiKeyHint }}</el-tag>
        <el-button :icon="Refresh" :loading="loading" @click="reloadSettings">重新读取</el-button>
        <el-button :icon="Back" :disabled="!saved" @click="restoreDefaults">恢复默认值</el-button>
        <el-button :icon="Connection" :loading="probing" @click="probe">连接自检</el-button>
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">保存</el-button>
      </div>
    </header>

    <el-alert
      v-if="probeResult"
      :type="probeResult.ok ? 'success' : 'error'"
      :closable="false"
      show-icon
      class="probe-alert"
      :title="`${probeResult.message}（${probeResult.elapsedMs} ms）`"
    />

    <el-form v-if="saved" ref="formRef" :model="draft" :rules="rules" label-position="top" class="agent-form">
      <!-- 连接：模型与供应商。密钥不回填，留空即沿用。 -->
      <section class="panel">
        <div class="panel-title">
          <h2>模型连接</h2>
          <span>OpenAI 兼容网关；请求由后端转发，密钥不会出现在浏览器里</span>
        </div>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="供应商地址" prop="baseUrl" help="例如 https://dashscope.aliyuncs.com/compatible-mode/v1">
              <el-input v-model="draft.baseUrl" placeholder="https://网关地址/v1" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模型" prop="model" help="需要支持 function/tool calling，否则助手无法操作页面">
              <el-input v-model="draft.model" placeholder="例如 ds / gpt-6-astra" clearable />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="API 密钥" prop="apiKey" :rules="apiKeyRules.apiKey">
              <div class="key-row">
                <el-input
                  v-model="draft.apiKey"
                  type="password"
                  show-password
                  :placeholder="saved?.hasApiKey ? `已保存 ${saved.apiKeyHint}，留空即沿用` : '粘贴供应商密钥'"
                />
                <el-button v-if="saved?.hasApiKey" :icon="Delete" text type="danger" @click="clearKey">清空</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="单次调用超时（秒）" prop="requestTimeoutMs">
              <el-input-number v-model="draft.requestTimeoutMs" :min="5000" :max="300000" :step="5000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="失败重试次数" prop="maxRetries">
              <el-input-number v-model="draft.maxRetries" :min="0" :max="5" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="额外请求体（JSON，合并进每次请求）" :error="extraBodyError ?? undefined">
          <el-input v-model="parserText" type="textarea" :rows="3" class="mono-input" @blur="parseExtraBody" />
          <p class="field-hint">用于各家网关的私有开关，例如 <code>{"enable_thinking": false}</code>。留空表示不加。</p>
        </el-form-item>

        <div class="switch-row">
          <div>
            <strong>具名 tool_choice 降级</strong>
            <small>部分网关不认 <code>{"type":"function"}</code> 形式的 tool_choice，打开后只发 <code>required</code></small>
          </div>
          <el-switch v-model="draft.disableNamedToolChoice" />
        </div>
      </section>

      <!-- 运行行为：步数、间隔、遮罩、实验开关。 -->
      <section class="panel">
        <div class="panel-title">
          <h2>运行行为</h2>
          <span>影响执行成本与副作用，逐项可调</span>
        </div>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="最大步数" prop="maxSteps" help="单任务最多交互几步；步数越多越可能跑偏，也越费 token">
              <el-input-number v-model="draft.maxSteps" :min="1" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="步间隔（秒）" prop="stepDelay" help="给页面渲染留时间，SPA 页面建议 0.5 以上">
              <el-input-number v-model="draft.stepDelay" :min="0" :max="10" :step="0.1" :precision="1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="面板语言" prop="language">
              <el-select v-model="draft.language" style="width: 100%">
                <el-option v-for="item in languages" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="switch-grid">
          <div class="switch-row">
            <div><strong>操作遮罩</strong><small>执行时遮住页面，防误触；调试阶段建议关掉</small></div>
            <el-switch v-model="draft.enableMask" />
          </div>
          <div class="switch-row">
            <div><strong>任务后继续提问</strong><small>完成后保留输入框，可直接接下一句指令</small></div>
            <el-switch v-model="draft.promptForNextTask" />
          </div>
          <div class="switch-row">
            <div><strong>总开关</strong><small>关掉后启动器不出现、代理拒绝调用</small></div>
            <el-switch v-model="draft.enabled" />
          </div>
          <div class="switch-row">
            <div><strong>允许执行生成的 JS</strong><small>实验能力，可能绕过脱敏与安全限制，默认关闭</small></div>
            <el-switch v-model="draft.experimentalScriptExecution" />
          </div>
          <div class="switch-row">
            <div><strong>读取站点 /llms.txt</strong><small>实验能力，给模型补充站点说明，默认关闭</small></div>
            <el-switch v-model="draft.experimentalLlmsTxt" />
          </div>
        </div>
      </section>

      <!-- 面板外观：尺寸与配色全部参数化，右侧即时示意。 -->
      <section class="panel">
        <div class="panel-title">
          <h2>面板与启动器外观</h2>
          <span>尺寸、配色、位置、层级都是参数；保存后立即应用</span>
        </div>

        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="面板宽度（px）" prop="panel.width">
              <el-input-number v-model="draft.panel.width" :min="240" :max="720" :step="20" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="收起高度（px）" prop="panel.height">
              <el-input-number v-model="draft.panel.height" :min="32" :max="120" :step="2" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="距底部（px）" prop="panel.offsetBottom">
              <el-input-number v-model="draft.panel.offsetBottom" :min="0" :max="800" :step="8" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="圆角（px）" prop="panel.radius">
              <el-input-number v-model="draft.panel.radius" :min="0" :max="32" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="5">
            <el-form-item label="左右留白（px）" prop="panel.sideSpace">
              <el-input-number v-model="draft.panel.sideSpace" :min="0" :max="60" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="层级 z-index" prop="panel.zIndex">
              <el-input-number v-model="draft.panel.zIndex" :min="1" :max="2147483647" :step="1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="运行态渐变色 A" prop="panel.colorFrom">
              <div class="color-cell">
                <el-input v-model="draft.panel.colorFrom" class="mono-input" />
                <el-color-picker v-model="draft.panel.colorFrom" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="运行态渐变色 B" prop="panel.colorTo">
              <div class="color-cell">
                <el-input v-model="draft.panel.colorTo" class="mono-input" />
                <el-color-picker v-model="draft.panel.colorTo" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="强调色" prop="panel.accent">
              <div class="color-cell">
                <el-input v-model="draft.panel.accent" class="mono-input" />
                <el-color-picker v-model="draft.panel.accent" />
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="面板出现时机" prop="panelPolicy">
          <el-radio-group v-model="draft.panelPolicy">
            <el-radio-button v-for="item in panelPolicies" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
          </el-radio-group>
          <p class="field-hint">{{ panelPolicies.find((item) => item.value === draft.panelPolicy)?.hint }}</p>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="启动器位置" prop="launcher.position">
              <el-select v-model="draft.launcher.position" style="width: 100%">
                <el-option v-for="item in launcherPositions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="启动器文案" prop="launcher.label">
              <el-input v-model="draft.launcher.label" placeholder="页面助手" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="启动器配色" prop="launcher.color">
              <div class="color-cell">
                <el-input v-model="draft.launcher.color" class="mono-input" placeholder="var(--brand)" />
                <el-color-picker :model-value="draft.launcher.color.startsWith('#') ? draft.launcher.color : null" @update:model-value="(value: string | null) => { if (value) draft.launcher.color = value }" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="文案颜色" prop="launcher.textColor">
              <div class="color-cell">
                <el-input v-model="draft.launcher.textColor" class="mono-input" />
                <el-color-picker v-model="draft.launcher.textColor" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="只显示图标" prop="launcher.iconOnly">
              <el-switch v-model="draft.launcher.iconOnly" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="preview-stage">
          <span class="preview-caption">示意（不是真实面板，真实面板由 PageAgent 渲染）</span>
          <div
            class="preview-panel"
            :style="{
              width: `${Math.min(draft.panel.width, 100)}px`.replace('px', '%'),
              borderRadius: `${draft.panel.radius}px`,
              background: `linear-gradient(120deg, ${draft.panel.colorFrom}, ${draft.panel.colorTo})`,
            }"
          >
            <div class="preview-panel__head">
              <span class="dot" :style="{ background: draft.panel.accent }" />
              <span>页面助手 · 等待任务</span>
              <span class="chev">▾</span>
            </div>
            <div class="preview-input" :style="{ marginInline: `${draft.panel.sideSpace}px` }">输入任务，回车开始</div>
          </div>
          <div
            class="preview-launcher"
            :style="{ background: draft.launcher.color, color: draft.launcher.textColor, borderRadius: '999px' }"
          >
            ✨<span v-if="!draft.launcher.iconOnly">{{ draft.launcher.label }}</span>
          </div>
        </div>
      </section>

      <!-- 范围与上下文：路径白名单、页面指令、脱敏、系统提示。 -->
      <section class="panel">
        <div class="panel-title">
          <h2>可用范围与上下文</h2>
          <span>当前：{{ allowList }}</span>
        </div>

        <el-form-item label="允许运行的路径前缀" help="留空表示全站可运行；填写后只有命中的路径能看到启动器">
          <div class="list-editor">
            <div v-for="(_, index) in draft.allowPaths" :key="index" class="list-row">
              <el-input v-model="draft.allowPaths[index]" placeholder="/system/user" />
              <el-button :icon="Delete" text type="danger" @click="removeAllowPath(index)">删除</el-button>
            </div>
            <el-button :icon="Plus" text type="primary" @click="addAllowPath">添加路径</el-button>
            <p v-if="draft.allowPaths.length === 0" class="field-hint">未限制：所有页面都能唤起助手。</p>
          </div>
        </el-form-item>

        <el-form-item label="按页面追加的指令" help="命中即把这段说明作为该系统页面的附加上下文（此前缀或 re: 正则）">
          <div class="list-editor">
            <div v-for="(item, index) in draft.routeInstructions" :key="index" class="list-row list-row--stack">
              <el-input v-model="item.pattern" placeholder="/scada 或 re:^/system/.*" />
              <el-input v-model="item.instruction" type="textarea" :rows="2" placeholder="这个页面的术语、约束或操作习惯" />
              <el-button :icon="Delete" text type="danger" @click="removeRouteInstruction(index)">删除</el-button>
            </div>
            <el-button :icon="Plus" text type="primary" @click="addRouteInstruction">添加指令</el-button>
          </div>
        </el-form-item>

        <el-form-item label="发送前的脱敏规则" help="命中正则即替换；规则会同时作用在页面内容与指令上">
          <div class="list-editor">
            <div v-for="(rule, index) in draft.maskRules" :key="index" class="list-row list-row--mask">
              <el-switch v-model="rule.enabled" size="small" />
              <el-input v-model="rule.label" placeholder="名称" />
              <el-input v-model="rule.pattern" class="mono-input" placeholder="正则，如 1[3-9]\\d{9}" />
              <el-input v-model="rule.replacement" placeholder="替换为" />
              <el-button :icon="Delete" text type="danger" @click="removeMaskRule(index)">删除</el-button>
            </div>
            <el-button :icon="Plus" text type="primary" @click="addMaskRule">添加规则</el-button>
          </div>
        </el-form-item>

        <el-form-item label="全局补充指令" help="追加在库内置系统提示之后，用来交代本后台的术语与禁忌">
          <el-input v-model="draft.systemInstructions" type="textarea" :rows="4" placeholder="例如：本系统为工控后台，删除操作必须二次确认；不要自行提交表单。" />
        </el-form-item>

        <el-form-item label="完全接管系统提示（高级）" help="留空使用库内置提示；填入后整段替换，写错会让助手失效">
          <el-input v-model="draft.customSystemPrompt" type="textarea" :rows="4" class="mono-input" placeholder="留空即使用内置提示" />
        </el-form-item>
      </section>

      <!-- 试跑：直接在当前页面验证配置，避免去别的页面猜。 -->
      <section class="panel">
        <div class="panel-title">
          <h2>试运行</h2>
          <span>当前状态：{{ stateLabel[runtime.state.value] ?? runtime.state.value }}</span>
        </div>
        <div class="try-row">
          <el-button :icon="Promotion" type="primary" @click="runDemo">在当前页面试跑</el-button>
          <el-button :icon="VideoPlay" @click="runtime.open()">打开面板</el-button>
          <span class="field-hint">试跑用的是已保存的设置；改完参数请先保存。</span>
        </div>
        <p v-if="runtime.error.value" class="try-error">{{ runtime.error.value }}</p>
        <p v-if="!appRuntime.pluginEnabled('page-agent')" class="try-error">插件已停用：到插件中心启用后再试。</p>
      </section>
    </el-form>
  </div>
</template>

<style scoped>
.page-agent code { font-family: ui-monospace, monospace; font-size: 11.5px; background: var(--surface-soft); border-radius: 4px; padding: 1px 4px; }
.agent-form { display: flex; flex-direction: column; gap: 16px; }
.probe-alert { margin-bottom: 4px; }
.field-hint { margin: 6px 0 0; font-size: 11.5px; line-height: 1.7; color: var(--muted); }
.mono-input :deep(input), .mono-input :deep(textarea) { font-family: ui-monospace, monospace; font-size: 12px; }
.key-row { display: flex; gap: 6px; width: 100%; align-items: center; }
.color-cell { display: flex; gap: 6px; width: 100%; align-items: center; }
.color-cell :deep(.el-color-picker__trigger) { width: 24px; height: 24px; padding: 2px; }
.switch-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.switch-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.switch-row div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.switch-row strong { font-size: 13px; color: var(--app-text); font-weight: 600; }
.switch-row small { font-size: 11.5px; line-height: 1.6; color: var(--muted); }
.list-editor { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.list-row { display: flex; gap: 6px; align-items: center; }
.list-row--stack { align-items: flex-start; flex-wrap: wrap; }
.list-row--stack :deep(.el-input) { flex: 1 1 240px; }
.list-row--mask { display: grid; grid-template-columns: 40px 120px minmax(0, 1.4fr) minmax(0, .8fr) 70px; }
.preview-stage { margin-top: 8px; padding: 16px; border: 1px dashed var(--line-strong); border-radius: var(--radius); background: var(--surface-soft); position: relative; overflow: hidden; }
.preview-caption { font-size: 11px; color: var(--muted); }
.preview-panel { margin: 10px auto 42px; max-width: 100%; box-shadow: 0 8px 20px rgba(15, 23, 42, .18); overflow: hidden; }
.preview-panel__head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; color: #fff; font-size: 12px; font-weight: 600; }
.preview-panel__head .dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.preview-panel__head .chev { margin-left: auto; opacity: .8; }
.preview-input { background: rgba(255, 255, 255, .28); color: rgba(255, 255, 255, .9); font-size: 11.5px; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; }
.preview-launcher { position: absolute; right: 18px; bottom: 14px; display: inline-flex; align-items: center; gap: 5px; padding: 8px 13px; font-size: 12px; font-weight: 600; box-shadow: 0 8px 18px rgba(15, 23, 42, .22); }
.try-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.try-error { margin: 10px 0 0; font-size: 12px; color: var(--el-color-danger); }
@media (max-width: 1100px) {
  .switch-grid { grid-template-columns: 1fr; }
  .list-row--mask { grid-template-columns: 40px minmax(0, 1fr); }
}
</style>
