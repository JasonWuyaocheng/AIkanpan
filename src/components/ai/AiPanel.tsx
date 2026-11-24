import { useEffect, useRef, useState } from 'react'
import { api, streamAi } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { ErrorState, LoadingState } from '../RequestState'

interface Props {
  active: boolean
  secid: string
  onOpenSettings: () => void
}

export function AiPanel({ active, secid, onOpenSettings }: Props) {
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
  const retryStatus = () => { status.refresh().catch(() => undefined) }

  return (
    <div className="panel-page">
      <div className="section-heading">
        <div className="section-title">AI 看盘分析</div>
        {status.data && <span className="status-badge active">服务可用</span>}
      </div>
      {status.loading ? (
        <LoadingState label="正在检查 AI 配置…" />
      ) : status.error ? (
        <ErrorState message={status.error} onRetry={retryStatus} />
      ) : !status.data?.hasKey ? (
        <div className="card dim empty-config">
          <strong>AI 分析尚未配置</strong>
          <p className="hint">这是可选功能。配置 DeepSeek 或其他 OpenAI 兼容接口后，即可使用个股诊断与每日复盘；不影响行情、K线和预警。</p>
          <button type="button" className="btn" onClick={onOpenSettings}>前往设置</button>
        </div>
      ) : (
        <>
          <div className="toolbar toolbar-leading">
            <div className="seg" aria-label="分析模式">
              <button type="button" className={mode === 'diagnose' ? 'active' : ''} onClick={() => setMode('diagnose')}>个股诊断</button>
              <button type="button" className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}>每日复盘</button>
            </div>
            {mode === 'diagnose' && <span className="hint">诊断对象：{currentName}</span>}
            {watch.error && <span className="hint up">自选名称刷新失败</span>}
            <span className="toolbar-spacer" />
            <span className="hint">Key {status.data.maskedKey} · 流式输出</span>
            <button type="button" className="btn" onClick={run} disabled={running}>
              {running ? '生成中…' : mode === 'diagnose' ? '开始诊断' : '生成复盘'}
            </button>
            {running && (
              <button type="button" className="btn danger" onClick={() => { abortRef.current?.abort(); setRunning(false) }}>停止</button>
            )}
          </div>
          {error && (
            <div className="error-state compact" role="alert">
              <div><strong>分析失败</strong><span className="hint">{error}</span></div>
              <button type="button" className="btn small" onClick={run}>重试</button>
            </div>
          )}
          {output ? (
            <div className="ai-output">{output}</div>
          ) : (
            <div className="ai-output dim">{running ? '正在请求模型…' : '点击上方按钮开始分析。AI 输出仅供参考，不构成投资建议。'}</div>
          )}
        </>
      )}
    </div>
  )
}
