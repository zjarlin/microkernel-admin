// 注入点：`AppFrame` 在自己的 setup 里把布局服务 provide 给整棵子树，
// 页面/插件用 `useLayout()` 拿服务，因此右侧栏、面板导航不需要层层透传 prop。
import { inject, provide, type InjectionKey } from 'vue'
import type { LayoutService } from './layout.ts'

export const LAYOUT_KEY: InjectionKey<LayoutService> = Symbol('app-frame-layout')

/** 由 `AppFrame` 调用：把布局服务提供给子树。 */
export function provideLayout(layout: LayoutService): void {
  provide(LAYOUT_KEY, layout)
}

/** 取布局服务；不在 `AppFrame` 之内时抛错（配置错误要早暴露，而不是静默失效）。 */
export function useLayout(): LayoutService {
  const layout = inject(LAYOUT_KEY, null)
  if (layout === null) throw new Error('useLayout(): 当前组件不在 <AppFrame> 内，请先装配 AppFrame')
  return layout
}

/** 取布局服务；允许缺失（组件要能单独渲染/测试时用）。 */
export function useOptionalLayout(): LayoutService | null {
  return inject(LAYOUT_KEY, null)
}
