<script setup lang="ts">
// 槽位宿主：把内核里登记的 slot 贡献按顺序渲染出来。
//
// 与 dsh 的 `slots.render(name)` 同义：外壳只声明「这里有个槽」，
// 谁往里放东西由插件决定；宿主不 import 任何具体实现，停用插件即整块消失。
//
// `bind` 是外壳注入的上下文（例如侧栏的 `collapsed` / `toggle`），
// 以 props 形式传给贡献组件——插件仍然只依赖声明式 props，不拿外壳单例。
import { computed } from 'vue'
import { getKernel } from '@/router'
import { useKernelStore } from '@/stores/kernel'
import { useSessionStore } from '@/stores/session'
import { filterByPermission } from '@/kernel'

const props = withDefaults(
  defineProps<{
    name: string
    bind?: Record<string, unknown>
    /** 无贡献时的兜底内容由调用方用默认插槽给。 */
  }>(),
  { bind: () => ({}) },
)

const kernelStore = useKernelStore()
const session = useSessionStore()

const contributions = computed(() => {
  const kernel = getKernel()
  if (!kernel) return []
  // 依赖插件启停状态：停用一个插件，它放进去的槽内容必须立刻消失。
  void kernelStore.statuses
  const enabled = new Set(kernelStore.statuses.filter((item) => item.enabled).map((item) => item.id))
  return filterByPermission(
    kernel.slotContributions(props.name).filter((slot) => !slot.pluginId || enabled.has(slot.pluginId)),
    session.permissions,
  )
})
</script>

<template>
  <template v-for="slot in contributions" :key="slot.id">
    <component :is="slot.component" v-bind="bind" />
  </template>
  <slot v-if="contributions.length === 0" />
</template>
