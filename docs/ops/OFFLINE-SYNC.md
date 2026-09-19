# Offline mutation queue (R10-19)

| فیلد | مقدار |
|------|--------|
| وضعیت | پوشش کامل mutationهای معنادار کلاینت |
| capabilities | `providers.offlineSync = mutation_queue_v1` |

## رفتار

1. اگر POST هدف با شبکه/۵۰۳ شکست بخورد، payload با `idempotencyKey` در `localStorage` (`dang.offline.mutations.v1`) ذخیره می‌شود.
2. enqueue با همان `idempotencyKey` جایگزین می‌شود (نه صف تکراری)؛ سقف نرم ۵۰ مورد (قدیمی‌ترین حذف).
3. با `online` یا bootstrap chrome، صف FIFO flush می‌شود؛ روی defer، `attemptCount` / `lastAttemptAt` به‌روز می‌شود.
4. سیاست تعارض: **server-wins** — پاسخ ۴xx (غیر از ۴۰۸/۴۲۹) ⇒ حذف از صف؛ شبکه/۵۰۳ ⇒ نگه داشتن و توقف replay.
5. helper مشترک: `apps/web/src/lib/api/offline-post.ts` (`postWithOfflineQueue`).

## پوشش (enqueue) — معنادار

| دامنه | عملیات |
|--------|---------|
| خرج | draft · submit · post · approve · promote · category · recurring · CSV import |
| تسویه | claim · confirm/dispute/cancel · remind · simplify |
| صورتحساب/دوره | period · invoices · locks · payment link |
| دفتر روز | entry · CSV · range lock · post day |
| پرداخت فضای کاری | receipt · petty cash · credit · on-behalf |
| الحاقی/پیوست/نظر | addon · comment · attachment meta · notif read |
| اعضا/دعوت | workspace · member · invite · join · outing · ownership |
| مالی شخصی · کاتالوگ · تدارکات · شراکت · پیشنهاد · اجتماعی · بودجه · بازپرداخت · SaaS · گزارش/صورتحساب عضو |

## صریحاً خارج از صف

- Auth/session · preview/recompute · matchContacts
- Jobs / DLQ / ETL · vault · platform · demo seed · FX · `verifyLocalPsp`
- آپلود باینری پیوست (`uploadAttachmentContent`) · PUT/PATCH/DELETE prefs

## صداقت

| ادعا | وضعیت |
|------|--------|
| صف محلی واقعی برای mutationهای بالا | ✅ |
| dedupe idempotency + attempt metadata | ✅ |
| sync کامل PWA / CRDT / conflict UI | ❌ خارج از برش |
| IndexedDB چند‌دستگاهی | ❌ |

UI فقط وقتی `offlineQueueCount > 0` تعداد صف را نشان می‌دهد.
