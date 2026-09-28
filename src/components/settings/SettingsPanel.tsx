import { useState } from 'react'
import { api } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'

export function SettingsPanel({ active }: { active: boolean }) {
  const settings = usePolling(() => api.settings(), 60_000)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  if (!active) return null

  const save = async () => {
    setMsg(null)
    const patch: Record<string, unknown> = {}
    if (baseUrl.trim()) patch.deepseekBaseUrl = baseUrl.trim()
    if (model.trim()) patch.model = model.trim()
    if (apiKey.trim() && !apiKey.includes('***')) patch.deepseekApiKey = apiKey.trim()
    await api.saveSettings(patch)
    setApiKey('')
    await settings.refresh()
    setMsg('已保存')
  }

  const test = async () => {
    setTesting(true)
    setMsg(null)
    try {
      const r = await api.aiTest(apiKey.trim() || undefined)
      setMsg(r.ok ? `连通正常：${r.reply}` : `失败：${r.error}`)
      if (r.ok && apiKey.trim()) {
        await settings.refresh()
        setApiKey('')
      }
    } catch (e: any) {
      setMsg(`失败：${e?.message ?? '请求异常'}`)
    }
    setTesting(false)
  }

  const s = settings.data

  return (
    <div className="panel-page">
      <div className="section-title">设置</div>
      <div className="card settings-form">
        <div className="field">
          <label>LLM API Key（DeepSeek 等 OpenAI 兼容接口）</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={s?.hasKey ? `已配置（${s.keySource === 'env' ? '来自 .env' : '来自设置'}：${s.maskedKey}）` : 'sk-...'}
          />
          <div className="hint" style={{ marginTop: 4 }}>
            {s?.keySource === 'env' ? '当前 Key 来自 .env，优先级高于此处' : '保存到 data/settings.json（本地文件，勿提交仓库）'}
          </div>
        </div>
        <div className="field">
          <label>API Base URL</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={s?.deepseekBaseUrl ?? 'https://api.deepseek.com'} />
        </div>
        <div className="field">
          <label>模型</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={s?.model ?? 'deepseek-chat'} />
        </div>
        <div className="form-row">
          <button className="btn" onClick={save}>
            保存
          </button>
          <button className="btn" onClick={test} disabled={testing}>
            {testing ? '测试中…' : '测试连通'}
          </button>
          {msg && <span className="hint">{msg}</span>}
        </div>
        <div className="hint" style={{ marginTop: 12 }}>
          行情刷新间隔 {s?.refreshIntervalMs ?? 5000}ms · 预警检测间隔 {s?.alertCheckIntervalMs ?? 5000}ms（可在 data/settings.json 修改）
        </div>
      </div>
    </div>
  )
}
