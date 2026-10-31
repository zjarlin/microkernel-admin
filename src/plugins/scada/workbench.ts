// 组态工作台的公开句柄：插件之间只通过这个接口协作。
//
// 为什么需要它：AI 助手（另一个插件）要给画布加图元，但不能 import 页面组件，
// 也不该复制一份画布状态。页面在挂载时把自己的读写能力挂到这里，其它插件按接口取用；
// 页面卸载即解绑，插件面板据此判断「当前有没有画布可用」。
//
// 同一个句柄还持有「右栏当前停在哪个页签」：AI 入口（工具条与顶栏）都要能把右栏切到
// AI 页签，而页签是画布页面的一部分状态。让页面自己暴露一次，比让每个调用方各写一套
// 「先开右栏、再想办法通知页面切页签」的旁路可靠得多。
import { computed, ref } from 'vue'
import type { ScadaDocument, ScadaSymbolDefinition, ScadaTagOption } from '@/shared/scada/types'
import { closeRightPanel, useRightPanel } from '@/shared/shell'

export const SCADA_PANEL_ID = 'scada.inspector'
export type ScadaPanelTab = 'inspector' | 'ai'

export interface ScadaWorkbenchHandle {
  /** 当前文档（只读快照，调用方不要就地改）。 */
  readDocument: () => ScadaDocument
  readSymbols: () => ScadaSymbolDefinition[]
  readTags: () => ScadaTagOption[]
  readSelection: () => string[]
  /** 用新文档替换画布内容，并标记为未保存。 */
  writeDocument: (document: ScadaDocument) => void
  /** 当前打开的画面 id；没有打开画面时为 null。 */
  readScreenId: () => number | null
  /** 重新从后端拉当前画面（服务端改过画面之后用）。 */
  reload: () => Promise<void>
  /** 把外壳右栏切到指定页签并打开；AI 页签没有贡献时返回 false（调用方需要回退）。 */
  openPanel: (tab: ScadaPanelTab, hint?: string | undefined) => boolean
  /** 关掉右栏。 */
  closePanel: () => void
}

const handle = ref<ScadaWorkbenchHandle | null>(null)
/** 右栏页签：属性 / AI 助手（AI 页签来自 ai 插件贡献的槽位，插件禁用即消失）。 */
const panelTab = ref<ScadaPanelTab>('inspector')

/** 页面挂载时调用；返回解绑函数（页面卸载时执行）。 */
export function attachScadaWorkbench(next: ScadaWorkbenchHandle): () => void {
  handle.value = next
  return () => {
    if (handle.value === next) handle.value = null
  }
}

/** 其它插件用这个读工作台；`active` 为 false 时说明当前没有打开的组态画面。 */
export function useScadaWorkbench() {
  return {
    handle,
    panelTab,
    active: computed(() => handle.value !== null),
  }
}

/** 右栏当前是否就是组态的图元属性/AI 面板。 */
export function scadaPanelOpen(): boolean {
  return useRightPanel().active?.id === SCADA_PANEL_ID
}

/**
 * 从任何地方（画布工具条、顶栏 AI 入口）打开或收起组态右栏。
 *
 * `hint` 由调用方给，因为「选中了几个图元」只有页面知道。
 */
export function toggleScadaPanel(tab: ScadaPanelTab, hint?: string | undefined): boolean {
  const workbench = handle.value
  if (!workbench) return false
  if (scadaPanelOpen() && panelTab.value === tab) {
    closeRightPanel(SCADA_PANEL_ID)
    return true
  }
  return workbench.openPanel(tab, hint)
}

