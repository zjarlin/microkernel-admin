<script setup lang="ts">
// 侧栏：品牌 + 菜单搜索 + 任意层级可折叠菜单 + 收起按钮。
//
// 整个侧栏是一个插件（`sidebar`），因此：
// - 搜索框与菜单同源（都在这里读内核的菜单贡献），不靠外壳跨槽位传状态；
// - 折叠状态、搜索关键字是本插件自己的持久化，停用插件即整块消失；
// - 菜单层级由 `@addzero/nav-tree` 装配，插件之间只声明 `parent`，不约定顺序。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftBold, ArrowRightBold, Search } from '@element-plus/icons-vue'
import { NavTree, ancestorsOf, buildForest, countLeaves, filterForest, flatten } from '@addzero/nav-tree'
import { filterByPermission, type MenuContribution } from '@/kernel'
import { getKernel } from '@/router'
import { useKernelStore } from '@/stores/kernel'
import { useSessionStore } from '@/stores/session'

const props = withDefaults(
  defineProps<{
    collapsed?: boolean
    toggle?: () => void
  }>(),
  { collapsed: false },
)

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const kernelStore = useKernelStore()

const COLLAPSED_KEY = 'micro-admin.sidebar.collapsed'
const GROUP_ORDER = ['概览', '系统管理', '系统工具', '系统监控', '组态与画面', 'AI']

/**
 * 折叠集合：只记「用户主动收起的节点」，默认全展开。
 *
 * 反过来记「展开了谁」会有个副作用：新增目录对老用户永远处于折叠态，
 * 他看不到新加的菜单却以为没上。记收起项则天然是「默认可见」。
 */
function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

const collapsedIds = ref<Set<string>>(readCollapsed())
const keyword = ref('')

function persist(): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedIds.value]))
  } catch {
    // 隐私模式下写不进去不影响使用，只丢记忆。
  }
}

const menus = computed<MenuContribution[]>(() => {
  const kernel = getKernel()
  if (!kernel) return []
  // 显式依赖插件状态：停用一个插件，它的菜单必须同步消失。
  const enabled = new Set(kernelStore.statuses.filter((item) => item.enabled).map((item) => item.id))
  return filterByPermission(
    kernel.menuContributions().filter((menu) => !menu.pluginId || enabled.has(menu.pluginId)),
    session.permissions,
  )
})

const forest = computed(() =>
  buildForest(menus.value, {
    groupOrder: GROUP_ORDER,
    groupIdPrefix: 'sidebar-group:',
  }),
)

const filtered = computed(() => filterForest(forest.value, keyword.value))

/** 搜索时命中项全部展开（否则搜到了还要手动点开）；否则按「默认展开、记住收起」。 */
const effectiveExpanded = computed(() => {
  const set = new Set<string>()
  const walk = (nodes: ReturnType<typeof buildForest>): void => {
    for (const node of nodes) {
      if (node.children.length === 0) continue
      const searching = Boolean(keyword.value.trim())
      if (searching || !collapsedIds.value.has(node.id)) set.add(node.id)
      walk(node.children)
    }
  }
  walk(filtered.value)
  return set
})

const rows = computed(() => {
  // 收起态只显示「能去的地方」：目录行全部展开并隐藏，否则一列图标里混着
  // 目录与页面，点目录只会展开而不会跳转，用户无从分辨。
  if (props.collapsed) {
    const all = new Set<string>()
    const walk = (nodes: ReturnType<typeof buildForest>): void => {
      for (const node of nodes) {
        if (node.children.length > 0) all.add(node.id)
        walk(node.children)
      }
    }
    walk(filtered.value)
    return flatten(filtered.value, { expanded: all, activePath: route.path, defaultExpanded: true })
      .filter((row) => row.node.kind !== 'folder')
  }
  return flatten(filtered.value, { expanded: effectiveExpanded.value, activePath: route.path, defaultExpanded: false })
})

const hitCount = computed(() => (keyword.value.trim() ? totalLeaves(filtered.value) : 0))

function totalLeaves(nodes: ReturnType<typeof buildForest>): number {
  return nodes.reduce((sum, node) => sum + countLeaves(node), 0)
}

