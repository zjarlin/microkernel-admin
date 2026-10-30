<script setup lang="ts">
// 源定位入口：外壳顶栏的一个「瞄准」按钮，激活后在页面上点任何元素都能看到源码位置。
//
// 与 ⌘/Ctrl+⇧+E 走同一个开关：按钮只负责唤起/收起，视觉状态来自运行时服务，
// 因此用快捷键激活时按钮也会亮起来，不会出现「两种激活方式两个状态」。
import { computed } from 'vue'
import { Aim } from '@element-plus/icons-vue'
import { useService } from '@/shared/service'
import type { SourceFinderRuntime } from '../picker'

const runtime = useService<SourceFinderRuntime>('source-finder.runtime')
const active = runtime.active
const last = runtime.lastPick

const hint = computed(() => {
  if (active.value) return '正在拾取：点页面元素查看源码位置（Esc 退出）'
  const picked = last.value?.location
  return picked ? `上次定位：${picked.file}:${picked.line}` : '元素定位：点页面元素跳到源码（⌘/Ctrl+⇧+E）'
})
</script>

<template>
  <el-tooltip :content="hint" placement="bottom" :show-after="200">
    <button
      type="button"
      class="source-entry"
      :class="{ 'is-active': active }"
      :aria-pressed="active"
      aria-label="元素定位"
      @click="runtime.toggle()"
    >
      <el-icon :size="17"><Aim /></el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped>
/* 与顶栏其他圆形图标按钮同尺寸，激活态用品牌色描边而不是改高度。 */
.source-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: color .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
.source-entry:hover { color: var(--brand); border-color: var(--brand); }
.source-entry.is-active {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  box-shadow: 0 6px 16px rgba(37, 99, 235, .28);
}
</style>
