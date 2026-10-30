import type { PluginDefinition } from '@/kernel'
import { menus, routes } from './routes'

/**
 * 系统设置插件：设置页本身也是插件。
 *
 * 内核只提供 `ctx.settings` 贡献注册表；本插件负责把贡献渲染成
 * 「分组标签页 → 设置区 → 字段卡片」，其余插件不再各自建设置页。
 */
export const settingsPlugin: PluginDefinition = {
  id: 'settings',
  name: '系统设置',
  version: '1.0.0',
  description: '把各插件的设置收进一个页面：分组即标签页，字段按声明动态渲染。',
  author: 'Microkernel Admin',
  requires: ['core-admin'],
  defaultEnabled: true,
  setup(ctx) {
    for (const route of routes) ctx.routes.add(route)
    for (const menu of menus) ctx.menus.add(menu)
  },
}
