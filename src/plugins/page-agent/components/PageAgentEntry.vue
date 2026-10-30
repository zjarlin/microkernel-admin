<script setup lang="ts">
// 页面助手的全站入口：外壳顶栏的一个 AI 图标。
//
// 这里只做「唤起/收起」；面板由 PageAgent 库自己渲染在 body 上，
// 因此换页、开合右栏都不会重建实例。入口是否出现、长什么样都来自后端入口视图，
// 不在组件里写第二份默认值。
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { useService } from '@/shared/service'
import type { PageAgentRuntime } from '../runtime'

const runtime = useService<PageAgentRuntime>('page-agent.runtime')

const visible = runtime.available
const state = runtime.state
const panelOpen = runtime.panelOpen
const entry = runtime.entry

const running = computed(() => state.value === 'running')
const label = computed(() => entry.value.label || '页面助手')

/** 未配置完整时也保留入口，但把原因说清楚，别让用户点了没反应。 */
const hint = computed(() =>
  runtime.canRun.value ? `${label.value}（AI 直接操作当前页面）` : `${label.value}：当前不可用，点击查看原因`,
)

async function activate(): Promise<void> {
  await runtime.toggle()
  if (!runtime.panelOpen.value && runtime.error.value) ElMessage.warning(runtime.error.value)
}
</script>

<template>
  <el-tooltip v-if="visible" :content="hint" placement="bottom" :show-after="260">
    <button
      type="button"
      class="ai-entry"
      :class="{ 'is-open': panelOpen, 'is-running': running }"
      :style="{ '--ai-entry-accent': entry.accent }"
      :aria-label="label"
      @click="activate"
    >
      <el-icon :size="17"><MagicStick /></el-icon>
      <span v-if="entry.showLabel" class="ai-entry__label">{{ label }}</span>
      <i v-if="running" class="ai-entry__dot" aria-hidden="true" />
    </button>
  </el-tooltip>
</template>

<style scoped>
/* 与顶栏其他圆形图标按钮同高同宽，避免这一排忽高忽低。 */
.ai-entry {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  transition: color .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
.ai-entry:hover {
  color: var(--ai-entry-accent);
  border-color: var(--ai-entry-accent);
  background: color-mix(in srgb, var(--ai-entry-accent) 8%, var(--surface));
}
.ai-entry.is-open {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #3b82f6, #22d3ee);
  box-shadow: 0 6px 16px rgba(37, 99, 235, .28);
}
.ai-entry.is-running { color: var(--ai-entry-accent); }
.ai-entry__label { white-space: nowrap; }
/* 跑任务时留一个小呼吸点，避免用户重复点入口。 */
.ai-entry__dot {
  position: absolute;
  top: 5px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: ai-entry-pulse 1.1s ease-in-out infinite;
}
@keyframes ai-entry-pulse {
  0%, 100% { opacity: .35; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1); }
}
/* 顶栏变窄时优先收文案，入口本身始终保留。 */
@container shell (max-width: 1040px) {
  .ai-entry__label { display: none; }
}
</style>
