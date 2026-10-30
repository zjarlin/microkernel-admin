// 三栏几何：右栏先让位（收窄 → 取消轨道），然后中栏才允许掉到最小宽度以下；
// 侧栏在正常区间内不参与让位，是否收起由 `AppFrame` 的响应式判定单独决定。
//
// 算法移植自 DeepSeek Harness `packages/client/ui-layout/src/client/columns.ts`
// （MIT，https://github.com/deepseek-ai/deepseek-harness），保持同样的常量与求解顺序，
// 这样「原型画布上的三栏手感」与 dsh 一致；本文件不含 React 依赖，是纯函数。

/** 一帧解析出的三栏宽度。 */
export interface Columns {
  sidebar: number
  center: number
  rightbar: number
}

/** 右栏展开时中栏保留的硬下限（再窄就只能靠表格横向滚动）。 */
export const CENTER_MIN = 400
/**
 * 中栏「舒适」宽度：右栏不给到这个数以下就不许再涨。
 *
 * 之前只守 CENTER_MIN=400：一旦用户把右栏拖到 957px（或从更宽的屏幕带过来），
 * 1512px 屏上中栏就只剩 400px，表格被压成一条缝——用户看到的就是「表格压到右栏上」。
 * 400 只作为极端兜底，正常让位以 720 为界（够放 6~7 列表格 + 分页）。
 */
export const CENTER_COMFORT = 720
/** 侧栏拖拽下限。 */
export const SIDEBAR_MIN = 264
/** 侧栏拖拽上限。 */
export const SIDEBAR_MAX = 420
/** 用户拖拽前的侧栏宽度。 */
export const SIDEBAR_DEFAULT = 280
/** 收起态侧栏：图标轨道宽度。 */
export const SIDEBAR_COLLAPSED = 56
/** 低于该视口宽度时侧栏自动收成轨道；手动展开则覆盖中栏。 */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** 右栏拖拽下限。 */
export const RIGHTBAR_MIN = 300
/** 右栏上限占整帧的比例。 */
export const RIGHTBAR_MAX_RATIO = 0.7
/**
 * 右栏首次展开时占整帧的比例。
 *
 * 0.45（dsh 原值）在 1440 宽度下会吃掉 648px，中栏只剩 500 出头，表格立刻横向滚动；
 * 这里收到 0.32，中栏仍能放下常规表格，需要更宽时用户自己拖。
 */
export const RIGHTBAR_DEFAULT_RATIO = 0.32

/** 把面板宽度夹到契约区间内。 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * 求解一帧的三栏宽度。
 *
 * @param viewport - 可用帧宽（px）
 * @param sidebar - 侧栏宽度偏好（0 表示收起）
 * @param rightbar - 请求的右栏宽度（0 表示不占轨道）
 * @param collapsedWidth - 侧栏收起时的轨道宽度；默认保留图标轨道，0 表示完全隐藏（桌面端）
 */
export function computeColumns(
  viewport: number,
  sidebar: number,
  rightbar: number,
  collapsedWidth = SIDEBAR_COLLAPSED,
): Columns {
  const s = sidebar === 0 ? collapsedWidth : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const hardAvailable = viewport - s - CENTER_MIN
  const r = rightbar === 0 || hardAvailable < RIGHTBAR_MIN
    ? 0
    : Math.min(
        hardAvailable,
        rightbarCap(viewport, s),
        clampWidth(rightbar, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO),
      )
  return { sidebar: s, center: Math.max(0, viewport - s - r), rightbar: r }
}

/**
 * 右栏在给定帧宽/侧栏宽度下的实际上限。
 *
 * 取三者最小：帧宽比例、中栏舒适宽度让位后的余量、硬下限余量。
 * 布局设置的滑块与「记住的宽度回填」都用它，保证界面显示的数值就是真实生效值。
 */
export function rightbarCap(viewport: number, sidebar: number): number {
  const s = sidebar <= 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const comfort = viewport - s - CENTER_COMFORT
  const hard = viewport - s - CENTER_MIN
  return Math.max(RIGHTBAR_MIN, Math.min(viewport * RIGHTBAR_MAX_RATIO, comfort, hard))
}

/** 右栏首次展开的默认宽度。 */
export function defaultRightbarWidth(viewport: number): number {
  return Math.max(RIGHTBAR_MIN, Math.round(viewport * RIGHTBAR_DEFAULT_RATIO))
}

/** 侧栏收起/展开时的偏好宽度（展开回到契约默认值）。 */
export function expandSidebarWidth(): number {
  return SIDEBAR_DEFAULT
}
