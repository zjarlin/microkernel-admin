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

/**
 * 把主题写成 CSS 变量。
 *
 * 品牌色 / 圆角 / 密度写在 `:root` 的内联样式上——它们在浅色和深色下都要生效。
 * 背景、表面、正文、次要文字这组只属于浅色：写成一条 `:root:not(.dark)` 规则，
 * 而不是内联样式。否则深色模式下内联值会盖住 `html.dark` 的调色板
 * （表现就是「切了深色，右侧面板和卡片还是白的」）。
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

  // 浅色调色板：只在未加 .dark 时生效，切换主题类即自动让位，无需再清理内联值。
  const id = 'ui-theme-light-tokens'
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = `:root:not(.dark){--app-bg:${theme.appBg};--surface:${theme.surface};`
    + `--app-text:${theme.text};--muted:${theme.muted};}`
  // 深色标记由调用方负责（store 的 apply 已处理），这里只用它做一次自检清理。
  if (dark) {
    for (const token of ['--app-bg', '--surface', '--app-text', '--muted']) root.style.removeProperty(token)
  }
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
