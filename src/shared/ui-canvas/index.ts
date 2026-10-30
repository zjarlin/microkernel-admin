// 图纸能力的统一入口。
//
// 实现在 workspace 包 `packages/ui-canvas`（`@addzero/ui-canvas`，可独立发布）；
// 其余代码只认 `@/shared/ui-canvas`，因此将来换实现/换包名时调用方不用跟着改。
export * from '@addzero/ui-canvas'
