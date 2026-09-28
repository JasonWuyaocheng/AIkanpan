import { useEffect, useRef, useState } from 'react'
import { api, streamAi } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'

export function AiPanel({ active, secid }: { active: boolean; secid: string }) {
  const [mode, setMode] = useState<'diagnose' | 'review'>('diagnose')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const status = usePolling(() => api.aiStatus(), 30_000)
  const watch = usePolling(() => api.watchlist(), 60_000)

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!active) return null

  const run = async () => {
    setError(null)
    setOutput('')
    setRunning(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    await streamAi(
      mode,
      mode === 'diagnose' ? { secid } : {},
      (delta) => setOutput((o) => o + delta),
      (msg) => {
        setError(msg)
        setRunning(false)
      },
      () => setRunning(false),
      ctrl.signal,
    )
  }

  const currentName = watch.data?.items.find((i) => i.secid === secid)?.name ?? secid
  const hasKey = status.data?.hasKey ?? false

  return (
    <div className="panel-page">
      <div className="section-title">AI 看盘分析</div>
      {!hasKey ? (
        <div className="card dim">
          <div className="hint">
            尚未配置 LLM API Key。请到「设置」页填入 DeepSeek API Key（或在 .env 里配置 DEEPSEEK_API_KEY 后重启）。
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ paddingLeft: 0 }}>
            <div className="seg">
              <button className={mode === 'diagnose' ? 'active' : ''} onClick={() => setMode('diagnose')}>
                个股诊断
              </button>
              <button className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}>
                每日复盘
              </button>
            </div>
            {mode === 'diagnose' && <span className="hint">诊断对象：{currentName}</span>}
            <span className="hint" style={{ flex: 1 }}>
              模型 {status.data && 'maskedKey' in status.data ? '' : ''}由设置页配置 · 输出为流式
            </span>
            <button className="btn" onClick={run} disabled={running}>
              {running ? '生成中…' : mode === 'diagnose' ? '开始诊断' : '生成复盘'}
            </button>
            {running && (
              <button
                className="btn danger"
                onClick={() => {
                  abortRef.current?.abort()
                  setRunning(false)
                }}
              >
                停止
              </button>
            )}
          </div>
          {error && <div className="hint up" style={{ marginBottom: 8 }}>{error}</div>}
          {output ? (
            <div className="ai-output">{output}</div>
          ) : (
            <div className="ai-output dim">{running ? '正在请求模型…' : '点击上方按钮开始分析（仅供参考，不构成投资建议）'}</div>
          )}
        </>
      )}
    </div>
  )
}
