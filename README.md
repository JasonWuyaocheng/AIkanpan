# AIkanpan · AI 看盘助手

本地 Web 形态的 A 股炒股助手：自选行情、K 线技术指标、到价预警、持仓盈亏、AI 盘面分析。

## 功能

- **自选行情**：搜索添加自选股（支持名称/拼音/代码），5 秒轮询实时刷新，红涨绿跌
- **K 线图**：日/周/月蜡烛图，MA / BOLL 主图指标，VOL / MACD / KDJ / RSI 副图指标（klinecharts）
- **排行榜**：沪深 A 股涨幅榜 / 跌幅榜，10 秒刷新
- **持仓盈亏**：录入买入价与数量，实时计算浮动盈亏与持仓市值
- **到价预警**：价格/涨跌幅条件监控，后端 5 秒轮询检测，触发后 SSE 推送弹窗 + 系统通知
- **AI 分析**：接入 DeepSeek（OpenAI 兼容）流式输出——个股诊断（基于技术指标快照）与每日复盘（基于自选+持仓表现）

## 数据源

| 数据 | 来源 |
|---|---|
| 实时行情（自选/持仓/预警） | 腾讯财经 `qt.gtimg.cn` |
| K 线（日/周/月，前复权） | 腾讯财经 `web.ifzq.gtimg.cn` |
| 搜索联想 | 新浪财经 `suggest3.sinajs.cn` |
| 涨跌排行 | 新浪财经 `vip.stock.finance.sina.com.cn` |

后端统一代理并做节流缓存（行情 4s / 排行 10s / K 线盘中 60s 休市 10min / 搜索 30s），
自选列表、持仓、预警、设置持久化在 `data/*.json`（已 gitignore）。

## 运行

```bash
npm install
npm run dev        # 后端 :8787 + 前端 :5173，浏览器打开 http://localhost:5173
```

生产模式：

```bash
npm run build      # 构建前端到 dist/
npm start          # 后端托管 dist/，只访问 :8787 即可
```

## AI 配置

二选一：

1. 复制 `.env.example` 为 `.env`，填入 `DEEPSEEK_API_KEY=`（优先级更高，改后需重启）
2. 在应用「设置」页填入 API Key（保存到 `data/settings.json`），支持修改 Base URL 与模型名

无 Key 时 AI 页面显示引导，其余功能不受影响。

## 注意

- 仅支持北京时间周一至周五 09:30–11:30 / 13:00–15:00 的交易时段判断，不处理法定节假日（休市时显示最近收盘数据）
- AI 输出仅供参考，不构成投资建议
- `data/settings.json` 含 API Key，勿提交仓库（已在 .gitignore）
