# 与 DeepSeek Harness（dsh）的关系

上游：<https://github.com/deepseek-ai/deepseek-harness>（MIT，默认分支 `master`）
我们的 fork：<https://github.com/zjarlin/deepseek-harness>
本仓库：<https://github.com/zjarlin/microkernel-admin>

## 结论先说

- **不分叉 dsh 的运行时**：dsh 是 React + Cordis 的会话型 harness，本仓库是 Vue 3 + 自研微内核的
  业务后台。把 dsh 整仓搬进来只会得到两套 DI、两套面板模型。
- **只取它的布局契约**，并且只取一份：`packages/app-frame`（`@addzero/app-frame`）。
  几何常量、列求解顺序、`layout` 服务的方法面都逐条对齐 `packages/client/ui-layout`，
  便于上游改布局时回灌补丁。
- fork 的作用是**上游追踪 + 偶尔回灌**，不是第二份产品源码。

## 取了什么、没取什么

| dsh（`packages/client/ui-layout`） | 本仓库 `@addzero/app-frame` | 说明 |
| --- | --- | --- |
| `src/client/columns.ts` | `src/columns.ts` | 纯函数逐条移植：`CENTER_MIN=400`、`SIDEBAR_MIN=264`、`SIDEBAR_DEFAULT=280`、`SIDEBAR_AUTO_COLLAPSE=1024`、`RIGHTBAR_MIN=300`、`RIGHTBAR_MAX_RATIO=0.7`、`clampWidth`、`computeColumns`、`expandSidebarWidth` |
| `src/client/service.ts`（`ctx.layout`） | `src/layout.ts`（`createLayout()`） | 同形方法面：`selectPanel` / `beginNavigation` / `toggleSidebar` / `openRightbar` / `closeRightbar`；另加 `registerPanel` / `reset` |
| `src/client/AppFrame.tsx` | `src/AppFrame.vue` | 三栏 + 拖拽手柄（`role="separator"` + 方向键 ±16px）+ 窄屏自动收起 + `Ctrl/⌘ + B` + 右栏全屏覆盖 |
| Cordis 插件上下文 | 本仓库 `src/kernel` | 插件/槽位/命令/事件是本仓库既有内核，不引入 Cordis |
| session / llm / host 等 80+ 包 | 不引入 | 与后台业务无关 |

## 「若依」落在 dsh 布局的哪里

| 若依习惯 | 本仓库实现 |
| --- | --- |
| 侧栏菜单 + 折叠 | `AppFrame` 的 `#sidebar` 槽位；菜单来自内核 `menuContributions()`，宽度/收起走 `layout` 服务并持久化 |
| 顶栏（面包屑/搜索/用户） | `#default` 槽位里的 `.topbar`，折叠按钮调 `toggleSidebar` |
| 标签页（tags-view） | `src/components/shell/TagsView.vue` + `src/stores/tabs.ts`，工作台固定不可关 |
| 布局设置抽屉 | 右栏 `shell.layout` 面板：`src/components/shell/LayoutSettingsPanel.vue` |
| 右侧属性/详情面板 | 右栏内容宿主 `#app-frame-rightbar-content`，页面用 `Teleport` 投递（见组态工作台） |

## 右栏面板契约（页面怎么用）

```ts
import { closeRightPanel, openRightPanel, updateRightPanel, useRightPanel } from '@/shared/shell'

openRightPanel({ id: 'scada.inspector', title: '图元属性', hint: '选中图元后编辑绑定' })
updateRightPanel('scada.inspector', { hint: '已选中 2 个图元' })
closeRightPanel('scada.inspector')   // 只有当前持有者能关，路由切换不会误关别人的面板
```

- 同一时刻只有一个持有者：后开的替换先开的；
- 宿主元素常驻（右栏关闭时用 `v-show` 隐藏），`Teleport` 不会因为目标消失而丢内容；
- 页面用 `v-if` 等宿主就绪后再挂 `Teleport`，避免首帧「target not found」。

## 同步上游

```bash
gh repo sync zjarlin/deepseek-harness            # fork 跟上游对齐
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/deepseek-ai/deepseek-harness /tmp/dsh-src
git -C /tmp/dsh-src show HEAD:packages/client/ui-layout/src/client/columns.ts   # 只读对比
```

对比顺序：`columns.ts` → `service.ts` → `AppFrame.tsx`。
只要几何或方法语义变了，先改 `packages/app-frame`，再改调用方；不要绕过服务直接改宽度。
