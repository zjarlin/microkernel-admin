import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  // 侧栏收起/宽度已由 @addzero/app-frame 的布局服务管理，这里只留主题。
  const dark = ref(localStorage.getItem('micro-admin.dark') === '1')

  function toggleDark(): void {
    dark.value = !dark.value
    localStorage.setItem('micro-admin.dark', dark.value ? '1' : '0')
    document.documentElement.classList.toggle('dark', dark.value)
  }

  function apply(): void {
    document.documentElement.classList.toggle('dark', dark.value)
  }

  return { dark, toggleDark, apply }
})
