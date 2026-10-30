import type { MenuContribution, RouteContribution } from '@/kernel'

/**
 * 只有一个入口：设置页。
 *
 * 助手入口在外壳顶栏常驻（属于运行时 UI，不是菜单项），
 * 因此这里不再放「打开助手」之类第二个入口，避免同一个动作两处入口。
 */
export const routes: RouteContribution[] = [
  {
    name: 'page-agent-settings',
    path: '/system/page-agent',
    component: () => import('./pages/PageAgentSettingsPage.vue'),
    title: '页面助手',
    permission: 'system:page-agent:config',
    meta: { icon: 'MagicStick', group: '系统工具' },
  },
]

export const menus: MenuContribution[] = [
  {
    id: 'system-page-agent',
    title: '页面助手',
    path: '/system/page-agent',
    icon: 'MagicStick',
    group: '系统工具',
    order: 95,
    permission: 'system:page-agent:config',
  },
]
