// layout 服务：与 dsh 的 `ctx.layout` 同形，是「面板导航 + 几何」的唯一写入口。
//
// - 几何（侧栏宽度/收起、右栏宽度/全屏）由本模块的状态持有并持久化；
// - 中栏面板（settings、画布之类）通过 `registerPanel` 登记，`selectPanel` 只认登记过的 id；
// - `beginNavigation` 返回的 AbortSignal 会在下一次导航或销毁时中止，异步页面据此丢弃过期结果。
//
// 组件不直接改宽度，而是走这里的方法，因此拖拽、快捷键、插件命令共享同一条语义。
import { reactive, readonly } from 'vue'
import { RIGHTBAR_DEFAULT_RATIO, SIDEBAR_DEFAULT } from './columns.ts'

/** 布局持久化形状（只存用户偏好，不存视口推导值）。 */
export interface LayoutSnapshot {
  sidebarWidth: number
  rightbarWidth: number
  sidebarCollapsed: boolean
  rightbarFullscreen: boolean
}

/** 布局的可写状态。 */
export interface LayoutState extends LayoutSnapshot {
  /** 当前中栏面板 id；null 表示主题页面本身（路由 view）。 */
  activePanelId: string | null
}

/** 布局动作面（宿主与插件都只依赖这一层）。 */
export interface LayoutService {
  readonly state: Readonly<LayoutState>
  /** 侧栏收起 ⟷ 回到默认宽度。 */
  toggleSidebar(): void
  /** 收起侧栏。 */
  closeSidebar(): void
  /** 展开侧栏。 */
  openSidebar(): void
  /** 设置侧栏宽度（会被夹到契约区间）。 */
  setSidebarWidth(px: number): void
  /** 选择中栏面板；未登记的 id 抛错并保留原选择。 */
  selectPanel(id: string | null): void
  /** 开始一次异步导航，返回可被下一次导航中止的信号。 */
  beginNavigation(): AbortSignal
  /** 打开右栏：track 决定是否占用正常轨道，fullscreen 决定是否覆盖整帧。 */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** 设置右栏宽度。 */
  setRightbarWidth(px: number): void
  /** 关闭右栏（不占轨道、不显示手柄）。 */
  closeRightbar(): void
  /** 登记一个中栏面板 id，返回注销函数。 */
  registerPanel(id: string): () => void
  /** 中栏面板是否已登记。 */
  hasPanel(id: string): boolean
  /** 恢复默认布局。 */
  reset(): void
}

export interface CreateLayoutOptions {
  /** 持久化键；缺省不持久化（测试与嵌入式场景）。 */
  storageKey?: string
  /** 初始右栏比例覆盖（视口未知时用 0.45 的默认值）。 */
  rightbarRatio?: number
  /** 把状态变化写回存储的实现，默认 `localStorage`。 */
  storage?: { read(): string | null; write(value: string): void }
  /** 视口宽度来源，用于把比例换算成像素；缺省取 `window.innerWidth`。 */
  viewport?: () => number
}

/** 读回持久化快照；结构不符就回到默认值，绝不带着半截状态启动。 */
function readSnapshot(storage: CreateLayoutOptions['storage']): Partial<LayoutSnapshot> | null {
  if (!storage) return null
  try {
    const raw = storage.read()
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LayoutSnapshot>
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 创建一份布局状态与服务。
 *
 * 一个宿主只创建一次（通常在应用装配阶段），然后 `provide` 给整棵组件树。
 */
export function createLayout(options: CreateLayoutOptions = {}): LayoutService {
  const { storageKey, storage, rightbarRatio = RIGHTBAR_DEFAULT_RATIO } = options
  const viewport = options.viewport ?? ((): number => (typeof window === 'undefined' ? 1440 : window.innerWidth))

  // 只有一个持久化键时不必再传 key：storage 适配器已经绑定到该键。
  const saved = storageKey && storage ? readSnapshot(storage) : null
  const ratioWidth = Math.round(viewport() * rightbarRatio)

  const state = reactive<LayoutState>({
    sidebarWidth: typeof saved?.sidebarWidth === 'number' && saved.sidebarWidth > 0
      ? saved.sidebarWidth
      : SIDEBAR_DEFAULT,
    // 右栏默认关闭（宽度 0）：需要它的页面显式 `openRightbar(true, ...)` 才占轨道，
    // 否则每个页面都会顶出一条空白栏。
    rightbarWidth: typeof saved?.rightbarWidth === 'number' && saved.rightbarWidth > 0
      ? saved.rightbarWidth
      : 0,
    sidebarCollapsed: saved?.sidebarCollapsed === true,
    rightbarFullscreen: saved?.rightbarFullscreen === true,
    activePanelId: null,
  })

  const panels = new Set<string>()
  let navigation = new AbortController()

  function persist(): void {
    if (!storageKey || !storage) return
    const snapshot: LayoutSnapshot = {
      sidebarWidth: state.sidebarWidth,
      rightbarWidth: state.rightbarWidth,
      sidebarCollapsed: state.sidebarCollapsed,
      rightbarFullscreen: state.rightbarFullscreen,
    }
    storage.write(JSON.stringify(snapshot))
  }

  const service: LayoutService = {
    get state() {
      return readonly(state) as Readonly<LayoutState>
    },
    toggleSidebar() {
      state.sidebarCollapsed = !state.sidebarCollapsed
      persist()
    },
    closeSidebar() {
      state.sidebarCollapsed = true
      persist()
    },
    openSidebar() {
      state.sidebarCollapsed = false
      if (state.sidebarWidth <= 0) state.sidebarWidth = SIDEBAR_DEFAULT
      persist()
    },
    setSidebarWidth(px) {
      // 拖动到 0 表示完全隐藏轨道（桌面端折叠），其余交给 AppFrame 夹取。
      state.sidebarWidth = px <= 0 ? 0 : Math.round(px)
      state.sidebarCollapsed = px <= 0
      persist()
    },
    selectPanel(id) {
      if (id !== null && !panels.has(id)) {
        throw new Error(`layout.selectPanel: 中栏面板 "${id}" 未登记`)
      }
      navigation.abort()
      navigation = new AbortController()
      state.activePanelId = id
    },
    beginNavigation() {
      navigation.abort()
      navigation = new AbortController()
      return navigation.signal
    },
    openRightbar(track, fullscreen) {
      if (track && state.rightbarWidth <= 0) state.rightbarWidth = ratioWidth
      state.rightbarFullscreen = fullscreen
      persist()
    },
    setRightbarWidth(px) {
      state.rightbarWidth = Math.max(0, Math.round(px))
      persist()
    },
    closeRightbar() {
      state.rightbarWidth = 0
      state.rightbarFullscreen = false
      persist()
    },
    registerPanel(id) {
      panels.add(id)
      return () => {
        panels.delete(id)
        if (state.activePanelId === id) state.activePanelId = null
      }
    },
    hasPanel(id) {
      return panels.has(id)
    },
    reset() {
      state.sidebarWidth = SIDEBAR_DEFAULT
      state.rightbarWidth = 0
      state.sidebarCollapsed = false
      state.rightbarFullscreen = false
      state.activePanelId = null
      persist()
    },
  }

  return service
}
