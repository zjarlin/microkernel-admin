<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  ArrowLeftBold, ArrowRightBold, Bell, Close, Fold, FullScreen, Grid, Moon, Search, Setting, Sunny, SwitchButton,
} from '@element-plus/icons-vue'
import { filterByPermission, type MenuContribution } from '@/kernel'
import { getKernel } from '@/router'
import { useSessionStore } from '@/stores/session'
import { useKernelStore } from '@/stores/kernel'
import { useUiStore } from '@/stores/ui'
import { initialsOf } from '@/shared/format'
import { AppFrame } from '@addzero/app-frame'
import TagsView from '@/components/shell/TagsView.vue'
import LayoutSettingsPanel from '@/components/shell/LayoutSettingsPanel.vue'
import { RIGHT_PANEL_HOST_ID, appLayout, closeRightPanel, openRightPanel, useRightPanel } from '@/shared/shell'
import { useTabsStore } from '@/stores/tabs'
import { applyTheme, useTheme } from '@/shared/theme'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

// 三栏框架：几何与面板导航由 @addzero/app-frame 持有（与 dsh 的 ctx.layout 同形）。
// 服务放在 @/shared/shell 里而不是这里，页面要开右栏时拿的是同一份实例。
const layout = appLayout
const rightPanel = useRightPanel()
const tabs = useTabsStore()

const kernelStore = useKernelStore()
const booted = ref(true)
const quickSearch = ref('')

const groups = computed(() => {
  const kernel = getKernel()
  if (!kernel) return [] as Array<{ name: string; items: MenuContribution[] }>
  const enabled = new Set(kernelStore.statuses.filter((item) => item.enabled).map((item) => item.id))
  const menus = filterByPermission(
    kernel.menuContributions().filter((menu) => !menu.pluginId || enabled.has(menu.pluginId)),
    session.permissions,
  )
  const order = ['概览', '系统管理', '系统工具', '系统监控']
  const bucket = new Map<string, MenuContribution[]>()
  for (const menu of menus) {
    const key = menu.group ?? '其他'
    bucket.set(key, [...(bucket.get(key) ?? []), menu])
  }
  return [...bucket.entries()]
    .sort(([a], [b]) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
    .map(([name, items]) => ({ name, items }))
})

const filteredGroups = computed(() => {
  const keyword = quickSearch.value.trim().toLowerCase()
  if (!keyword) return groups.value
  return groups.value
    .map((group) => ({ ...group, items: group.items.filter((item) => item.title.toLowerCase().includes(keyword)) }))
    .filter((group) => group.items.length > 0)
})

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '工作台'))
const enabledPlugins = computed(() => kernelStore.statuses.filter((item) => item.enabled).length)

onMounted(() => {
  const kernel = getKernel()
  if (kernel) kernelStore.attach(kernel)
})

// 标签页与路由同源：进入即登记（隐藏页如个人中心也允许），标题取路由 meta。
watch(
  () => route.fullPath,
  () => {
    if (typeof route.name === 'string' && route.name === 'not-found') return
    tabs.add({ path: route.path, title: pageTitle.value })
  },
  { immediate: true },
)

/** 布局设置与页面检查器共用右栏：再点一次即关闭。 */
function toggleLayoutPanel(): void {
  if (rightPanel.active?.id === 'shell.layout') {
    closeRightPanel('shell.layout')
    return
  }
  openRightPanel({ id: 'shell.layout', title: '布局设置', hint: '三栏几何与面板偏好' })
}

async function logout(): Promise<void> {
  await ElMessageBox.confirm('确定退出当前账号吗？', '退出登录', { type: 'warning', confirmButtonText: '退出', cancelButtonText: '取消' })
  await session.logout()
  await router.replace('/login')
}

const theme = useTheme()

function toggleTheme(): void {
  ui.toggleDark()
  // 深色模式不使用主题里的背景/文字色，但品牌色与圆角密度照旧生效。
  applyTheme(theme.value, ui.dark)
}
</script>

