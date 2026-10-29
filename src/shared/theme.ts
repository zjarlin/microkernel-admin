// 外观主题：把「界面长什么样」做成后端配置，前端只负责写成 CSS 变量。
//
// 谁在用：
// - 外壳（AdminLayout）启动时拉一次，登录后立即生效；
// - 右栏「布局设置」里改完即写回后端并就地应用；
// - 原型设计的人只需要调这里的 token，不需要改组件样式。
import { ref } from 'vue'
import type { HttpClient } from './http'

export type UiDensity = 'compact' | 'cozy' | 'comfortable'

export interface UiTheme {
  brand: string
  brandSoft: string
  accent: string
  radius: number
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

/** 当前生效的主题：多处共享一份，改完立刻重渲染。 */
const current = ref<UiTheme>({ ...DEFAULT_THEME })

export function useTheme() {
  return current
}

/** 取消浅色覆盖，交给 base.scss 的深色变量。 */
const LIGHT_TOKENS = ['--app-bg', '--surface', '--app-text', '--muted'] as const

/**
 * 把主题写成 CSS 变量。
 * 深色模式下不动背景/文字色：那套调色板由 `html.dark` 维护，主题只改品牌色与圆角密度。
 */
export function applyTheme(theme: UiTheme, dark: boolean): void {
  current.value = { ...theme }
  const root = document.documentElement
  root.style.setProperty('--brand', theme.brand)
  root.style.setProperty('--brand-soft', theme.brandSoft)
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--radius', `${theme.radius}px`)
  root.style.setProperty('--content-pad', theme.density === 'compact' ? '18px' : theme.density === 'comfortable' ? '32px' : '28px')
  root.dataset.density = theme.density
  if (dark) {
    for (const token of LIGHT_TOKENS) root.style.removeProperty(token)
    return
  }
  root.style.setProperty('--app-bg', theme.appBg)
  root.style.setProperty('--surface', theme.surface)
  root.style.setProperty('--app-text', theme.text)
  root.style.setProperty('--muted', theme.muted)
}

export interface ThemeResponse {
  theme: UiTheme
  defaults: UiTheme
}

/** 读后端主题；失败时回落到默认值，界面不因为主题接口挂掉而白屏。 */
export async function loadTheme(http: HttpClient): Promise<UiTheme> {
  try {
    const response = await http.request<ThemeResponse>('/ui/theme')
    return { ...DEFAULT_THEME, ...response.theme }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export async function saveTheme(http: HttpClient, theme: UiTheme): Promise<UiTheme> {
  const response = await http.request<ThemeResponse>('/ui/theme', {
    method: 'PUT',
    body: JSON.stringify(theme),
  })
  return { ...DEFAULT_THEME, ...response.theme }
}