function onToggle(node: { id: string }): void {
  const next = new Set(collapsedIds.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  collapsedIds.value = next
  persist()
}

function onSelect(node: { path?: string }): void {
  if (node.path) void router.push(node.path)
}

/** 进入页面时自动展开它所在的整条分支（深层页面也不会"藏着"）。 */
watch(
  () => route.path,
  (path) => {
    const trail = ancestorsOf(forest.value, (node) => node.path === path)
    if (trail.length === 0) return
    // 只从「收起集合」里移除，不额外记「展开」——保持集合语义单一。
    const next = new Set(collapsedIds.value)
    let changed = false
    for (const id of trail) {
      if (next.delete(id)) changed = true
    }
    if (changed) {
      collapsedIds.value = next
      persist()
    }
    // 展开后把激活项滚进视野，避免深层菜单落在折叠区外。
    void nextTick(() => document.querySelector('.nav-tree__row.is-active')?.scrollIntoView({ block: 'nearest' }))
  },
  { immediate: true },
)

// 菜单区滚动：底部渐隐只在「最后一项还被裁掉」时出现。
const scroller = ref<HTMLElement | null>(null)
const moreBelow = ref(false)
let observer: ResizeObserver | null = null

function syncMoreBelow(): void {
  const wrap = scroller.value
  if (!wrap) return
  const items = wrap.querySelectorAll<HTMLElement>('.nav-tree__row')
  const last = items[items.length - 1]
  moreBelow.value = last ? last.getBoundingClientRect().bottom - wrap.getBoundingClientRect().bottom > 4 : false
}

onMounted(() => {
  syncMoreBelow()
  observer = new ResizeObserver(() => syncMoreBelow())
  if (scroller.value) observer.observe(scroller.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch([rows, keyword], () => nextTick(syncMoreBelow))
</script>

<template>
  <aside class="sidebar" :class="{ 'is-collapsed': props.collapsed, 'has-more-below': moreBelow }">
    <div class="sidebar-head">
      <div class="logo">MK</div>
      <div v-if="!props.collapsed" class="logo-text">
        <strong>Micro Kernel</strong>
        <span>微内核控制台</span>
      </div>
    </div>

    <!-- 菜单搜索就地放在侧栏：同一个插件持有清单、过滤与折叠，不需要跨槽位共享状态。 -->
    <div v-if="!props.collapsed" class="sidebar-search">
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索菜单"
        :prefix-icon="Search"
        clearable
      />
      <span v-if="keyword.trim()" class="sidebar-search__hint">{{ hitCount }} 项匹配</span>
    </div>

    <div ref="scroller" class="sidebar-scroll" @scroll="syncMoreBelow">
      <NavTree
        :rows="rows"
        :compact="props.collapsed"
        show-count
        :count-of="countLeaves"
        @toggle="onToggle"
        @select="onSelect"
      >
        <template #icon="{ icon }">
          <el-icon :size="17"><component :is="icon ?? 'Menu'" /></el-icon>
        </template>
        <template #empty>
          <p class="nav-empty">{{ keyword.trim() ? '没有匹配的菜单' : '没有可用菜单' }}</p>
        </template>
      </NavTree>
    </div>

    <div class="sidebar-foot">
      <button class="collapse-button" type="button" @click="props.toggle?.()">
        <el-icon><ArrowRightBold v-if="props.collapsed" /><ArrowLeftBold v-else /></el-icon>
        <span v-if="!props.collapsed">收起侧栏</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* 侧栏配色全部来自 `--sidebar-*` 令牌（base.scss 里一套浅色、一套深色），
   所以「深浅切换」时侧栏跟着换皮，而不是永远一块黑。 */
.sidebar { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--sidebar-bg, #0f172a); color: var(--sidebar-text, #cbd5e1); transition: background .18s ease, color .18s ease; }
.sidebar-head { height: 76px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--sidebar-line, rgba(148, 163, 184, .12)); }
.sidebar.is-collapsed .sidebar-head { padding: 0 12px; justify-content: center; }
.logo { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; background: linear-gradient(135deg, var(--brand, #3b82f6), var(--accent, #22d3ee)); color: #08111d; font-weight: 900; flex: 0 0 38px; }
.logo-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.logo-text strong { color: var(--sidebar-text-strong, #f8fafc); font-size: 14px; white-space: nowrap; }
.logo-text span { color: var(--sidebar-muted, #7d8da4); font-size: 11px; white-space: nowrap; }
.sidebar-search { flex: none; padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 4px; }
.sidebar-search :deep(.el-input__wrapper) { background: var(--sidebar-hover-bg, rgba(148, 163, 184, .1)); box-shadow: none; }
.sidebar-search :deep(.el-input__inner) { color: var(--sidebar-text-strong, #e2e8f0); font-size: 12px; }
.sidebar-search :deep(.el-input__inner::placeholder) { color: var(--sidebar-muted, #64748b); }
.sidebar-search__hint { font-size: 10px; color: var(--sidebar-muted, #64748b); letter-spacing: .04em; }
.sidebar-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 12px 24px; position: relative; scrollbar-width: thin; scrollbar-color: var(--sidebar-scrollbar, rgba(148, 163, 184, .3)) transparent; }
.sidebar-scroll::-webkit-scrollbar { width: 6px; }
.sidebar-scroll::-webkit-scrollbar-thumb { background: var(--sidebar-scrollbar, rgba(148, 163, 184, .28)); border-radius: 3px; }
/* 渐隐只在「下面确实还有菜单」时出现，否则会遮住最后一项。 */
.sidebar::after { content: none; }
.sidebar.has-more-below .sidebar-scroll { mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent); }
.nav-empty { margin: 8px 4px; font-size: 12px; color: var(--sidebar-muted, #64748b); }
.sidebar-foot { flex: none; border-top: 1px solid var(--sidebar-line, rgba(148, 163, 184, .12)); padding: 12px; }
.collapse-button { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border: 1px solid var(--sidebar-line, transparent); border-radius: 9px; background: var(--sidebar-hover-bg, rgba(148, 163, 184, .08)); color: var(--sidebar-text, #94a3b8); cursor: pointer; font-size: 12px; transition: background .16s ease, color .16s ease, border-color .16s ease; }
.collapse-button:hover { background: var(--sidebar-active-bg, rgba(148, 163, 184, .14)); color: var(--sidebar-text-strong, #e2e8f0); border-color: var(--sidebar-line-strong, var(--sidebar-line, transparent)); }
</style>
