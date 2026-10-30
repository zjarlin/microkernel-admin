// 三栏应用框架门面。
//
// 与 dsh 的对齐关系：`columns.ts` 是 `ui-layout/columns.ts` 的逐条移植（MIT），
// `layout.ts` 对应 `ctx.layout`（selectPanel / beginNavigation / toggleSidebar /
// openRightbar / closeRightbar），`AppFrame.vue` 对应 `AppFrame.tsx` 的 Vue 版。
import AppFrame from './AppFrame.vue'

export { AppFrame }
export type { AppFrameHandle } from './types.ts'

export {
  CENTER_COMFORT,
  CENTER_MIN,
  RIGHTBAR_DEFAULT_RATIO,
  RIGHTBAR_MAX_RATIO,
  RIGHTBAR_MIN,
  RIGHTBAR_OVERLAY_BELOW,
  RIGHTBAR_OVERLAY_MAX,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
  defaultRightbarWidth,
  overlayRightbarWidth,
  rightbarCap,
  rightbarOverlays,
  expandSidebarWidth,
} from './columns.ts'
export type { Columns } from './columns.ts'

export { createLayout } from './layout.ts'
export type {
  CreateLayoutOptions,
  LayoutService,
  LayoutSnapshot,
  LayoutState,
} from './layout.ts'

export { LAYOUT_KEY, provideLayout, useLayout, useOptionalLayout } from './context.ts'
