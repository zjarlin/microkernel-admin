<script setup lang="ts">
// 画布 AI 入口：全站级按钮，紧挨着页面助手，只做一件事——把组态右栏切到 AI 页签。
//
// 为什么不把入口也放进画布工具条：那会变成「同一动作两个入口」。入口只留一处（顶栏，
// 页面助手旁边），画布工具条只留「属性」。没打开画布时按钮自动隐藏——
// 一个点了没反应的按钮不如不存在。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Brush } from '@element-plus/icons-vue'
import { SCADA_PANEL_ID, toggleScadaPanel, useScadaWorkbench } from '@/plugins/scada/workbench'
import { useRightPanel } from '@/shared/shell'

const route = useRoute()
const workbench = useScadaWorkbench()
const rightPanel = useRightPanel()

/** 组态画布页签正开着（`/canvas?tab=scada.workbench`），或者组态右栏本身开着。 */
const visible = computed(() =>
  (route.path === '/canvas' && route.query.tab === 'scada.workbench') || workbench.active.value,
)
const active = computed(() => rightPanel.active?.id === SCADA_PANEL_ID && workbench.panelTab.value === 'ai')

function open(): void {
  toggleScadaPanel('ai', '自然语言改画布：生成指令 → 预览 → 应用')
}
</script>

<template>
  <el-tooltip
    v-if="visible"
    content="画布 AI：自然语言改当前组态画布（也可以直接用页面助手说「画一张……」）"
    placement="bottom"
    :show-after="300"
  >
    <button
      type="button"
      class="canvas-ai-entry"
      :class="{ 'is-open': active }"
      aria-label="画布 AI"
      @click="open"
    >
      <el-icon :size="17"><Brush /></el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped>
/* 与页面助手入口同高同宽，顶栏那一排不允许忽高忽低。 */
.canvas-ai-entry {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 34px; height: 34px; padding: 0 9px;
  border: 1px solid var(--line); border-radius: 999px;
  background: var(--surface); color: var(--muted); cursor: pointer;
  transition: color .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
.canvas-ai-entry:hover {
  color: var(--brand); border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--surface));
}
.canvas-ai-entry.is-open {
  color: #fff; border-color: transparent;
  background: linear-gradient(135deg, #3b82f6, #22d3ee);
  box-shadow: 0 6px 16px rgba(37, 99, 235, .28);
}
</style>
