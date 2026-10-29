/** `AppFrame` 通过 `defineExpose` 暴露的句柄：宿主用它触发窄屏下也能正确工作的收起/展开。 */
export interface AppFrameHandle {
  toggleSidebar(): void
}
