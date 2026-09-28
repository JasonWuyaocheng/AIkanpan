// A股交易时段：周一至周五 09:30–11:30 / 13:00–15:00（不处理法定节假日）
export function isTradingHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = get('weekday')
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  return (minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900)
}
