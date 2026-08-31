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

## Versioning

- تغییر Breaking فقط در Version جدید
- Deprecation Header و Sunset Plan
- OpenAPI Diff در CI
- Webhook Event Version مستقل
- Client حداقل یک Version قبل را در دوره گذار پشتیبانی می‌کند.
