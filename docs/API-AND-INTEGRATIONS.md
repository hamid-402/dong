# API و یکپارچه‌سازی

## قرارداد عمومی

- Base path: `/api/v1`
- Content type: JSON
- Contract: OpenAPI
- Error: `application/problem+json`
- Time: ISO-8601 UTC
- Money: integer minor unit + ISO currency
- Pagination: Cursor
- Mutation حساس: `Idempotency-Key`
- Concurrency: `If-Match` یا Version
- Trace: `X-Request-Id`

## Resourceهای پایه

```text
/workspaces
/memberships
/projects
/expenses
/settlements
/needs
/purchase-requests
/approvals
/purchase-orders
/receipts
/assets
/partnerships
/documents
/reports
/jobs
/webhooks/{provider}
```

## Command و Query

- Query هیچ Side Effect ندارد.
- Command مالی Actor، Workspace، Reason و Idempotency دارد.
- عملیات طولانی `202 Accepted` و Job Resource برمی‌گرداند.
- Response Schema صریح است تا فیلد حساس تصادفی منتشر نشود.
- Client از OpenAPI تولید می‌شود؛ Type دستی تکراری ممنوع است.

## Webhook

هر Event:

- Event ID یکتا
- Timestamp
- Type و Version
- Workspace داخلی
- Payload حداقلی
- HMAC Signature

Consumer باید Replay Window، Signature، Deduplication و Idempotency را کنترل کند.
Ordering تضمین‌شده فرض نمی‌شود.

## Payment Provider Port

```text
createPayment
verifyCallback
queryTransaction
refund
```

- Callback مرورگر معتبر نیست مگر با Query سروربه‌سرور.
- مبلغ، Currency و Provider Reference تطبیق داده می‌شوند.
- Timeout وضعیت Unknown است.
- Provider Success یک Domain Command جدا برای Posting تولید می‌کند.

## OCR Port

```text
submitDocument
getStatus
getExtractedFields
cancel
```

خروجی OCR دارای Confidence و Model Version است و قبل از Domain Command به Human
Review می‌رود.

## Notification Port

- In-app
- Web Push
- SMS
- Email

Templateها Versioned و قابل Preview هستند. SMS/Push متن حساس یا حساب کامل ندارند.

## Accounting Integration

در فاز نخست:

- Excel/PDF Export
- Mapping قابل تنظیم دسته و مرکز هزینه

در نسخه بعد:

- API Adapter
- Webhook یا Scheduled Export

Dual Write به دیتابیس حسابداری ممنوع است. Integration از Contract و Adapter عبور
می‌کند.

## Personal finance (`/me/finance`)

مالیه شخصی روی کاربر است (نه فقط یک workspace گروهی):

| مسیر | نقش |
|------|-----|
| `GET /me/finance/overview?from&to` | پرداخت/سهم در بازه + مانده فعلی هر فضای عضو |
| `GET /me/finance/trends?from&to&groupBy=day\|week\|month` | سری زمانی واقعی از خرج گروهی + هزینه کیف شخصی |
| `GET/POST /me/finance/accounts` … | حساب‌های نقد/بانک کاربر |
| `GET/POST /me/finance/transactions` | تراکنش‌های کیف شخصی |
| `GET/POST /me/finance/budgets` | بودجه ماهانه؛ هشدار `warn`/`exceeded` → نوتیف in-app روی دفتر شخصی با `metadata.route=/me` |
| `GET/POST /me/finance/categories` | دسته‌بندی شخصی |
| `GET/POST /me/finance/exports` | CSV واقعی از overview/تراکنش‌ها |

یکتایی «دفتر من»: جدول `iam.personal_workspace` (یک `user_id` → یک `workspace_id`)؛ `ensurePersonalWorkspace` idempotent است.

### دفتر روزانه گروه (`/workspaces/:id/daily-ledger`)

| مسیر | توضیح |
|---|---|
| `GET …/daily-ledger` | ماتریس روز×عضو؛ فقط `expense.source=daily_ledger` |
| `GET …/daily-ledger/export.csv` | خروجی CSV (جلالی + اقلام) |
| `PUT …/days/:date` | تعطیلی دستی / یادداشت؛ تعطیل → reverse فقط قلم‌های دفتر؛ برداشتن تعطیلی → restore |
| `POST …/entries` | ثبت کالا+مبلغ (عضو یا shared) |
| `PATCH/DELETE …/entries/:id` | ویرایش (reverse+create) / حذف |
| `POST …/import` | ورود CSV: `date_iso,column,item_name,amount_toman` |
| `GET/POST …/range-locks` | قفل بازه (owner/admin/finance) |
| `POST …/range-locks/:id/unlock` | باز کردن قفل |

تعطیلی: reverse فقط `source=daily_ledger`؛ با برداشتن تعطیلی از روی idهای ذخیره‌شده recreate می‌شود.

## یکپارچه‌سازی‌ها (زیرساخت آماده / فعال‌سازی صریح)

از `/system/capabilities` و فیلد `integrationsReady` بخوانید — UI دکمه جعلی نشان ندهد.

| قابلیت | زیرساخت | فعال‌سازی زنده |
|--------|---------|----------------|
| زرین‌پال | کلاینت request/verify + callback | `ZARINPAL_MERCHANT_ID` + `ZARINPAL_ENABLED=1` |
| آنتی‌ویروس | ClamAV INSTREAM + stub MIME | `CLAMAV_HOST` + `CLAMAV_ENABLED=1` |
| ایمیل SMTP | Nodemailer روی `SMTP_URL` | `EMAIL_TRANSPORT=smtp` (+ `SMTP_URL`) |
| ایمیل Resend | از قبل زنده | `RESEND_API_KEY` |
| OCR HTTP | POST به `OCR_HTTP_URL` | `OCR_ENABLED=1` |
| Worker | Redis BLPOP consumer (ioredis؛ سازگار با Redis 3+/Valkey) | `REDIS_URL` + `pnpm dev:worker` (heartbeat) |
| Jobs | بدون Redis: `inline_stub`؛ با Redis زنده + heartbeat: `stubs.backgroundWorker=false` |
| Persistence اضافه | `workspaceDay` + `workspaceRangeLock` + `account` |

مهاجرت: `0027` … `0029_workspace_day_lock`.

## Versioning

- تغییر Breaking فقط در Version جدید
- Deprecation Header و Sunset Plan
- OpenAPI Diff در CI
- Webhook Event Version مستقل
- Client حداقل یک Version قبل را در دوره گذار پشتیبانی می‌کند.
