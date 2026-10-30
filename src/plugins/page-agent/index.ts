import type { Router } from 'vue-router'
import type { PluginDefinition } from '@/kernel'
import { routes, menus } from './routes'
import { createPageAgentRuntime } from './runtime'
import { createPageAgentSettings } from './settings'
import PageAgentEntry from './components/PageAgentEntry.vue'

/**
 * 页面助手插件：把 alibaba/page-agent 装成后台里的一个可停用能力。
 *
 * 边界（与微内核约定一致）：
 * - PageAgent 实例归插件服务，不塞进页面组件：换页不重建 agent，历史与中断状态不丢；
 * - 供应商与密钥走后端（`/page-agent/llm` 代理），浏览器里既没有 key 也没有供应商地址；
 * - 所有可调项（模型、步数、面板尺寸配色、入口外观、路径白名单、脱敏规则、附加指令）
 *   都是后端设置里的字段，并通过 `ctx.settings` 贡献给系统设置页，改完 `reload()` 立即生效；
 * - 入口只有一个：外壳顶栏的 `shell:topbar-actions` 槽位（面板是它的展开态），
 *   全站所有页面共用同一处入口，不再另放角落浮标或菜单按钮。
 */
export const pageAgentPlugin: PluginDefinition = {
  id: 'page-agent',
  name: '页面助手',
  version: '1.0.0',
  description: '把 alibaba/page-agent 装进后台：自然语言直接操作当前页面，配置与密钥留在后端。',
  author: 'Microkernel Admin',
  requires: ['core-admin'],
  defaultEnabled: true,
  setup(ctx) {
    for (const route of routes) ctx.routes.add(route)
    for (const menu of menus) ctx.menus.add(menu)

    const runtime = createPageAgentRuntime({ http: ctx.http })
    ctx.services.register('page-agent.runtime', runtime)

    // 唯一可见入口：外壳顶栏的 AI 图标。外壳只声明槽位，放什么由插件决定，
    // 停用本插件后按钮自然消失，不需要外壳配合。
    ctx.slots.add({
      name: 'shell:topbar-actions',
      id: 'page-agent:entry',
      component: PageAgentEntry,
      order: 10,
    })

    // 设置不再单独建设置页：贡献给系统设置页的「页面助手」分组，
    // 字段声明在 settings.ts，控件与必填校验由内核渲染。
    ctx.settings.add(createPageAgentSettings({ http: ctx.http, runtime }))

    // 路径白名单按「当前真实路径」判定：路由换了就同步一次。
    const router = ctx.services.get<Router>('router')
    const stopRouter = router?.afterEach((to) => {
      runtime.syncPath(to.path)
    })

    // 只拉入口视图：匿名访客也只需要知道「显不显示、长什么样」。
    // 完整设置（供应商/模型/提示词）留到真正打开面板时再取，需登录。
    void runtime.loadEntry()

    return () => {
      stopRouter?.()
      ctx.logger.debug('page-agent plugin disposed')
    }
  },
}
