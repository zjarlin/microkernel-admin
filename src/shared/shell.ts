// 应用外壳共享状态：三栏布局服务 + 右栏面板的单一来源。
//
// 为什么放在模块里而不是 AdminLayout 的局部变量：右栏内容由页面提供（组态检查器、
// 通用页面详情之类），页面需要拿到同一份布局服务才能「打开右栏」，否则会各自再写一套
// 宽度与开关状态，出现两份真相。
import { reactive } from 'vue'
import { createLayout, type LayoutService } from '@addzero/app-frame'

const STORAGE_KEY = 'micro-admin.layout'

/** 整机唯一的三栏布局服务；宽度、收起与右栏几何都持久化在浏览器里。 */
export const appLayout: LayoutService = createLayout({
  storageKey: STORAGE_KEY,
  storage: {
    read: () => localStorage.getItem(STORAGE_KEY),
    write: (value) => localStorage.setItem(STORAGE_KEY, value),
  },
})

/** 右栏内容的声明；同一时刻只有一个持有者（右栏只有一条轨道）。 */
export interface RightPanelDescriptor {
  /** 稳定 id，用于「谁开的谁关」判断，不会展示给用户。 */
  id: string
  title: string
  /** 一句话说明，显示在右栏标题下方。 */
  hint?: string
}

const rightState = reactive<{ active: RightPanelDescriptor | null }>({ active: null })

/**
 * 打开右栏并声明内容提供者。后开的替换先开的：
 * 例如在组态页点「布局设置」时，检查器让位给设置面板，关掉后由页面自己决定是否重开。
 */
export function openRightPanel(descriptor: RightPanelDescriptor): void {
  rightState.active = { ...descriptor }
  appLayout.openRightbar(true, false)
}

/** 只有当前持有者能关闭，避免路由切换时后挂载的页面被前一个页面的 cleanup 关掉。 */
export function closeRightPanel(id?: string): void {
  if (id && rightState.active && rightState.active.id !== id) return
  rightState.active = null
  appLayout.closeRightbar()
}

/** 右栏宿主元素 id：页面用 `<Teleport to="#...">` 把内容投进来。 */
export const RIGHT_PANEL_HOST_ID = 'app-frame-rightbar-content'

/**
 * 更新标题/说明（只对当前持有者生效）。页面把「选中了几个图元」这类随交互变化的信息
 * 同步到右栏标题栏，而不是自己再画一个头部。
 */
export function updateRightPanel(id: string, patch: Partial<Omit<RightPanelDescriptor, 'id'>>): void {
  if (rightState.active?.id !== id) return
  rightState.active = { ...rightState.active, ...patch }
}

export function useRightPanel() {
  return rightState
}
