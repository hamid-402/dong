# Realtime SSE (R10-18)

| فیلد | مقدار |
|------|--------|
| وضعیت | برش ۱ — SSE محلی + presence درون‌فرایندی |
| capabilities | `providers.realtime = sse_local` |

## چه چیزی هست

- `GET /api/v1/workspaces/:id/notifications/stream` — Server-Sent Events
- رویدادها: `connected` · `notification` · `notification.read` · `presence.snapshot|join|leave` · `heartbeat`
- Hub درون‌فرایندی (`RealtimeHub`) — **یک instance API**؛ بدون Redis pub/sub
- کلاینت وب: `openSseStream` (fetch+stream) با **reconnect backoff** پس از قطع جریان؛ UI وضعیت «اتصال مجدد» را نشان می‌دهد
- DevAuth headers و cookie هر دو کار می‌کنند

## صداقت

| ادعا | وضعیت |
|------|--------|
| اعلان آنی روی همان process | ✅ |
| reconnect کلاینت روی قطع stream | ✅ (همان نود) |
| presence چند‌نود / sticky session ابری | ❌ خارج از برش |
| WebSocket | ❌ این برش SSE است |

اگر `providers.realtime` نباشد یا قطع شود، UI به poll نرم (~۴۵s) برمی‌گردد — بدون نشان «لایو» جعلی.
در reconnect، برچسب صادقانه «اتصال مجدد SSE (همین سرور)» است — نه ادعای multi-node.

## خارج از برش

- Redis/NATS fan-out
- typing indicators / cursor presence غنی
- WebSocket dual transport
