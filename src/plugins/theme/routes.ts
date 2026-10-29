import type { MenuContribution, RouteContribution } from '@/kernel'

/** 外观配置：一个页面就是全部入口（避免「布局设置里也能改色」这类重复入口）。 */
export const routes: RouteContribution[] = [
  {
    name: 'system-theme',
    path: '/system/theme',
    component: () => import('./pages/ThemePage.vue'),
    title: '外观主题',
    permission: 'system:theme:config',
    meta: { icon: 'Brush', group: '系统工具' },
  },
]

export const menus: MenuContribution[] = [
  {
    id: 'system-theme',
    title: '外观主题',
    path: '/system/theme',
    icon: 'Brush',
    group: '系统工具',
    order: 90,
    permission: 'system:theme:config',
  },
]
