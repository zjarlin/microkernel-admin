<script setup lang="ts">
// 三栏应用框架：侧栏（可收起）+ 中栏（路由/面板）+ 右栏（检查器，可全屏覆盖）。
//
// 几何全部来自 `columns.ts` 的纯函数，拖拽只改偏好值，不直接写像素：
// 视口变化时同一份偏好会重新求解，因此窗口缩放不会把面板挤成负数。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  RIGHTBAR_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
  expandSidebarWidth,
} from './columns.ts'
import { provideLayout } from './context.ts'
import type { LayoutService } from './layout.ts'

const props = withDefaults(
  defineProps<{
    /** 布局服务；宿主用 `createLayout()` 创建并传进来。 */
    layout: LayoutService
    /** 收起态侧栏轨道宽度（0 = 完全隐藏）。 */
    collapsedWidth?: number
    /** 是否启用 Ctrl/Cmd+B 切换侧栏。 */
    shortcut?: boolean
  }>(),
  { collapsedWidth: 56, shortcut: true },
)

provideLayout(props.layout)

const root = ref<HTMLElement | null>(null)
const viewport = ref(1440)
const narrowExpanded = ref(false)

const state = props.layout.state
const narrow = computed(() => viewport.value < SIDEBAR_AUTO_COLLAPSE)
const collapsed = computed(() => (narrow.value && !narrowExpanded.value) || state.sidebarCollapsed)
const rightTrack = computed(() => state.rightbarWidth > 0)

const columns = computed(() => {
  const sidebarPref = collapsed.value ? 0 : state.sidebarWidth
  return computeColumns(viewport.value, sidebarPref, state.rightbarWidth, props.collapsedWidth)
})

const sidebarWidth = computed(() => (collapsed.value ? props.collapsedWidth : columns.value.sidebar))
const rightWidth = computed(() => (rightTrack.value ? columns.value.rightbar : 0))

function measure(): void {
  viewport.value = root.value?.clientWidth ?? window.innerWidth
}

let observer: ResizeObserver | null = null

function toggleSidebar(): void {
  // 窄屏下第一次点击是「临时展开」，再点是「收起」，不会把偏好宽度写坏。
  if (narrow.value) {
    narrowExpanded.value = !narrowExpanded.value
    return
  }
  props.layout.toggleSidebar()
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.shortcut) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    toggleSidebar()
  }
}

onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  if (props.shortcut) window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (props.shortcut) window.removeEventListener('keydown', onKeydown)
})

// --- 拖拽 -------------------------------------------------------------------

type DragTarget = 'sidebar' | 'rightbar'
const dragging = ref<DragTarget | null>(null)

function startDrag(target: DragTarget, event: PointerEvent): void {
  event.preventDefault()
  dragging.value = target
  const startX = event.clientX
  const startWidth = target === 'sidebar' ? sidebarWidth.value : columns.value.rightbar
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture?.(event.pointerId)

  const onMove = (move: PointerEvent): void => {
    const delta = move.clientX - startX
    if (target === 'sidebar') {
      const next = clampWidth(startWidth + delta, SIDEBAR_MIN, SIDEBAR_MAX)
      props.layout.setSidebarWidth(next)
      return
    }
    // 右栏向左拖变宽，因此取负号。
    const next = clampWidth(startWidth - delta, RIGHTBAR_MIN, viewport.value * 0.7)
    props.layout.setRightbarWidth(next)
  }

  const onUp = (): void => {
    dragging.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

/** 键盘调宽：无障碍与精确调整用（左右方向键各 ±16px）。 */
function nudge(target: DragTarget, direction: -1 | 1): void {
  if (target === 'sidebar') {
    if (collapsed.value) {
      props.layout.openSidebar()
      props.layout.setSidebarWidth(expandSidebarWidth())
      return
    }
    props.layout.setSidebarWidth(clampWidth(state.sidebarWidth + direction * 16, SIDEBAR_MIN, SIDEBAR_MAX))
    return
  }
  const base = columns.value.rightbar || RIGHTBAR_MIN
  props.layout.setRightbarWidth(clampWidth(base + direction * 16, RIGHTBAR_MIN, viewport.value * 0.7))
}

defineExpose({ toggleSidebar, columns })
</script>

<template>
  <div ref="root" class="app-frame" :class="{ 'is-dragging': dragging !== null }">
    <aside class="app-frame__sidebar" :style="{ width: `${sidebarWidth}px` }">
      <slot name="sidebar" :collapsed="collapsed" :width="sidebarWidth" :toggle="toggleSidebar" />
    </aside>

    <div
      v-show="!collapsed"
      class="app-frame__handle app-frame__handle--left"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整侧栏宽度"
      :aria-valuenow="Math.round(sidebarWidth)"
      :aria-valuemin="SIDEBAR_MIN"
      :aria-valuemax="SIDEBAR_MAX"
      tabindex="0"
      @pointerdown="startDrag('sidebar', $event)"
      @keydown.left.prevent="nudge('sidebar', -1)"
      @keydown.right.prevent="nudge('sidebar', 1)"
    />

    <main class="app-frame__center">
      <slot :narrow="narrow" :toggle-sidebar="toggleSidebar" />
    </main>

    <div
      v-if="rightWidth > 0 && !state.rightbarFullscreen"
      class="app-frame__handle app-frame__handle--right"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整右栏宽度"
      :aria-valuenow="Math.round(rightWidth)"
      :aria-valuemin="RIGHTBAR_MIN"
      tabindex="0"
      @pointerdown="startDrag('rightbar', $event)"
      @keydown.left.prevent="nudge('rightbar', 1)"
      @keydown.right.prevent="nudge('rightbar', -1)"
    />

    <!-- 用 v-show 而不是 v-if：右栏关闭时宿主仍留在 DOM 里，
         页面用 Teleport 投递的检查器就不会因为目标消失而被卸载/丢失。 -->
    <section
      v-show="rightTrack"
      class="app-frame__right"
      :class="{ 'is-fullscreen': state.rightbarFullscreen }"
      :style="state.rightbarFullscreen ? undefined : { width: `${rightWidth}px` }"
      aria-label="右侧面板"
    >
      <slot name="rightbar" :width="rightWidth" :fullscreen="state.rightbarFullscreen" />
    </section>
  </div>
</template>

<style scoped>
.app-frame { display: flex; align-items: stretch; min-height: 100vh; width: 100%; background: var(--app-bg, #f4f6fa); }
.app-frame.is-dragging { cursor: col-resize; user-select: none; }
.app-frame__sidebar { flex: none; min-width: 0; transition: width .22s ease; overflow: hidden; }
.app-frame.is-dragging .app-frame__sidebar { transition: none; }
.app-frame__center { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.app-frame__right { flex: none; min-width: 0; border-left: 1px solid var(--line, #e6ebf2); background: var(--surface, #fff); overflow: auto; }
.app-frame__right.is-fullscreen { position: fixed; inset: 0; z-index: 60; width: 100%; max-width: none; border-left: 0; box-shadow: 0 24px 60px rgba(15, 23, 42, .28); }
.app-frame__handle { flex: 0 0 5px; position: relative; cursor: col-resize; background: transparent; }
.app-frame__handle::after { content: ''; position: absolute; inset: 0 2px; border-radius: 3px; background: transparent; transition: background .15s ease; }
.app-frame__handle:hover::after, .app-frame__handle:focus-visible::after { background: #3b82f6; opacity: .5; }
.app-frame__handle:focus-visible { outline: none; }
</style>