<template>
  <AppFrame :layout="layout">
    <template #sidebar="{ collapsed, toggle }">
      <aside class="sidebar" :class="{ 'is-collapsed': collapsed }">
      <div class="sidebar-head">
        <div class="logo">MK</div>
        <div v-show="!collapsed" class="logo-text">
          <strong>Micro Kernel</strong>
          <span>微内核控制台</span>
        </div>
      </div>

      <el-scrollbar class="sidebar-scroll">
        <nav class="menu-nav" aria-label="主导航">
          <section v-for="group in filteredGroups" :key="group.name" class="menu-group">
            <p v-show="!collapsed" class="menu-group-title">{{ group.name }}</p>
            <router-link
              v-for="item in group.items"
              :key="item.id"
              :to="item.path"
              class="menu-item"
              :class="{ active: activeMenu === item.path }"
              :title="collapsed ? item.title : undefined"
            >
              <el-icon :size="18"><component :is="item.icon ?? 'Menu'" /></el-icon>
              <span v-show="!collapsed" class="menu-label">{{ item.title }}</span>
              <span v-if="item.badge && !collapsed" class="menu-badge">{{ item.badge }}</span>
            </router-link>
          </section>
          <p v-if="filteredGroups.length === 0" class="menu-empty">没有匹配的菜单</p>
        </nav>
      </el-scrollbar>

      <div class="sidebar-foot">
        <button class="collapse-button" type="button" @click="toggle">
          <el-icon><ArrowRightBold v-if="collapsed" /><ArrowLeftBold v-else /></el-icon>
          <span v-show="!collapsed">收起侧栏</span>
        </button>
      </div>
      </aside>
    </template>

    <template #default="{ toggleSidebar: toggle }">
    <div class="main-area">
      <header class="topbar">
        <div class="topbar-left">
          <el-button circle text @click="toggle">
            <el-icon :size="18"><Fold /></el-icon>
          </el-button>
          <div class="breadcrumb">
            <span>控制台</span>
            <i>/</i>
            <strong>{{ pageTitle }}</strong>
          </div>
        </div>

        <div class="topbar-right">
          <el-input v-model="quickSearch" class="menu-search" placeholder="搜索菜单" :prefix-icon="Search" clearable />
          <router-link to="/plugins" class="plugin-pill" title="插件中心">
            <el-icon><Grid /></el-icon>
            <span>{{ enabledPlugins }} 个插件运行中</span>
          </router-link>
          <el-tooltip content="布局设置" placement="bottom">
            <el-button circle text @click="toggleLayoutPanel">
              <el-icon :size="17"><Setting /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="ui.dark ? '切换浅色' : '切换深色'" placement="bottom">
            <el-button circle text @click="toggleTheme">
              <el-icon :size="17"><Sunny v-if="ui.dark" /><Moon v-else /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="通知公告" placement="bottom">
            <el-button circle text @click="router.push('/system/notice')">
              <el-badge is-dot type="danger"><el-icon :size="17"><Bell /></el-icon></el-badge>
            </el-button>
          </el-tooltip>
          <el-dropdown trigger="click">
            <button class="user-chip" type="button">
              <span class="avatar">{{ initialsOf(session.displayName) }}</span>
              <span class="user-meta">
                <strong>{{ session.displayName }}</strong>
                <small>{{ session.user?.department ?? '未分配部门' }}</small>
              </span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/profile')">个人中心</el-dropdown-item>
                <el-dropdown-item @click="router.push('/plugins')">插件中心</el-dropdown-item>
                <el-dropdown-item divided @click="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <TagsView />

      <main class="content-area">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" v-if="booted" :key="route.path" />
            <div v-else class="page-skeleton">
              <el-skeleton :rows="5" animated />
            </div>
          </transition>
        </router-view>
      </main>
    </div>
    </template>

    <!-- 右栏：外壳出标题栏与内容宿主，页面用 Teleport 把检查器/属性面板投进来。 -->
    <template #rightbar="{ fullscreen }">
      <div class="shell-rightbar">
        <header class="shell-rightbar__head">
          <div class="shell-rightbar__title">
            <strong>{{ rightPanel.active?.title ?? '右侧面板' }}</strong>
            <small v-if="rightPanel.active?.hint">{{ rightPanel.active.hint }}</small>
          </div>
          <div class="shell-rightbar__tools">
            <el-tooltip :content="fullscreen ? '退出全屏' : '全屏'" placement="bottom">
              <el-button circle text @click="layout.openRightbar(true, !fullscreen)">
                <el-icon :size="16"><FullScreen /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="关闭右侧面板" placement="bottom">
              <el-button circle text @click="closeRightPanel()">
                <el-icon :size="16"><Close /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </header>
        <!-- 布局设置占用整条右栏：宿主容器让位（display:none），否则 flex:1 会把设置面板推到最底部。 -->
        <div
          :id="RIGHT_PANEL_HOST_ID"
          class="shell-rightbar__body"
          :class="{ 'is-stashed': rightPanel.active?.id === 'shell.layout' }"
        ></div>
        <LayoutSettingsPanel v-if="rightPanel.active?.id === 'shell.layout'" />
        <p v-else-if="!rightPanel.active" class="shell-rightbar__empty">
          选中画布图元、打开通用页面详情时，面板会出现在这里。
        </p>
      </div>
    </template>
  </AppFrame>
</template>

