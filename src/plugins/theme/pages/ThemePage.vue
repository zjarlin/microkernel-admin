<script setup lang="ts">
// 外观主题：把「界面长什么样」做成可配置项，画原型的人不写 CSS 也能改整套观感。
//
// 三个入口合一：调色/圆角/密度（可视化）、AI 生成（一句话描述气质）、恢复默认。
// 改动即时预览（写 CSS 变量），「保存并发布」才写回后端给所有人。
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Refresh } from '@element-plus/icons-vue'
import { useRuntime, useService } from '@/shared/service'
import type { HttpClient } from '@/shared/http'
import { useUiStore } from '@/stores/ui'
import { DEFAULT_THEME, applyTheme, saveTheme, type ThemeResponse, type UiDensity, type UiTheme } from '@/shared/theme'

const http = useService<HttpClient>('http')
const runtime = useRuntime()
const ui = useUiStore()
// AI 是独立插件：被禁用时只是少一个加速入口，主题本身仍可手工调。
const aiEnabled = runtime.pluginEnabled('ai')

const theme = reactive<UiTheme>({ ...DEFAULT_THEME })
const saved = ref<UiTheme>({ ...DEFAULT_THEME })
const loading = ref(false)
const saving = ref(false)

const dirty = computed(() => JSON.stringify(theme) !== JSON.stringify(saved.value))

const colorFields: Array<{ key: keyof UiTheme; label: string; hint: string }> = [
  { key: 'brand', label: '主色', hint: '按钮、选中态、强调线' },
  { key: 'brandSoft', label: '主色浅底', hint: '选中背景、标签页' },
  { key: 'accent', label: '辅助色', hint: '渐变、图表第二色' },
  { key: 'appBg', label: '页面背景', hint: '内容区底色（深色模式下不生效）' },
  { key: 'surface', label: '卡片底色', hint: '面板、表格背景（深色模式下不生效）' },
  { key: 'text', label: '正文色', hint: '标题与正文（深色模式下不生效）' },
  { key: 'muted', label: '次要文字', hint: '说明文字与占位' },
]

const densities: Array<{ value: UiDensity; label: string; hint: string }> = [
  { value: 'compact', label: '紧凑', hint: '信息密度高，适合监控大屏旁的后台' },
  { value: 'cozy', label: '标准', hint: '若依式默认留白' },
  { value: 'comfortable', label: '宽松', hint: '字段少、阅读优先的页面' },
]

function preview(): void {
  applyTheme({ ...theme }, ui.dark)
}

function setColor(key: keyof UiTheme, value: string | null): void {
  if (typeof value !== 'string') return
  theme[key] = value as never
  preview()
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await http.request<ThemeResponse>('/ui/theme')
    Object.assign(theme, { ...DEFAULT_THEME, ...response.theme })
    saved.value = { ...theme }
    preview()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '读取主题失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function publish(): Promise<void> {
  saving.value = true
  try {
    const next = await saveTheme(http, { ...theme })
    Object.assign(theme, next)
    saved.value = { ...next }
    preview()
    ElMessage.success('已发布，所有人刷新后看到新外观')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败，检查是否有 system:theme:config 权限')
  } finally {
    saving.value = false
  }
}

function resetAll(): void {
  Object.assign(theme, { ...DEFAULT_THEME })
  preview()
  ElMessage.info('已恢复默认外观，点「保存并发布」才会影响其他人')
}

// ---------------- AI 生成 ----------------
const aiVisible = ref(false)
const aiPrompt = ref('')
const aiLoading = ref(false)

function openAi(): void {
  aiVisible.value = true
  if (!aiPrompt.value) aiPrompt.value = '偏工业监控风：深蓝灰主色，克制的圆角，信息密度偏高，适合值班室大屏旁边看'
}

async function generate(): Promise<void> {
  const prompt = aiPrompt.value.trim()
  if (!prompt) return
  aiLoading.value = true
  try {
    const result = await http.request<{ tokens: Partial<UiTheme>; model: string }>('/ai/theme', {
      method: 'POST',
      body: JSON.stringify({ prompt, baseline: JSON.stringify(saved.value) }),
    })
    const tokens = result.tokens ?? {}
    for (const key of Object.keys(DEFAULT_THEME) as Array<keyof UiTheme>) {
      const value = tokens[key]
      if (value === undefined || value === null) continue
      theme[key] = value as never
    }
    preview()
    aiVisible.value = false
    ElMessage.success(`已生成预览（${result.model}），满意再保存发布`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '生成失败')
  } finally {
    aiLoading.value = false
  }
}
</script>

