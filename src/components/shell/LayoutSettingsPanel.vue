<script setup lang="ts">
// 布局设置：外壳右栏的常驻内容（若依「布局设置」抽屉的对应物）。
// 只调用布局服务的公开方法，不直接读写下层状态，和拖拽手柄走同一条语义。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  RIGHTBAR_MIN, RIGHTBAR_OVERLAY_BELOW, SIDEBAR_MAX, SIDEBAR_MIN, overlayRightbarWidth, rightbarOverlays,
} from '@addzero/app-frame'
import { appLayout } from '@/shared/shell'

const state = appLayout.state

const sidebarWidth = computed({
  get: () => state.sidebarWidth || SIDEBAR_MIN,
  set: (value: number) => appLayout.setSidebarWidth(value),
})

/**
 * 右栏宽度显示「真正生效的值」。
 *
 * 记住的偏好可能是 957px，但在 1512px 屏上中栏要留 720px，实际只能给 484px。
 * 若这里显示 957，用户会以为设置没生效；所以读侧夹一次上限，写入仍交给布局服务。
 */
const rightbarWidth = computed({
  get: () => Math.min(state.rightbarWidth || RIGHTBAR_MIN, rightbarMax.value),
  set: (value: number) => appLayout.setRightbarWidth(value),
})

const rightbarMax = computed(() => appLayout.maxRightbarWidth())

/**
 * 窄屏下右栏是浮层，宽度由外壳按帧宽给定，滑块上的像素值不再决定布局。
 *
 * 这里把窗口宽度做成响应式，只为在说明里写清「为什么拖了没变化」，
 * 不参与任何几何计算（几何只认外壳里的 ResizeObserver）。
 */
const viewport = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const overlayMode = computed(() => rightbarOverlays(viewport.value))
const overlayWidth = computed(() => overlayRightbarWidth(viewport.value))
function onResize(): void {
  viewport.value = window.innerWidth
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

/**
 * 侧栏开关：按开关给出的目标值显式设置，而不是「切一下」。
 *
 * 之前用 toggle 忽略传入值：开关状态与侧栏实际收起状态一旦漂移（窄屏自动收起、
 * 或两次快速点击）就再也对不上，用户会看到「开关是开的、侧栏还是全宽」。
 */
function setCollapsed(collapsed: boolean): void {
  if (collapsed) appLayout.closeSidebar()
  else appLayout.openSidebar()
}

/** el-switch 的回调写成方法而不是模板内联箭头函数，避免模板类型推导踩到边界。 */
function setFullscreen(fullscreen: boolean): void {
  appLayout.openRightbar(true, fullscreen)
}
</script>

<template>
  <div class="layout-settings">
    <section class="layout-settings__group">
      <h3>侧栏</h3>
      <div class="layout-settings__row">
        <span>收起为图标轨道</span>
        <el-switch
          :model-value="state.sidebarCollapsed"
          @update:model-value="(value: string | number | boolean) => setCollapsed(Boolean(value))"
        />
      </div>
      <div class="layout-settings__row layout-settings__row--stack">
        <span>宽度 <b>{{ sidebarWidth }}px</b></span>
        <el-slider v-model="sidebarWidth" :min="SIDEBAR_MIN" :max="SIDEBAR_MAX" :step="4" size="small" :show-tooltip="false" />
      </div>
    </section>

    <section class="layout-settings__group">
      <h3>右栏</h3>
      <div class="layout-settings__row">
        <span>全屏覆盖</span>
        <el-switch
          :model-value="state.rightbarFullscreen"
          @update:model-value="setFullscreen"
        />
      </div>
      <div v-if="overlayMode" class="layout-settings__row layout-settings__row--stack">
        <span>浮层宽度 <b>{{ overlayWidth }}px</b></span>
      </div>
      <div v-else class="layout-settings__row layout-settings__row--stack">
        <span>宽度 <b>{{ rightbarWidth }}px</b></span>
        <el-slider v-model="rightbarWidth" :min="RIGHTBAR_MIN" :max="rightbarMax" :step="8" size="small" :show-tooltip="false" />
      </div>
      <!-- 轨道模式的上限来自「中栏至少留 720px」，不是固定值；写出来用户才知道为什么拖不动。 -->
      <p v-if="overlayMode" class="layout-settings__note">
        窗口窄于 {{ RIGHTBAR_OVERLAY_BELOW }}px：右栏改为浮层覆盖在内容上（关闭后恢复原样），
        中栏保持满宽，表格不再被压。放大窗口即回到并排轨道。
      </p>
      <p v-else class="layout-settings__note">当前窗口下最大 {{ rightbarMax }}px：中栏始终保留至少 720px，表格不会被右栏压成一条缝。</p>
    </section>

    <section class="layout-settings__group">
      <h3>快捷键</h3>
      <p class="layout-settings__hint">
        <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>B</kbd> 切换侧栏；拖拽栏间隙可调宽，
        聚焦手柄后方向键每次 16px。宽度与收起状态记在本机。
      </p>
    </section>

    <el-button class="layout-settings__reset" plain @click="appLayout.reset()">恢复默认布局</el-button>
  </div>
</template>

<style scoped>
.layout-settings { display: flex; flex-direction: column; gap: 18px; padding: 16px; flex: 1; min-height: 0; overflow: auto; }
.layout-settings__group { border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.layout-settings__group h3 { margin: 0 0 10px; font-size: 13px; color: var(--app-text); letter-spacing: .02em; }
.layout-settings__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--muted); }
.layout-settings__row + .layout-settings__row { margin-top: 10px; }
.layout-settings__row--stack { flex-direction: column; align-items: stretch; gap: 2px; }
.layout-settings__row b { color: var(--app-text); font-weight: 600; }
.layout-settings__note { margin: 2px 0 0; font-size: 11.5px; line-height: 1.6; color: var(--muted); }
.layout-settings__hint { margin: 0; font-size: 12px; line-height: 1.8; color: var(--muted); }
.layout-settings__hint kbd { padding: 1px 5px; border: 1px solid var(--line-strong); border-radius: 4px; font-size: 11px; font-family: ui-monospace, monospace; }
.layout-settings__reset { width: 100%; }
</style>
