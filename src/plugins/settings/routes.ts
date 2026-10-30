import type { MenuContribution, RouteContribution } from '@/kernel'

/**
 * 系统设置的唯一入口。
 *
 * 各插件不再注册「XX 设置」页面，而是向 `ctx.settings` 贡献设置区；
 * 这里只留一个标签页容器，标签页由贡献的分组自动生成。
 */
export const routes: RouteContribution[] = [
  {
    name: 'system-settings',
    path: '/system/settings',
    component: () => import('./SettingsPage.vue'),
    title: '系统设置',
    permission: 'system:settings:view',
    meta: { icon: 'Tools', group: '系统工具' },
  },
]

export const menus: MenuContribution[] = [
  {
    id: 'system-settings',
    title: '系统设置',
    path: '/system/settings',
    icon: 'Tools',
    group: '系统工具',
    order: 65,
    permission: 'system:settings:view',
  },
]
