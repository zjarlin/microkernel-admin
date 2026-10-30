import type { Router } from 'vue-router'
import type { PluginDefinition } from '@/kernel'
import { routes, menus } from './routes'
import { createPageAgentRuntime } from './runtime'
import { mountLauncher } from './launcher'

/**
 * 页面助手插件：把 alibaba/page-agent 装成后台里的一个可停用能力。
 *
 * 边界（与微内核约定一致）：
 * - PageAgent 实例归插件服务，不塞进页面组件：换页不重建 agent，历史与中断状态不丢；
 * - 供应商与密钥走后端（`/page-agent/llm` 代理），浏览器里既没有 key 也没有供应商地址；
 * - 所有可调项（模型、步数、面板尺寸配色、启动器位置、路径白名单、脱敏规则、附加指令）
 *   都是后端设置里的字段，界面可改，改完 `reload()` 立即生效；
 * - 只有启动器一个可见入口（面板是它的展开态）。不再额外贡献槽位按钮，
 *   避免同一个动作出现两处入口。
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

    // 启动器挂到 body：不占布局轨道，也不会随路由切换重建。
    // 它是唯一可见入口：点开即库自带面板，关掉即收起，不再另做抽屉。
    const launcher = mountLauncher({
      style: runtime.launcher,
      zIndex: runtime.zIndex,
      visible: runtime.canRun,
      state: runtime.state,
      open: () => void runtime.toggle(),
    })

    // 路径白名单按「当前真实路径」判定：路由换了就同步一次，
    // 否则离开白名单页面后启动器仍留在原地。只更新路径，不销毁实例。
    const router = ctx.services.get<Router>('router')
    const stopRouter = router?.afterEach((to) => {
      runtime.syncPath(to.path)
    })

    // 只拉启动器视图：匿名访客也只需要知道「显不显示、长什么样」。
    // 完整设置（供应商/模型/提示词）留到真正打开面板时再取，需登录。
    void runtime.loadLauncher()

    return () => {
      stopRouter?.()
      launcher.destroy()
      ctx.logger.debug('page-agent plugin disposed')
    }
  },
}
