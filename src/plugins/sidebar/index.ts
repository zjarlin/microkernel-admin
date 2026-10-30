// 侧栏插件：导航树的唯一宿主。
//
// 外壳（AppFrame）只留一个 `shell:sidebar` 槽位，侧栏的品牌、菜单搜索、
// 多级折叠与收起按钮都由本插件贡献；停用它，外壳退回一个最小占位。
import { defineAsyncComponent } from 'vue'
import type { PluginDefinition } from '@/kernel'

/** 侧栏是首屏必需，但仍按异步组件装载：停用插件时不必把它打进主 chunk。 */
const SidebarNav = defineAsyncComponent(() => import('./components/SidebarNav.vue'))

export const sidebarPlugin: PluginDefinition = {
  id: 'sidebar',
  name: '侧栏导航',
  version: '1.0.0',
  description: '品牌区、菜单搜索与任意层级可折叠导航树；菜单来自各插件贡献。',
  author: 'Micro Admin',
  requires: ['core-admin'],
  defaultEnabled: true,
  setup(ctx) {
    ctx.slots.add({
      id: 'sidebar.nav',
      name: 'shell:sidebar',
      order: 10,
      component: SidebarNav,
    })
    return () => ctx.logger.debug('sidebar plugin disposed')
  },
}
