// 页面助手的前端契约：只描述 HTTP 形状，不掺 UI，也不掺 PageAgent 实例。
import type { HttpClient } from '@/shared/http'

export type PageAgentLanguage = 'zh-CN' | 'en-US'
export type PanelPolicy = 'auto' | 'always' | 'none'

export interface PanelStyle {
  width: number
  height: number
  offsetBottom: number
  sideSpace: number
  radius: number
  colorFrom: string
  colorTo: string
  accent: string
  zIndex: number
}

/** 启动器外观：位置、文案、颜色都来自后端设置。 */
export interface LauncherStyle {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  label: string
  iconOnly: boolean
  color: string
  textColor: string
}

export interface RouteInstruction {
  pattern: string
  instruction: string
}

export interface MaskRule {
  label: string
  pattern: string
  replacement: string
  enabled: boolean
}

/**
 * 启动器视图：免登录可见的最小集合（外观与可见性）。
 *
 * 不含供应商地址、模型、提示词与脱敏规则——匿名访客拿不到任何网关信息。
 */
export interface LauncherView {
  enabled: boolean
  ready: boolean
  language: PageAgentLanguage
  panel: PanelStyle
  launcher: LauncherStyle
  panelPolicy: PanelPolicy
  allowPaths: string[]
}

/** 可编辑设置的下发形状：与后端存储字段一一对应，不含密钥信息。 */
export interface EditablePageAgentSettings {
  enabled: boolean
  baseUrl: string
  model: string
  language: PageAgentLanguage
  maxSteps: number
  stepDelay: number
  maxRetries: number
  disableNamedToolChoice: boolean
  extraBody: Record<string, unknown>
  requestTimeoutMs: number
  enableMask: boolean
  promptForNextTask: boolean
  panel: PanelStyle
  launcher: LauncherStyle
  panelPolicy: PanelPolicy
  allowPaths: string[]
  routeInstructions: RouteInstruction[]
  maskRules: MaskRule[]
  systemInstructions: string
  customSystemPrompt: string
  experimentalScriptExecution: boolean
  experimentalLlmsTxt: boolean
}

/** 后端下发的设置视图：**不含密钥明文**，只有 `hasApiKey` / `apiKeyHint`。 */
export interface PageAgentSettingsView extends EditablePageAgentSettings {
  hasApiKey: boolean
  apiKeyHint: string
  ready: boolean
  proxyPath: string
  /** 后端默认值（唯一来源）：界面「恢复默认值」直接用它，浏览器不自带第二份。 */
  defaults: EditablePageAgentSettings
}

export interface PageAgentProbe {
  ok: boolean
  message: string
  elapsedMs: number
}

export async function fetchLauncherView(http: HttpClient): Promise<LauncherView> {
  return http.request<LauncherView>('/page-agent/launcher')
}

export async function fetchPageAgentSettings(http: HttpClient): Promise<PageAgentSettingsView> {
  return http.request<PageAgentSettingsView>('/page-agent/settings')
}

/** 保存。`apiKey` 留空 = 保留服务端已有密钥；要清空走 `clearPageAgentKey`。 */
export async function savePageAgentSettings(
  http: HttpClient,
  input: Partial<PageAgentSettingsView> & { apiKey?: string },
): Promise<PageAgentSettingsView> {
  return http.request<PageAgentSettingsView>('/page-agent/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function clearPageAgentKey(http: HttpClient): Promise<PageAgentSettingsView> {
  return http.request<PageAgentSettingsView>('/page-agent/settings/api-key', { method: 'DELETE' })
}

export async function probePageAgent(http: HttpClient): Promise<PageAgentProbe> {
  return http.request<PageAgentProbe>('/page-agent/probe', { method: 'POST', body: '{}' })
}