<style scoped>
/* 宽度由 @addzero/app-frame 的列求解决定，这里只负责把内容填满所在轨道。 */
.sidebar { width: 100%; height: 100%; background: #0f172a; color: #cbd5e1; display: flex; flex-direction: column; position: sticky; top: 0; z-index: 20; }
.sidebar-head { height: 76px; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid rgba(148,163,184,.12); }
.sidebar.is-collapsed .sidebar-head { padding: 0 12px; justify-content: center; }
.logo { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; background: linear-gradient(135deg, #3b82f6, #22d3ee); color: #08111d; font-weight: 900; flex: 0 0 38px; }
.logo-text { display: flex; flex-direction: column; line-height: 1.25; }
.logo-text strong { color: #f8fafc; font-size: 14px; letter-spacing: .01em; }
.logo-text span { color: #7d8da4; font-size: 11px; }
.sidebar-scroll { flex: 1; min-height: 0; }
.menu-nav { padding: 18px 12px 24px; }
.menu-group { margin-bottom: 18px; }
.menu-group-title { margin: 0 0 8px; padding: 0 12px; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #64748b; font-weight: 700; }
.menu-item { position: relative; display: flex; align-items: center; gap: 11px; min-height: 40px; padding: 0 12px; border-radius: 9px; color: #a9b6c9; text-decoration: none; transition: background .18s ease, color .18s ease; }
.menu-item + .menu-item { margin-top: 2px; }
.menu-item:hover { background: rgba(148,163,184,.09); color: #f1f5f9; }
.menu-item.active { background: linear-gradient(90deg, rgba(59,130,246,.22), rgba(34,211,238,.07)); color: #f8fafc; }
.menu-item.active::before { content: ''; position: absolute; left: 0; top: 11px; bottom: 11px; width: 2px; border-radius: 2px; background: #38bdf8; }
.sidebar.is-collapsed .menu-item { justify-content: center; padding: 0; }
.menu-label { white-space: nowrap; font-size: 13px; }
.menu-badge { margin-left: auto; background: #1d4ed8; color: white; font-size: 10px; padding: 2px 6px; border-radius: 999px; }
.menu-empty { color: #64748b; font-size: 12px; padding: 0 12px; }
.sidebar-foot { border-top: 1px solid rgba(148,163,184,.12); padding: 12px; }
.collapse-button { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border: 0; border-radius: 9px; background: rgba(148,163,184,.08); color: #94a3b8; cursor: pointer; font-size: 12px; }
.collapse-button:hover { background: rgba(148,163,184,.14); color: #e2e8f0; }
/* 中栏宽度由布局服务求解（右栏一开就让位），所以响应式按「容器宽度」判断，
   而不是按视口——视口 1600px 时中栏可能只有 880px。 */
.main-area { min-width: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; container-type: inline-size; container-name: shell; }
.topbar { height: 76px; flex: 0 0 76px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 28px; background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 15; backdrop-filter: blur(12px); }
.topbar-left, .topbar-right { display: flex; align-items: center; gap: 12px; min-width: 0; }
.breadcrumb { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--muted); white-space: nowrap; }
.breadcrumb i { font-style: normal; color: var(--line-strong); }
.breadcrumb strong { color: var(--app-text); font-weight: 600; }
.menu-search { flex: 0 1 190px; min-width: 120px; }
.plugin-pill { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); font-size: 12px; text-decoration: none; white-space: nowrap; }
.plugin-pill:hover { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
.user-chip { display: flex; align-items: center; gap: 9px; background: transparent; border: 0; cursor: pointer; padding: 4px 6px; border-radius: 9px; }
.user-chip:hover { background: var(--hover); }
.avatar { width: 34px; height: 34px; border-radius: 50%; background: #0f172a; color: white; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.user-meta { display: flex; flex-direction: column; text-align: left; line-height: 1.25; min-width: 0; }
.user-meta strong, .user-meta small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 128px; }
.breadcrumb { min-width: 0; }
.breadcrumb strong { overflow: hidden; text-overflow: ellipsis; }
.topbar-left { flex: 1 1 auto; }
.user-meta strong { color: var(--app-text); font-size: 13px; }
.user-meta small { color: var(--muted); font-size: 11px; }
/* 内容区：铺满剩余高度、只在自身内部滚动，与侧栏底边严格对齐。 */
.content-area { flex: 1 1 auto; min-height: 0; min-width: 0; padding: 28px; overflow: auto; overscroll-behavior: contain; }
.shell-rightbar { display: flex; flex-direction: column; flex: 1; height: 100%; min-height: 0; overflow: hidden; }
.shell-rightbar__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 14px 12px 16px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--surface); z-index: 2; }
.shell-rightbar__title { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.shell-rightbar__title strong { font-size: 14px; color: var(--app-text); }
.shell-rightbar__title small { font-size: 11px; color: var(--muted); }
.shell-rightbar__tools { display: flex; align-items: center; gap: 2px; flex: none; }
.shell-rightbar__body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.shell-rightbar__body.is-stashed { display: none; }
.shell-rightbar__empty { margin: 0; padding: 20px 16px; font-size: 12px; line-height: 1.8; color: var(--muted); }
.page-skeleton { background: var(--surface); padding: 24px; border-radius: 16px; }
.page-fade-enter-active, .page-fade-leave-active { transition: opacity .16s ease, transform .16s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(5px); }
.page-fade-leave-to { opacity: 0; }
/* 容器查询：右栏占轨道时中栏变窄，先收搜索框与插件计数，再收用户部门，最后只留面包屑。 */
@container shell (max-width: 1040px) { .menu-search { display: none; } .plugin-pill span { display: none; } }
@container shell (max-width: 860px) { .user-meta { display: none; } .breadcrumb span, .breadcrumb i { display: none; } }
@container shell (max-width: 640px) { .plugin-pill { display: none; } }
@media (max-width: 760px) { .topbar { padding: 0 16px; } .content-area { padding: 16px; } }
@media (max-width: 1100px) { .menu-search { display: none; } }
</style>
