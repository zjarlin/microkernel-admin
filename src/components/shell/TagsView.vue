<script setup lang="ts">
// 若依式标签页：记录访问过的页面，支持关闭单个 / 关闭其它 / 关闭全部。
// 标签只是导航历史，不缓存页面实例（页面重进即重新取数，避免陈旧数据）。
import { computed, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close } from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'

const route = useRoute()
const router = useRouter()
const tabs = useTabsStore()

const active = computed(() => route.path)

// 标签多到溢出时，保证当前标签始终可见；滚动条本身隐藏（横向滚动仍然可用），
// 否则标签栏下方会多出一条与内容无关的灰色滚动条。
watch(active, async () => {
  await nextTick()
  const track = document.querySelector<HTMLElement>('.tags-view__track')
  const current = track?.querySelector<HTMLElement>('.tags-view__item.is-active')
  current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}, { immediate: true })

function close(path: string): void {
  const next = tabs.remove(path)
  if (next && path === active.value) void router.push(next)
}

function closeOthers(): void {
  tabs.removeOthers(active.value)
}

function closeAll(): void {
  const next = tabs.removeAll()
  if (active.value !== next) void router.push(next)
}
</script>

<template>
  <nav class="tags-view" aria-label="已打开的页面">
    <div class="tags-view__track">
      <router-link
        v-for="tab in tabs.tabs"
        :key="tab.path"
        :to="tab.path"
        class="tags-view__item"
        :class="{ 'is-active': tab.path === active }"
      >
        <span class="tags-view__dot" aria-hidden="true" />
        <span class="tags-view__title">{{ tab.title }}</span>
        <button
          v-if="!tab.affix"
          class="tags-view__close"
          type="button"
          :aria-label="`关闭 ${tab.title}`"
          @click.prevent.stop="close(tab.path)"
        >
          <el-icon :size="11"><Close /></el-icon>
        </button>
      </router-link>
    </div>
    <div class="tags-view__actions">
      <button type="button" @click="closeOthers">关闭其它</button>
      <button type="button" @click="closeAll">关闭全部</button>
    </div>
  </nav>
</template>

<style scoped>
.tags-view { display: flex; align-items: center; gap: 10px; padding: 8px 28px; background: var(--surface); border-bottom: 1px solid var(--line); }
.tags-view__track { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
.tags-view__track::-webkit-scrollbar { display: none; }
.tags-view__item {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line);
  background: transparent; color: var(--muted); font-size: 12px; text-decoration: none;
  transition: color .15s ease, border-color .15s ease, background .15s ease;
}
.tags-view__item:hover { color: var(--app-text); border-color: var(--line-strong); }
.tags-view__item.is-active { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
:root.dark .tags-view__item.is-active { color: #93c5fd; border-color: #1e3a8a; background: rgba(30, 58, 138, .35); }
.tags-view__dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .55; }
.tags-view__title { white-space: nowrap; }
.tags-view__close { display: inline-grid; place-items: center; width: 15px; height: 15px; border: 0; padding: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; opacity: .6; }
.tags-view__close:hover { opacity: 1; background: rgba(148, 163, 184, .22); }
.tags-view__actions { display: flex; gap: 4px; margin-left: auto; flex: none; }
.tags-view__actions button { border: 0; background: transparent; color: var(--muted); font-size: 12px; padding: 4px 6px; border-radius: 6px; cursor: pointer; }
.tags-view__actions button:hover { color: var(--app-text); background: var(--hover); }
@media (max-width: 760px) { .tags-view { padding: 8px 16px; } .tags-view__actions { display: none; } }
</style>
