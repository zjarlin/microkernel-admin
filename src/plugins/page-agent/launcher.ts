// 启动器：页面角落的常驻入口，纯 DOM 实现。
//
// 为什么不用 Vue 组件：PageAgent 自带面板本身就是 `document.body` 上的浮动 DOM，
// 启动器与它同层最稳（不会被路由切换、外壳重排、右栏全屏带走）。
// 外观（位置/文案/图标模式/颜色/层级）全部来自后端设置，改配置即时重排。
import { watch, type Ref } from 'vue'
import type { LauncherStyle } from './api'
import type { AgentState } from './runtime'

const HOST_ID = 'page-agent-launcher'

/** 四个角的 CSS 定位。 */
const CORNERS: Record<LauncherStyle['position'], { top?: string; bottom?: string; left?: string; right?: string }> = {
  'bottom-right': { bottom: '24px', right: '24px' },
  'bottom-left': { bottom: '24px', left: '24px' },
  'top-right': { top: '72px', right: '24px' },
  'top-left': { top: '72px', left: '24px' },
}

const SPARK = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5 14 11.4 12 17l-2-5.6L4.5 9.5 10 7.6z"/><path d="M18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".7"/></svg>'

export interface LauncherHandle {
  destroy(): void
}

/**
 * 挂载启动器。
 *
 * @param options.open  点击行为（打开/收起面板）
 * @param options.style 外观配置来源
 * @param options.zIndex 层级（与面板同一档，保证不被面板盖住）
 */
export function mountLauncher(options: {
  style: Ref<LauncherStyle>
  zIndex: Ref<number>
  visible: Ref<boolean>
  /** 运行态：跑任务时启动器自身给一个呼吸态，避免用户重复点。 */
  state: Ref<AgentState>
  open: () => void
}): LauncherHandle {
  const host = document.createElement('button')
  host.id = HOST_ID
  host.type = 'button'
  host.setAttribute('data-page-agent-ignore', 'true')
  host.style.cssText = [
    'position:fixed',
    'display:none',
    'align-items:center',
    'gap:6px',
    'padding:9px 14px',
    'border:none',
    'border-radius:999px',
    'cursor:pointer',
    'font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif',
    'box-shadow:0 8px 20px rgba(15,23,42,.24)',
    'transition:transform .16s ease,box-shadow .16s ease',
    'letter-spacing:.01em',
    'white-space:nowrap',
  ].join(';')
  host.addEventListener('mouseenter', () => {
    host.style.transform = 'translateY(-1px)'
    host.style.boxShadow = '0 12px 24px rgba(15,23,42,.3)'
  })
  host.addEventListener('mouseleave', () => {
    host.style.transform = ''
    host.style.boxShadow = '0 8px 20px rgba(15,23,42,.24)'
  })
  host.addEventListener('click', (event) => {
    event.preventDefault()
    options.open()
  })
  document.body.appendChild(host)

  function paint(): void {
    const style = options.style.value
    const corner = CORNERS[style.position] ?? CORNERS['bottom-right']
    host.style.top = corner.top ?? 'auto'
    host.style.bottom = corner.bottom ?? 'auto'
    host.style.left = corner.left ?? 'auto'
    host.style.right = corner.right ?? 'auto'
    host.style.zIndex = String(options.zIndex.value)
    host.style.background = style.color
    host.style.color = style.textColor
    host.setAttribute('aria-label', style.label)
    host.title = style.label
    host.innerHTML = `${SPARK}${style.iconOnly ? '' : `<span>${escapeText(style.label)}</span>`}`
    host.style.padding = style.iconOnly ? '10px' : '9px 14px'
    host.style.display = options.visible.value ? 'inline-flex' : 'none'
    const running = options.state.value === 'running'
    host.style.opacity = running ? '.82' : '1'
    host.dataset.state = options.state.value
  }

  const stop = [
    watch(options.style, paint, { deep: true, immediate: true }),
    watch(options.zIndex, paint),
    watch(options.visible, paint),
    watch(options.state, paint),
  ]

  return {
    destroy() {
      for (const unwatch of stop) unwatch()
      host.remove()
    },
  }
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}
