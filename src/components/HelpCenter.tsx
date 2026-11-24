import { useEffect, useRef, useState } from 'react'

const GUIDE_STEPS = [
  {
    eyebrow: '欢迎',
    title: '从自选开始，安静看盘',
    body: '这里集中了行情、K 线、持仓和预警。数据保存在本机，不提供交易功能。用 1 分钟了解四个常用操作，也可以随时跳过。',
    note: '默认显示简洁导航，完整能力可在“更多”或切换到“完整”后找到。',
  },
  {
    eyebrow: '第 1 步 · 自选行情',
    title: '搜索股票，加入自选',
    body: '在顶部搜索框输入 6 位代码、名称或拼音。选择结果后会打开 K 线，并自动加入自选；重复添加不会产生重复记录。',
    note: '点击自选列表中的任意一行，即可查看该股票的 K 线。',
  },
  {
    eyebrow: '第 2 步 · K 线图',
    title: '看懂周期与指标',
    body: '日 K、周 K、月 K 用于观察不同时间尺度。MA、BOLL、MACD、KDJ、RSI 都是辅助参考指标，可以按需开关，不必一次全部打开。',
    note: '红色表示上涨，绿色表示下跌；指标解释可在“帮助 → 术语帮助”中查看。',
  },
  {
    eyebrow: '第 3 步 · 可选',
    title: '需要时再配置 AI',
    body: 'AI 个股诊断和每日复盘需要自己的 API Key。此步骤可跳过，不配置 AI 也不影响行情、持仓和预警。',
    note: '在“更多 → 设置”中填写 Key、接口地址和模型，并可先测试连通。',
  },
  {
    eyebrow: '第 4 步 · 预警',
    title: '创建一个到价提醒',
    body: '填写股票代码、名称和阈值。可以选择价格或涨跌幅条件；单次预警触发后会自动停用，避免重复提醒。',
    note: '桌面版通过系统提醒通知，应用需要保持运行才能持续监控。',
  },
]

interface GuideProps {
  onClose: () => void
  onFinish: () => void
}

export function OnboardingGuide({ onClose, onFinish }: GuideProps) {
  const [step, setStep] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const current = GUIDE_STEPS[step]

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons?.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="guide-card card" role="dialog" aria-modal="true" aria-labelledby="guide-title" ref={dialogRef} onKeyDown={onKeyDown}>
        <div className="guide-topline">
          <span>新手引导</span>
          <button type="button" className="icon-btn" aria-label="跳过并关闭引导" onClick={onClose}>×</button>
        </div>
        <div className="guide-progress" aria-label={`第 ${step + 1} 步，共 ${GUIDE_STEPS.length} 步`}>
          {GUIDE_STEPS.map((item, index) => <span key={item.eyebrow} className={index === step ? 'active' : index < step ? 'done' : ''} />)}
        </div>
        <div className="guide-content">
          <span className="eyebrow">{current.eyebrow}</span>
          <h2 id="guide-title">{current.title}</h2>
          <p>{current.body}</p>
          <div className="hint guide-note">{current.note}</div>
        </div>
        <div className="guide-footer">
          <button type="button" className="btn ghost" onClick={onClose}>跳过引导</button>
          <div className="toolbar-spacer" />
          {step > 0 && <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>上一步</button>}
          <button type="button" className="btn primary" onClick={() => step === GUIDE_STEPS.length - 1 ? onFinish() : setStep((s) => s + 1)}>
            {step === 0 ? '开始了解' : step === GUIDE_STEPS.length - 1 ? '开始使用' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}

const TERMS = [
  { term: '涨跌幅', text: '当前价格相对昨收价的变化比例：（现价 − 昨收）÷ 昨收 × 100%。正数为上涨，负数为下跌。' },
  { term: '换手率', text: '一定时间内成交量占流通股本的比例，反映股票交易的活跃程度。高换手不一定代表上涨或下跌。' },
  { term: '成本价', text: '本工具中填写的买入均价。浮动盈亏按（现价 − 成本价）× 数量估算，未计入手续费和税费。' },
  { term: '单次预警', text: '条件首次满足后自动标记为已触发并停用，避免同一条预警反复提醒。需要再次提醒时可重新启用或创建。' },
  { term: 'MA', text: '移动平均线，用一段时间内的平均价格平滑波动，用于辅助观察趋势方向。' },
  { term: 'BOLL', text: '布林带，由中轨和上下轨组成，用于观察价格波动区间。触及轨道并不等于必然反转。' },
  { term: 'MACD', text: '指数平滑异同移动平均线，通过快慢线及柱状变化辅助判断趋势和动量。' },
  { term: 'KDJ', text: '随机指标，综合价格在一定区间内的位置，常用于辅助观察短期超买、超卖和转折。' },
  { term: 'RSI', text: '相对强弱指标，比较一段时间内上涨与下跌的幅度，常用于辅助判断买卖力量强弱。' },
]

export function TermHelp({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const normalized = query.trim().toLowerCase()
  const filtered = TERMS.filter((item) => `${item.term}${item.text}`.toLowerCase().includes(normalized))

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => previous?.focus()
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="help-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="term-help-title"
        ref={dialogRef}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key !== 'Tab') return
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input, button')
          if (!focusable?.length) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }}
      >
        <div className="dialog-heading">
          <div><span className="eyebrow">帮助</span><h2 id="term-help-title">术语帮助</h2></div>
          <button type="button" className="icon-btn" aria-label="关闭术语帮助" onClick={onClose}>×</button>
        </div>
        <input className="help-search" aria-label="搜索术语" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索术语，例如 MACD" />
        {filtered.length === 0 ? (
          <div className="empty compact">没有找到相关术语</div>
        ) : (
          <dl className="term-list">
            {filtered.map((item) => <div key={item.term}><dt>{item.term}</dt><dd className="hint">{item.text}</dd></div>)}
          </dl>
        )}
        <div className="hint help-disclaimer">技术指标仅用于辅助观察，不构成投资建议。</div>
      </div>
    </div>
  )
}
