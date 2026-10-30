<script setup lang="ts">
// 布局设置：外壳右栏的常驻内容（若依「布局设置」抽屉的对应物）。
// 只调用布局服务的公开方法，不直接读写下层状态，和拖拽手柄走同一条语义。
import { computed } from 'vue'
import { RIGHTBAR_MIN, SIDEBAR_MAX, SIDEBAR_MIN } from '@addzero/app-frame'
import { appLayout } from '@/shared/shell'

const state = appLayout.state

const sidebarWidth = computed({
  get: () => state.sidebarWidth || SIDEBAR_MIN,
  set: (value: number) => appLayout.setSidebarWidth(value),
})

const rightbarWidth = computed({
  get: () => state.rightbarWidth || RIGHTBAR_MIN,
  set: (value: number) => appLayout.setRightbarWidth(value),
})

const rightbarMax = computed(() => Math.round((typeof window === 'undefined' ? 1440 : window.innerWidth) * 0.7))

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
        <el-switch :model-value="state.sidebarCollapsed" @update:model-value="appLayout.toggleSidebar()" />
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
      <div class="layout-settings__row layout-settings__row--stack">
        <span>宽度 <b>{{ rightbarWidth }}px</b></span>
        <el-slider v-model="rightbarWidth" :min="RIGHTBAR_MIN" :max="rightbarMax" :step="8" size="small" :show-tooltip="false" />
      </div>
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
.layout-settings__hint { margin: 0; font-size: 12px; line-height: 1.8; color: var(--muted); }
.layout-settings__hint kbd { padding: 1px 5px; border: 1px solid var(--line-strong); border-radius: 4px; font-size: 11px; font-family: ui-monospace, monospace; }
.layout-settings__reset { width: 100%; }
</style>
