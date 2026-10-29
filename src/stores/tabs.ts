import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 顶部标签页的一项：只记路由与标题，页面内容仍由路由渲染。 */
export interface TabItem {
  path: string
  title: string
  /** 固定标签不可关闭（工作台）。 */
  affix?: boolean
}

const HOME: TabItem = { path: '/dashboard', title: '工作台', affix: true }

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([{ ...HOME }])

  function add(item: TabItem): void {
    const existing = tabs.value.find((tab) => tab.path === item.path)
    if (existing) {
      existing.title = item.title
      return
    }
    tabs.value.push({ ...item })
  }

  function canClose(path: string): boolean {
    const tab = tabs.value.find((item) => item.path === path)
    return Boolean(tab) && !tab?.affix
  }

  /** 关闭标签；返回关闭后应该停留的路由（关闭的不是当前页时返回 null，由调用方忽略）。 */
  function remove(path: string): string | null {
    if (!canClose(path)) return null
    const index = tabs.value.findIndex((tab) => tab.path === path)
    if (index < 0) return null
    tabs.value.splice(index, 1)
    return neighbor(index)
  }

  /** 关闭其它标签（固定标签保留）。 */
  function removeOthers(path: string): void {
    tabs.value = tabs.value.filter((tab) => tab.affix || tab.path === path)
  }

  /** 关闭全部（固定标签保留）。 */
  function removeAll(): string {
    tabs.value = tabs.value.filter((tab) => tab.affix)
    return HOME.path
  }

  function neighbor(index: number): string {
    const next = tabs.value[Math.min(index, tabs.value.length - 1)]
    return next?.path ?? HOME.path
  }

  function reset(): void {
    tabs.value = [{ ...HOME }]
  }

  return { tabs, add, canClose, remove, removeOthers, removeAll, reset }
})
