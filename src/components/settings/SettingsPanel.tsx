import { useState } from 'react'
import { api } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { ErrorState, LoadingState, RefreshState } from '../RequestState'

export function SettingsPanel({ active }: { active: boolean }) {
  const settings = usePolling(() => api.settings(), 60_000)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!active) return null

  const desktop = window.aikanpanDesktop
  const retry = () => { settings.refresh().catch(() => undefined) }

  const save = async () => {
    setMsg(null)
    const patch: Record<string, unknown> = {}
    if (baseUrl.trim()) patch.deepseekBaseUrl = baseUrl.trim()
    if (model.trim()) patch.model = model.trim()
    if (apiKey.trim() && !apiKey.includes('***')) patch.deepseekApiKey = apiKey.trim()
    setSaving(true)
    try {
      await api.saveSettings(patch)
      setApiKey('')
      try {
        await settings.refresh()
        setMsg({ kind: 'success', text: '设置已保存' })
      } catch {
        setMsg({ kind: 'error', text: '设置已保存，但状态刷新失败，请重试' })
      }
    } catch (error: any) {
      setMsg({ kind: 'error', text: `保存失败：${error?.message ?? '请求异常'}` })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setMsg(null)
    try {
      const r = await api.aiTest(apiKey.trim() || undefined)
      setMsg(r.ok ? { kind: 'success', text: `连通正常：${r.reply}` } : { kind: 'error', text: `测试失败：${r.error}` })
      if (r.ok && apiKey.trim()) {
        setApiKey('')
        settings.refresh().catch(() => undefined)
      }
    } catch (error: any) {
      setMsg({ kind: 'error', text: `测试失败：${error?.message ?? '请求异常'}` })
    } finally {
      setTesting(false)
    }
  }

  const s = settings.data

  return (
    <div className="panel-page">
      <div className="section-heading">
        <div className="section-title">设置</div>
        <RefreshState loading={false} refreshing={settings.refreshing} error={settings.stale ? settings.error : null} stale={settings.stale} onRetry={retry} />
      </div>
      <div className="settings-layout">
        <div>
          {settings.loading ? (
            <LoadingState label="正在读取设置…" />
          ) : settings.error && !settings.data ? (
            <ErrorState message={settings.error} onRetry={retry} />
          ) : (
            <div className="card settings-form">
            <div className="field">
              <label htmlFor="settings-key">LLM API Key <span className="optional">可选</span></label>
              <input
                id="settings-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={s?.hasKey ? `已配置（${s.keySource === 'env' ? '来自环境变量' : '来自本机设置'}：${s.maskedKey}）` : 'sk-...'}
              />
              <div className="hint field-hint">
                {s?.keySource === 'env'
                  ? '当前 Key 来自环境变量，优先级高于此处。'
                  : '支持 DeepSeek 等 OpenAI 兼容接口。Key 仅保存在本机，不会发送到行情服务。'}
              </div>
            </div>
            <div className="field">
              <label htmlFor="settings-base-url">API Base URL</label>
              <input id="settings-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={s?.deepseekBaseUrl ?? 'https://api.deepseek.com'} />
            </div>
            <div className="field">
              <label htmlFor="settings-model">模型</label>
              <input id="settings-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={s?.model ?? 'deepseek-chat'} />
            </div>
            <div className="form-row settings-actions">
              <button type="button" className="btn primary" onClick={save} disabled={saving || testing}>{saving ? '保存中…' : '保存设置'}</button>
              <button type="button" className="btn" onClick={test} disabled={testing || saving}>{testing ? '测试中…' : '测试连通'}</button>
              {msg && <span className={`hint ${msg.kind === 'error' ? 'up' : 'success'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</span>}
            </div>
            <div className="settings-meta">
              <span>行情刷新间隔 {s?.refreshIntervalMs ?? 5000}ms</span>
              <span>预警检测间隔 {s?.alertCheckIntervalMs ?? 5000}ms</span>
            </div>
            </div>
          )}
        </div>
          <aside className="card newcomer-note">
            <strong>新手可以先用这些功能</strong>
            <ul>
              <li>搜索股票并加入自选，查看实时行情。</li>
              <li>打开 K 线图，按需切换周期与技术指标。</li>
              <li>记录持仓或创建到价预警，无需配置 AI。</li>
            </ul>
            <div className="hint">
              {desktop
                ? <>桌面版数据目录：<span className="path">{desktop.dataDir}</span></>
                : '当前为 Web 模式，设置由本机服务保存。'}
            </div>
            {desktop && <div className="hint">桌面版 {desktop.version}</div>}
          </aside>
      </div>
    </div>
  )
}