<template>
  <div class="page" v-loading="loading">
    <header class="page-head">
      <div>
        <h1>外观主题</h1>
        <p>品牌色、圆角、密度都存在后端，改完全站生效；这里调的是「一套界面的骨架」，页面本身仍然由 schema 决定。</p>
      </div>
      <div class="page-actions">
        <el-tag v-if="dirty" type="warning" effect="plain">有未发布的改动</el-tag>
        <el-tag v-else type="success" effect="plain">与线上一致</el-tag>
        <el-button v-if="aiEnabled" :icon="MagicStick" @click="openAi">AI 生成</el-button>
        <el-button :icon="Refresh" @click="resetAll">恢复默认</el-button>
        <el-button type="primary" :loading="saving" :disabled="!dirty" @click="publish">保存并发布</el-button>
      </div>
    </header>

    <div class="theme-grid">
      <section class="panel">
        <div class="panel-title">
          <h2>颜色</h2>
          <span>十六进制，点色块可直接取色</span>
        </div>
        <div class="theme-rows">
          <div v-for="field in colorFields" :key="field.key" class="theme-row">
            <div class="theme-row__label">
              <span>{{ field.label }}</span>
              <small>{{ field.hint }}</small>
            </div>
            <el-input
              :model-value="String(theme[field.key])"
              class="theme-row__hex"
              @update:model-value="(value: string) => setColor(field.key, value)"
            />
            <el-color-picker
              :model-value="String(theme[field.key])"
              @update:model-value="(value: string | null) => setColor(field.key, value)"
            />
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>形状与密度</h2>
          <span>影响面板圆角、留白与表格行高</span>
        </div>
        <div class="theme-block">
          <label class="theme-block__label">圆角 <b>{{ theme.radius }}px</b></label>
          <el-slider
            :model-value="theme.radius"
            :min="0"
            :max="20"
            :step="1"
            show-stops
            @update:model-value="(value: number | number[]) => { theme.radius = Number(Array.isArray(value) ? value[0] : value); preview() }"
          />
        </div>
        <div class="theme-block">
          <label class="theme-block__label">内容密度</label>
          <div class="theme-densities">
            <button
              v-for="item in densities"
              :key="item.value"
              type="button"
              class="theme-density"
              :class="{ 'is-active': theme.density === item.value }"
              @click="theme.density = item.value; preview()"
            >
              <span>{{ item.label }}</span>
              <small>{{ item.hint }}</small>
            </button>
          </div>
        </div>
        <p class="theme-tip">
          深色模式由右上角的主题切换控制，这里的背景/正文色只在浅色模式生效；
          品牌色与圆角在两种模式下都生效。
        </p>
      </section>

      <section class="panel theme-preview">
        <div class="panel-title">
          <h2>实时预览</h2>
          <span>下面的组件用的就是当前 token</span>
        </div>
        <div class="theme-preview__stage">
          <div class="theme-preview__head">
            <strong>污水处理 · 实时看板</strong>
            <span class="theme-preview__badge">运行中</span>
          </div>
          <div class="theme-preview__actions">
            <el-button type="primary" size="small">新增画面</el-button>
            <el-button size="small">导出</el-button>
          </div>
          <div class="theme-preview__table">
            <div class="theme-preview__tr theme-preview__tr--head"><span>设备</span><span>状态</span><span>压力</span></div>
            <div class="theme-preview__tr"><span>1# 循环泵</span><span class="ok">运行</span><span>0.42 MPa</span></div>
            <div class="theme-preview__tr"><span>2# 循环泵</span><span class="warn">待机</span><span>0.00 MPa</span></div>
          </div>
        </div>
      </section>
    </div>

    <el-dialog v-model="aiVisible" title="AI 生成外观" width="560px">
      <el-input
        v-model="aiPrompt"
        type="textarea"
        :rows="4"
        placeholder="描述你想要的界面气质，例如：政务风、蓝色主色、方正一点、信息密度高"
      />
      <p class="theme-tip">模型只返回颜色/圆角/密度这些 token；生成结果先预览，确认后再发布。</p>
      <template #footer>
        <el-button @click="aiVisible = false">取消</el-button>
        <el-button type="primary" :loading="aiLoading" @click="generate">生成预览</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.theme-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 16px; align-items: start; }
.theme-preview { grid-column: 1 / -1; }
.theme-rows { display: flex; flex-direction: column; gap: 10px; }
.theme-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px 34px; align-items: center; gap: 10px; }
.theme-row__label { display: flex; flex-direction: column; gap: 2px; }
.theme-row__label span { font-size: 13px; color: var(--app-text); }
.theme-row__label small { font-size: 11px; color: var(--muted); }
.theme-row__hex :deep(input) { font-family: ui-monospace, monospace; font-size: 12px; }
.theme-block + .theme-block { margin-top: 20px; }
.theme-block__label { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--app-text); margin-bottom: 6px; }
.theme-block__label b { color: var(--brand); }
.theme-densities { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.theme-density {
  display: flex; flex-direction: column; gap: 4px; text-align: left; cursor: pointer;
  padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--surface); color: var(--app-text);
}
.theme-density small { color: var(--muted); font-size: 11px; line-height: 1.6; }
.theme-density.is-active { border-color: var(--brand); background: var(--brand-soft); }
.theme-tip { margin: 14px 0 0; font-size: 12px; line-height: 1.8; color: var(--muted); }
.theme-preview__stage { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-soft); padding: 16px; }
.theme-preview__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.theme-preview__head strong { font-size: 14px; color: var(--app-text); }
.theme-preview__badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--brand-soft); color: var(--brand); }
.theme-preview__actions { display: flex; gap: 8px; margin: 12px 0; }
.theme-preview__table { border-radius: calc(var(--radius) - 4px); overflow: hidden; background: var(--surface); border: 1px solid var(--line); }
.theme-preview__tr { display: grid; grid-template-columns: 1.4fr .8fr .8fr; gap: 8px; padding: 9px 12px; font-size: 12px; color: var(--app-text); }
.theme-preview__tr + .theme-preview__tr { border-top: 1px solid var(--line); }
.theme-preview__tr--head { background: var(--surface-soft); color: var(--muted); }
.theme-preview__tr .ok { color: #12b76a; }
.theme-preview__tr .warn { color: #f79009; }
@media (max-width: 1000px) { .theme-grid { grid-template-columns: 1fr; } }
</style>
