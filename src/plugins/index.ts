import type { PluginDefinition } from '@/kernel'
import { coreAdminPlugin } from './core-admin'
import { sidebarPlugin } from './sidebar'
import { systemPlugin } from './system'
import { monitorPlugin } from './monitor'
import { scadaPlugin } from './scada'
import { pagesPlugin } from './pages'
import { aiPlugin } from './ai'
import { themePlugin } from './theme'
import { pageAgentPlugin } from './page-agent'
import { settingsPlugin } from './settings'
import { sourceFinderPlugin } from './source-finder'

/** 插件清单：新增业务域只改这一处，宿主不感知具体页面。 */
export const pluginCatalog: PluginDefinition[] = [
  coreAdminPlugin,
  sidebarPlugin,
  systemPlugin,
  monitorPlugin,
  scadaPlugin,
  aiPlugin,
  themePlugin,
  pageAgentPlugin,
  settingsPlugin,
  sourceFinderPlugin,
  pagesPlugin,
]
