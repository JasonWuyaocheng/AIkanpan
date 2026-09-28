import OpenAI from 'openai'
import type { StockQuote, KlineBar } from './emClient.js'
import { snapshot, recentBarsSummary } from './indicators.js'
import { resolveApiKey, loadSettings } from '../config.js'

export function getClient(): { client: OpenAI; model: string } | null {
  const { key } = resolveApiKey()
  if (!key) return null
  const settings = loadSettings()
  const client = new OpenAI({ apiKey: key, baseURL: settings.deepseekBaseUrl })
  return { client, model: settings.model }
}

const SYSTEM_PROMPT = `你是一位专业的A股看盘分析师。基于用户提供的技术指标和行情数据进行分析，要求：
1. 客观陈述数据反映的技术面状态（趋势、动量、量能、支撑压力位）
2. 给出多头/空头/震荡的倾向判断及理由
3. 明确提示风险，不构成投资建议
用简体中文，结构清晰，控制在 500 字以内。`

function indicatorContext(quote: { name: string; symbol: string; price: number; changePct: number }, bars: KlineBar[]): string {
  const s = snapshot(bars)
  if (!s) return '无K线数据'
  const fmt = (v: number | null, digits = 2) => (v === null ? 'N/A' : v.toFixed(digits))
  return `个股：${quote.name}（${quote.symbol}），现价 ${quote.price}，今日涨跌 ${quote.changePct}%
最新交易日：${s.date}
均线：MA5=${fmt(s.ma5)} MA10=${fmt(s.ma10)} MA20=${fmt(s.ma20)} MA60=${fmt(s.ma60)}
MACD：DIF=${fmt(s.macdDif, 3)} DEA=${fmt(s.macdDea, 3)} 柱=${fmt(s.macdHist, 3)}
KDJ：K=${fmt(s.kdjK, 1)} D=${fmt(s.kdjD, 1)} J=${fmt(s.kdjJ, 1)}
RSI：RSI6=${fmt(s.rsi6, 1)} RSI12=${fmt(s.rsi12, 1)} RSI24=${fmt(s.rsi24, 1)}
BOLL：上轨=${fmt(s.bollUpper)} 中轨=${fmt(s.bollMid)} 下轨=${fmt(s.bollLower)}
换手率：${fmt(s.turnover)}%  量比(对5日均量)：${fmt(s.volumeVs5dAvg)}

近10个交易日行情：
${recentBarsSummary(bars)}`
}

export async function* streamDiagnose(quote: StockQuote, bars: KlineBar[]): AsyncGenerator<string> {
  const got = getClient()
  if (!got) throw new Error('NO_API_KEY')
  const stream = await got.client.chat.completions.create({
    model: got.model,
    stream: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请诊断以下个股：\n\n${indicatorContext(quote, bars)}` },
    ],
  })
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}

export interface PortfolioItem {
  name: string
  symbol: string
  price: number
  changePct: number
  buyPrice: number
  pnlPct: number
  quantity: number
  pnlAmount: number
}

export async function* streamReview(
  watchlist: StockQuote[],
  portfolio: PortfolioItem[],
): AsyncGenerator<string> {
  const got = getClient()
  if (!got) throw new Error('NO_API_KEY')
  const watchLines = watchlist
    .map((q) => `${q.name}(${q.symbol}) ${q.price} ${q.changePct > 0 ? '+' : ''}${q.changePct}%`)
    .join('\n')
  const posLines = portfolio
    .map((p) => `${p.name}(${p.symbol}) 现价${p.price} 成本${p.buyPrice} 盈亏${p.pnlPct > 0 ? '+' : ''}${p.pnlPct}%`)
    .join('\n')
  const stream = await got.client.chat.completions.create({
    model: got.model,
    stream: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `请基于今日自选股和持仓表现做每日复盘总结。\n\n自选股行情：\n${watchLines || '（空）'}\n\n持仓：\n${posLines || '（空）'}`,
      },
    ],
  })
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}
