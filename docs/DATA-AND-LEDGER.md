# مدل دامنه، داده و دفترکل

## 1. مفاهیم اصلی

- Person، Workspace، Membership، Role، Project
- Money Account، Transaction Document
- Payment Line: چه کسی از چه منبعی پرداخت کرده
- Allocation Line: هزینه متعلق به چه شخص/پروژه/دسته‌ای است
- Obligation: بدهکار، بستانکار، مبلغ و منشأ
- Settlement و Settlement Evidence
- Budget و Commitment
- Need، Purchase Request، Approval، Order و Receipt
- Partner Agreement، Capital Event و Ownership Share
- Vendor
- Asset، Assignment و Asset Event
- Attachment، Comment، Revision و Audit Event

## 2. تفکیک‌های حیاتی

- سند، حرکت پول و تعهد سه مفهوم جدا هستند.
- سهم پرداخت، سهم مصرف و سهم مالکیت یکی نیستند.
- هزینه قابل بازپرداخت، آورده سرمایه و قرض شریک یکی نیستند.
- مالک تجهیز، استفاده‌کننده و امین نگهداری می‌توانند متفاوت باشند.
- مانده داده قابل ویرایش نیست؛ Projection حاصل از Ledger است.

## 3. سیاست پول و زمان

- واحد Canonical ذخیره‌سازی: ریال
- نوع: Integer یا `numeric(38,0)`
- تومان فقط Display Conversion صریح است: هر تومان = ۱۰ ریال
- `float` و `double` برای مبلغ ممنوع
- Currency روی هر سند و خط صریح است.
- لحظه‌ها با UTC و `timestamptz`
- تاریخ تجاری با `date`
- تقویم جلالی فقط Input/Presentation
- Timezone متعلق به Workspace است.

## 4. دفترکل دوبل

جداول پایه:

```text
accounting.accounts
accounting.fiscal_periods
accounting.journals
accounting.journal_entries
accounting.journal_lines
accounting.reconciliations
accounting.account_balances  # projection
```

هر Journal Entry:

- Workspace
- Currency
- وضعیت Draft/Pending/Posted/Reversed
- Effective At و Recorded At
- Source Type/ID
- Actor و Reason
- Idempotency Key
- Reversal Reference
- Version

## 5. Invariantها

1. جمع Debit و Credit هر Entry و Currency برابر است.
2. Entry بدون Line یا Line با مبلغ نامعتبر ثبت نمی‌شود.
3. هر Line فقط Debit یا Credit دارد.
4. Posted Entry تغییر یا حذف نمی‌شود.
5. اصلاح با Reversal و Replacement.
6. دوره بسته Posting جدید نمی‌پذیرد.
7. Business State، Journal، Audit و Outbox اتمیک‌اند.
8. Source و Idempotency Key در Workspace یکتا هستند.
9. Balance Projection از Journal قابل بازسازی است.
10. Rounding Rule از قبل مشخص و تست‌شده است.

تعادل باید علاوه بر Application، در سطح Database Posting Function یا Constraint
کنترل شود.

## 6. نمونه حساب‌ها

- طلب از هر عضو
- تعهد به هر عضو
- تعهد به فروشنده
- هزینه بر اساس دسته
- خرید دارایی
- پرداخت در راه
- Clearing درگاه
- کارمزد پرداخت
- Rounding Adjustment
- Suspense برای موارد نامشخص

## 7. Posting سناریوها

### خرج مشترک

پرداخت‌کننده بستانکار و مصرف‌کنندگان بر اساس Allocation بدهکار می‌شوند.

### تسویه

یک سند مستقل ایجاد می‌شود و Obligationها را کاهش می‌دهد. مانده مستقیم ویرایش
نمی‌شود. پرداخت ادعاشده تا تأیید طرف مقابل یا Verify Provider قطعی نیست.

### آورده شریک

حساب سرمایه شریک افزایش می‌یابد؛ لزوماً بازپرداخت فوری ندارد.

### قرض شریک

تعهد بازپرداخت مستقل ایجاد می‌شود و مالکیت را تغییر نمی‌دهد.

### برداشت

حساب جاری/سرمایه شریک کاهش می‌یابد و هزینه پروژه محسوب نمی‌شود.

## 8. Tenancy

- یک Cluster و Database
- Schema به‌ازای Context، نه Tenant
- `workspace_id NOT NULL` روی تمام داده‌های Tenant
- Composite FK و Unique Index شامل Workspace
- UUID غیرقابل حدس برای شناسه عمومی
- `SET LOCAL app.workspace_id` در Transaction
- `ENABLE/FORCE ROW LEVEL SECURITY`
- Runtime Role بدون `BYPASSRLS` و بدون مالکیت Table
- Worker با Tenant Context صریح
- Test Cross-tenant روی Endpoint، File، Search، Export و Queue

RLS دفاع دوم است؛ Authorization دامنه در Application نیز اجباری است.

## 9. Migration

- Versioned و Forward-only
- Expand → Backfill → Switch → Contract
- اجرای `drizzle push` در Staging/Production ممنوع
- Migration تولیدشده برای Ledger و RLS بازبینی دستی می‌شود.
- Schema Drift در CI بررسی می‌شود.
- Migration روی DB خالی و Snapshot قبلی تست می‌شود.
- عملیات بزرگ Resumable و Observable است.
- Down Migration مخرب خودکار وجود ندارد.

## 10. Consistency

- Mutation حساس دارای Idempotency Key.
- همان Key و Payload یکسان پاسخ قبلی را برمی‌گرداند.
- همان Key و Payload متفاوت، Conflict است.
- Outbox و تغییر دامنه در یک Transaction.
- Consumer دارای Inbox/Deduplication.
- Optimistic Lock برای Settlement، Asset Transfer و Approval.
- Serialization Failure با Backoff محدود Retry می‌شود.
