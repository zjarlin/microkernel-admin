// 宿主装配：把「通用页面后端」与「本仓库业务（种子 / 组态）」接在一起。
//
// 框架能力（Hono 路由、鉴权、错误信封、schema 存储、CRUD）全在 `@addzero/ui-server`；
// 这里只做三件事：给种子、挂业务扩展、读配置。
import { createApp as createUiApp, type CreatedApp } from '@addzero/ui-server'
import type { PageData, RuntimeStore, PageStore } from '@addzero/data-page'
import type { KeyValueStore } from '@addzero/ui-server'
import { seedPages } from '../src/schema/seed.ts'
import { createPageRegistry } from '../src/schema/registry.ts'
import type { SchemaStateStore } from '@addzero/data-page'
import { createScadaPlugin } from './plugins/scada/index.ts'
import { createAiPlugin } from './plugins/ai/index.ts'
import { createThemePlugin } from './plugins/theme/index.ts'
import { createPageAgentPlugin } from './plugins/page-agent/index.ts'

export interface HostDeps {
  pages: PageStore
  runtime: RuntimeStore
  schemas: SchemaStateStore
  kv: KeyValueStore
  corsOrigins?: string[] | undefined
  staticDir?: string | undefined
}

export interface HostApp extends CreatedApp {
  /** 供测试/自检读取当前生效的种子形状。 */
  seed: () => PageData
}

export function createApp(deps: HostDeps): HostApp {
  const scada = createScadaPlugin({ kv: deps.kv })
  // AI 插件依赖组态插件的图元/变量清单（同一份能力），不自己再读一份 JSON。
  const ai = createAiPlugin({ kv: deps.kv, symbols: scada.symbols, tags: scada.tags })
  const theme = createThemePlugin({ kv: deps.kv })
  // 页面助手：设置与密钥都留在后端，浏览器只拿公开视图 + 同源代理。
  const pageAgent = createPageAgentPlugin({ kv: deps.kv })

  const created = createUiApp({
    pages: deps.pages,
    runtime: deps.runtime,
    registry: createPageRegistry(deps.schemas),
    seed: seedPages,
    extensions: [scada, ai, theme, pageAgent],
    // 外观要在登录页就生效，因此主题读取免登录；写入仍要权限码。
    // 页面助手只公开「顶栏入口视图」（外观/可见性）；完整设置与代理调用都要登录。
    publicPaths: ['/ui/theme', '/page-agent/entry'],
    ...(deps.corsOrigins ? { corsOrigins: deps.corsOrigins } : {}),
    ...(deps.staticDir ? { staticDir: deps.staticDir } : {}),
  })

  return { ...created, seed: seedPages }
}
