# @addzero/app-frame

三栏可拖拽应用框架 + `layout` 服务。左侧栏可收起、右栏按需让位、
窄屏自动折叠成图标轨道，面板宽度与展开状态可持久化。

## 来源与授权

几何算法与 `layout` 服务契约移植自
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
`packages/client/ui-layout`（MIT）：

| 本包 | DSH 对应 | 说明 |
| --- | --- | --- |
| `src/columns.ts` | `src/client/columns.ts` | 逐条移植的纯函数，常量与求解顺序一致 |
| `src/layout.ts` | `src/client/service.ts` | 同形 API：`selectPanel` / `beginNavigation` / `toggleSidebar` / `openRightbar` / `closeRightbar` |
| `src/AppFrame.vue` | `src/client/AppFrame.tsx` | 三栏 + 拖拽手柄 + 收起轨道的 Vue 实现 |

DSH 是 React + Cordis；本项目是 Vue + 自己的微内核插件层，因此只移植「布局契约与几何」，
不含 React、Cordis、会话（session）等 harness 语义。改布局行为时优先与上游对齐，便于回灌补丁。

## 用法

```ts
import { AppFrame, createLayout } from '@addzero/app-frame'

const layout = createLayout({
  storageKey: 'micro-admin.layout',
  storage: { read: () => localStorage.getItem('micro-admin.layout'), write: (v) => localStorage.setItem('micro-admin.layout', v) },
})
```

```vue
<AppFrame :layout="layout">
  <template #sidebar="{ collapsed }">…菜单…</template>
  <template #default>…顶栏 + <router-view />…</template>
  <template #rightbar>…检查器/属性面板…</template>
</AppFrame>
```

子树里任意组件：

```ts
import { useLayout } from '@addzero/app-frame'

const layout = useLayout()
layout.openRightbar(true, false)   // 展开右栏（占轨道、非全屏）
layout.selectPanel('scada.tags')   // 切中栏面板（必须先 registerPanel）
const signal = layout.beginNavigation()  // 下一次导航会中止它
```

## 契约

| 行为 | 规则 |
| --- | --- |
| 侧栏宽度 | 拖拽夹在 264–420，默认 280；收起轨道 56（可配） |
| 中栏 | 最小 400；只有右栏让位之后才允许继续压缩 |
| 右栏 | 最小 300，最大占帧宽 70%，首次展开 45% |
| 窄屏 | 视口 < 1024 自动收起为轨道；此时手动切换只影响当前视口的临时展开 |
| 快捷键 | `Ctrl/Cmd + B` 切换侧栏（可关） |
| 无障碍 | 手柄是 `role="separator"` + 方向键 ±16px 调宽 |
