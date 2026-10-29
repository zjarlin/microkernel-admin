// 外观主题（服务端）：把「界面长什么样」变成可存可改的配置。
//
// 原型设计的人不写代码也要能调界面：品牌色、圆角、密度、背景/表面色都收在这里，
// 前端启动时拉一次并写成 CSS 变量，刷新即生效。
import type { ExtensionRequest, ExtensionUser, KeyValueStore } from '@addzero/ui-server'

export const UNHANDLED = Symbol('theme-unhandled')

export type UiDensity = 'compact' | 'cozy' | 'comfortable'

export interface UiTheme {
  /** 主色：按钮、选中态、强调线。 */
  brand: string
  /** 主色浅底：选中背景、标签页。 */
  brandSoft: string
  /** 辅助色：渐变与图表。 */
  accent: string
  /** 圆角（px）。 */
  radius: number
  /** 密度：影响内容留白与表格行高。 */
  density: UiDensity
  appBg: string
  surface: string
  text: string
  muted: string
}

export const DEFAULT_THEME: UiTheme = {
  brand: '#2563eb',
  brandSoft: '#eff6ff',
  accent: '#22d3ee',
  radius: 14,
  density: 'cozy',
  appBg: '#f4f6fa',
  surface: '#ffffff',
  text: '#101828',
  muted: '#667085',
}

const THEME_PERMISSION = 'system:theme:config'
const KEY = 'ui:theme'

function allowed(user: ExtensionUser | null, permission: string): boolean {
  if (!user) return false
  return user.permissions.includes('*:*:*') || user.permissions.includes('*') || user.permissions.includes(permission)
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function color(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback
}

/** 把任意输入收敛成合法主题：非法字段回落到默认值，而不是整份拒绝。 */
export function normalizeTheme(input: unknown, base: UiTheme = DEFAULT_THEME): UiTheme {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Partial<UiTheme>
  const density: UiDensity = raw.density === 'compact' || raw.density === 'comfortable' ? raw.density : 'cozy'
  return {
    brand: color(raw.brand, base.brand),
    brandSoft: color(raw.brandSoft, base.brandSoft),
    accent: color(raw.accent, base.accent),
    radius: clampInt(raw.radius, 0, 20, base.radius),
    density,
    appBg: color(raw.appBg, base.appBg),
    surface: color(raw.surface, base.surface),
    text: color(raw.text, base.text),
    muted: color(raw.muted, base.muted),
  }
}

export interface ThemePlugin {
  handle(request: ExtensionRequest): unknown | typeof UNHANDLED
}

export function createThemePlugin(options: { kv: KeyValueStore }): ThemePlugin {
  const read = (): UiTheme => normalizeTheme(options.kv.get<UiTheme>(KEY))

  return {
    handle({ method, path, body, user }) {
      if (path !== '/ui/theme') return UNHANDLED
      if (method === 'GET') return { theme: read(), defaults: DEFAULT_THEME }
      if (method === 'PUT' || method === 'POST') {
        if (!allowed(user, THEME_PERMISSION)) {
          throw Object.assign(new Error(`缺少外观配置权限：${THEME_PERMISSION}`), { status: 403 })
        }
        const next = normalizeTheme(body, DEFAULT_THEME)
        options.kv.set(KEY, next)
        return { theme: next }
      }
      return UNHANDLED
    },
  }
}
