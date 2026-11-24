interface LoadingStateProps {
  label?: string
  compact?: boolean
}

export function LoadingState({ label = '正在加载…', compact = false }: LoadingStateProps) {
  return (
    <div className={`loading-state${compact ? ' compact' : ''}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
  stale?: boolean
  compact?: boolean
}

export function ErrorState({ message, onRetry, stale = false, compact = false }: ErrorStateProps) {
  return (
    <div className={`error-state${compact ? ' compact' : ''}`} role="alert">
      <div>
        <strong>{stale ? '刷新失败，当前显示旧数据' : '加载失败'}</strong>
        <span className="hint">{message}</span>
      </div>
      <button type="button" className="btn small" onClick={onRetry}>
        重试
      </button>
    </div>
  )
}

interface RefreshStateProps {
  loading: boolean
  refreshing: boolean
  error: string | null
  stale: boolean
  onRetry: () => void
  label?: string
}

export function RefreshState({ loading, refreshing, error, stale, onRetry, label = '正在刷新…' }: RefreshStateProps) {
  if (loading) return <LoadingState compact label="正在加载…" />
  if (error) return <ErrorState message={error} onRetry={onRetry} stale={stale} compact />
  if (refreshing) {
    return (
      <span className="refresh-state" role="status">
        <span className="spinner" aria-hidden="true" />
        {label}
      </span>
    )
  }
  return null
}
