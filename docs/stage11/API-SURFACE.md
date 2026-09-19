# مرحله ۱۱ — سطح API

مبنا: [ROADMAP-STAGE-11.md](../ROADMAP-STAGE-11.md) · پیشوند همه: `/api/v1` از وب، `/` مستقیم روی API

قواعد مشترک همهٔ endpointهای زیر:
- طرح Zod برای بدنه و query؛ خطا با قالب Problem Details موجود
- `Idempotency-Key` روی هر `POST` که رکورد مالی یا عضویت می‌سازد
- rate limit روی مسیرهای هویت، جست‌وجو، دوستی، پرداخت
- رکورد audit با `actorUserId` و نتیجه
- بدون endpoint فقط‌نمایشی: هرچه در UI دکمه دارد، اینجا رفتار واقعی دارد

---

## S11-01 — هویت حساب

| متد | مسیر | توضیح |
|-----|------|--------|
| `POST` | `/auth/register` | **گسترش**: `username` اجباری، `phone` اختیاری |
| `POST` | `/auth/login` | **گسترش**: `identifier` (ایمیل/نام‌کاربری/تلفن) در کنار `email` قدیمی |
| `GET` | `/auth/username-available?username=` | بررسی یکتایی، rate-limit شده، بدون فاش‌کردن مالک |
| `PATCH` | `/account/profile` | **گسترش**: `username`, `phone` (null برای پاک‌کردن), `displayUnit` |
| `POST` | `/account/email/change` | ایمیل جدید + رمز فعلی → ارسال تأیید، `emailVerified` صفر |
| `POST` | `/account/username/claim` | برای حساب‌های قدیمی بدون نام‌کاربری |
| `GET` | `/account/profile` | **گسترش**: `username`, `phone`, `phoneVerified`, `displayUnit`, `platformRole` |

---

## S11-02 — دایرکتوری و دوستان

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/directory/lookup?username=` یا `?phone=` | **تطبیق دقیق**؛ خروجی حداقلی: `userId, displayName, username, avatarUrl` |
| `GET` | `/account/privacy/directory` | تنظیم قابلیت یافت‌شدن |
| `PUT` | `/account/privacy/directory` | ویرایش همان |
| `GET` | `/friends` | فهرست دوستان پذیرفته‌شده |
| `GET` | `/friends/requests?direction=incoming\|outgoing` | درخواست‌های باز |
| `POST` | `/friends/requests` | `{ targetUserId, note? }` |
| `POST` | `/friends/requests/:id/accept` | |
| `POST` | `/friends/requests/:id/decline` | |
| `DELETE` | `/friends/:userId` | حذف دوستی |
| `POST` | `/friends/:userId/block` | بلاک دوطرفه |
| `DELETE` | `/friends/:userId/block` | رفع بلاک |
| `POST` | `/contacts/match` | `{ phones: string[] }` → کاربران متناظر؛ **شمارهٔ خام ذخیره نمی‌شود** |
| `GET` | `/contacts/runs` | آمار اجراهای تطبیق برای شفافیت با کاربر |

خطاهای اختصاصی: `DIRECTORY_NOT_FOUND` (همیشه یکسان، بی‌تفاوت به وجود کاربر) · `FRIEND_BLOCKED` · `FRIEND_REQUEST_COOLDOWN` · `FRIEND_REQUESTS_DISABLED`

---

## S11-03 — عضویت و مدیریت گروه

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/workspaces/:id/members` | **گسترش**: `disabledAt`, `addedVia`, `addedByUserId` |
| `POST` | `/workspaces/:id/members` | افزودن با `{ userId, role, defaultShares? }` — از دوستان یا شناسه |
| `PATCH` | `/workspaces/:id/members/:userId` | تغییر نقش و سهم پیش‌فرض |
| `POST` | `/workspaces/:id/members/:userId/disable` | `{ reason }` |
| `POST` | `/workspaces/:id/members/:userId/enable` | |
| `GET` | `/workspaces/:id/join-requests` | برای نقش‌های مدیریتی |
| `POST` | `/workspaces/:slug/join-requests` | کاربر درخواست عضویت می‌دهد |
| `POST` | `/workspaces/:id/join-requests/:reqId/approve` | `{ role }` |
| `POST` | `/workspaces/:id/join-requests/:reqId/reject` | |
| `DELETE` | `/join-requests/:reqId` | انصراف خود کاربر |
| `POST` | `/workspaces/:id/ownership-transfer` | `{ toUserId }` — پیشنهاد |
| `POST` | `/workspaces/:id/ownership-transfer/:tid/accept` | پذیرش طرف مقابل |
| `POST` | `/workspaces/:id/ownership-transfer/:tid/cancel` | |

خطاهای اختصاصی: `LAST_FINANCE_MANAGER` · `MEMBER_ALREADY_EXISTS` · `JOIN_REQUEST_PENDING` · `CANNOT_CREATE_USER_ACCOUNT`

---

## S11-04 — نقش و سطح دسترسی

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/workspaces/:id/permissions` | grantهای نقش + overrideهای فرد + فهرست اقدام‌های قفل‌شده |
| `PUT` | `/workspaces/:id/permissions/roles/:role` | `{ grants: [{ action, effect }] }` |
| `PUT` | `/workspaces/:id/permissions/members/:userId` | override فردی |
| `GET` | `/workspaces/:id/permissions/effective/:userId` | دسترسی مؤثر با دلیل هر تصمیم |
| `GET` | `/workspaces/:id/deputy-windows` | بازه‌های جانشینی |
| `POST` | `/workspaces/:id/deputy-windows` | `{ userId, startsAt, endsAt, reason, approvalCapMinor? }` |
| `POST` | `/workspaces/:id/deputy-windows/:wid/revoke` | لغو فوری |

---

## S11-05 — واحد نمایش

| متد | مسیر | توضیح |
|-----|------|--------|
| `PATCH` | `/workspaces/:id/settings` | **گسترش**: `displayUnit: 'rial' \| 'toman'` |
| `GET` | `/system/capabilities` | **گسترش**: `providers.displayUnit` = واحد مؤثر همین درخواست |

بدون endpoint جدید — واحد فقط لایهٔ نمایش است.

---

## S11-06 — کاتالوگ

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/units` | واحدهای سیستمی + واحدهای فضا |
| `POST` | `/workspaces/:id/units` | واحد آزاد |
| `GET` | `/workspaces/:id/catalog/categories` | درخت دسته |
| `POST` | `/workspaces/:id/catalog/categories` | |
| `PATCH` | `/workspaces/:id/catalog/categories/:cid` | نام، ترتیب، فعال/غیرفعال |
| `GET` | `/workspaces/:id/catalog/items?q=&categoryId=&activeOnly=&cursor=` | جست‌وجو + صفحه‌بندی |
| `POST` | `/workspaces/:id/catalog/items` | `{ name, unitCode, referencePriceMinor, description?, categoryId?, sku?, barcode? }` |
| `PATCH` | `/workspaces/:id/catalog/items/:itemId` | ویرایش؛ تغییر قیمت رکورد تاریخچه می‌سازد |
| `POST` | `/workspaces/:id/catalog/items/:itemId/deactivate` | |
| `POST` | `/workspaces/:id/catalog/items/:itemId/activate` | |
| `GET` | `/workspaces/:id/catalog/items/:itemId/prices` | تاریخچهٔ قیمت |
| `GET` | `/workspaces/:id/catalog/frequent?limit=` | پرکاربردها از شمارش **واقعی** مصرف |
| `GET` | `/workspaces/:id/catalog/pins` | فهرست دستی مادرخرج |
| `PUT` | `/workspaces/:id/catalog/pins` | ترتیب و اعضای فهرست |
| `POST` | `/workspaces/:id/catalog/import-personal` | کپی از کاتالوگ شخصی کاربر |

خطاهای اختصاصی: `CATALOG_NAME_TAKEN` · `CATALOG_ITEM_INACTIVE` · `UNIT_UNKNOWN`

---

## S11-07 — ثبت مصرف با کاتالوگ

| متد | مسیر | توضیح |
|-----|------|--------|
| `POST` | `/workspaces/:id/expenses` | **گسترش** `items[]`: `catalogItemId?`, `unitCode?`, `quantity?`, `unitPriceMinor?` |
| `POST` | `/workspaces/:id/ledger/day` | **گسترش**: قلم‌های جمعی + انتخاب فردی در یک درخواست |
| `GET` | `/workspaces/:id/ledger/day/:date/template` | قالب روز از پرکاربردها + انتخاب دیروز |

قاعدهٔ اعتبارسنجی سرور: اگر `quantity` و `unitPriceMinor` هر دو باشند، `amountMinor` باید با `round(quantity × unitPriceMinor)` برابر باشد، وگرنه `AMOUNT_MISMATCH`.

---

## S11-08 — صورتحساب

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/workspaces/:id/statements?from=&to=&granularity=` | خلاصهٔ همهٔ اعضا (نقش مالی) |
| `GET` | `/workspaces/:id/statements/:userId?from=&to=` | صورتحساب ریز یک عضو |
| `POST` | `/workspaces/:id/statements/:userId/exports` | `{ from, to, format: 'csv' \| 'json' }` |
| `GET` | `/workspaces/:id/statements/exports/:exportId` | وضعیت و لینک دانلود |
| `GET` | `/workspaces/:id/statements/exports/:exportId/download` | فایل واقعی |

خروجی صورتحساب هر خط: `date, itemName, catalogItemId?, unitCode?, quantity?, unitPriceMinor?, totalMinor, shareRatio, shareMinor, expenseId, splitMethod, paidBy`

قاعدهٔ ثابت تست‌شده: `Σ shareMinor` صورتحساب = `Σ` سهم همان عضو در همان بازه.

---

## S11-09 — پرداخت

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/workspaces/:id/payments/receipts?status=` | فیش‌ها |
| `POST` | `/workspaces/:id/payments/receipts` | `{ settlementId?, memberInvoiceId?, method, amountMinor, paidAt, referenceNo?, destHolderName?, destLast4?, attachmentId? }` |
| `POST` | `/workspaces/:id/payments/receipts/:rid/approve` | **فقط اینجا ژورنال ساخته می‌شود** |
| `POST` | `/workspaces/:id/payments/receipts/:rid/reject` | `{ note }` |
| `GET` | `/workspaces/:id/payments/petty-cash` | صندوق‌ها + مانده محاسبه‌شده |
| `POST` | `/workspaces/:id/payments/petty-cash` | ساخت صندوق |
| `POST` | `/workspaces/:id/payments/petty-cash/:fid/movements` | `{ kind, amountMinor, expenseId?, note }` |
| `GET` | `/workspaces/:id/payments/credit-purchases?status=` | خریدهای اعتباری |
| `POST` | `/workspaces/:id/payments/credit-purchases` | `{ supplierRef, amountMinor, purchasedAt, dueDate, expenseId? }` |
| `POST` | `/workspaces/:id/payments/credit-purchases/:cid/payments` | `{ amountMinor, sourceKind, sourceRefId?, receiptId? }` |
| `GET` | `/workspaces/:id/payments/on-behalf?status=` | پرداخت‌های به‌جای (pending/approved/rejected) |
| `POST` | `/workspaces/:id/payments/on-behalf` | `{ debtorUserId, payerUserId, amountMinor, settlementId?, method, note? }` — تا approve ژورنال ندارد |
| `POST` | `/workspaces/:id/payments/on-behalf/:oid/approve` | مالی یا پرداخت‌کننده؛ ژورنال `payment_on_behalf` |
| `POST` | `/workspaces/:id/payments/on-behalf/:oid/reject` | `{ note }` |
| `POST` | `/payments/gateway/callback` | **گسترش**: پس از verify واقعی، تسویهٔ متناظر `confirm` می‌شود |

خطاهای اختصاصی: `RECEIPT_SELF_REVIEW` · `RECEIPT_ALREADY_REVIEWED` · `PETTY_CASH_INSUFFICIENT` · `CREDIT_OVERPAY` · `GATEWAY_NOT_CONFIGURED` · `ON_BEHALF_UNAUTHORIZED` · `ON_BEHALF_AMOUNT_MISMATCH` · `ON_BEHALF_DEBTOR_SELF_APPROVE` · `ON_BEHALF_ALREADY_REVIEWED`

---

## S11-10 — مالی شخصی

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/personal/income-sources` | |
| `POST` | `/personal/income-sources` | |
| `PATCH` | `/personal/income-sources/:sid` | |
| `GET` | `/personal/savings-goals` | با پیشرفت محاسبه‌شده |
| `POST` | `/personal/savings-goals` | `{ name, targetMinor, targetDate?, accountId? }` |
| `PATCH` | `/personal/savings-goals/:gid` | |
| `POST` | `/personal/savings-goals/:gid/contributions` | `{ amountMinor, occurredAt, txnId? }` |
| `GET` | `/personal/alerts` | |
| `PUT` | `/personal/alerts` | مجموعهٔ هشدارها |
| `GET` | `/personal/monthly-close?yearMonth=` | تحلیل ماه |
| `POST` | `/personal/monthly-close/recompute` | بازسازی idempotent از دادهٔ خام |
| `GET` | `/personal/overview?scope=personal\|group\|combined` | **گسترش** نمای موجود |

---

## S11-11 — دادهٔ نمودار

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/workspaces/:id/charts/expense-trend?months=` | روند خرج |
| `GET` | `/workspaces/:id/charts/member-share?from=&to=` | سهم اعضا |
| `GET` | `/workspaces/:id/charts/category-mix?from=&to=` | ترکیب دسته |
| `GET` | `/workspaces/:id/charts/balance-over-time?from=&to=` | مانده در زمان |
| `GET` | `/personal/charts/income-vs-expense?months=` | درآمد در برابر هزینه |
| `GET` | `/personal/charts/budget-burn?yearMonth=` | سوخت بودجه |
| `GET` | `/personal/charts/goal-progress` | پیشرفت اهداف |

هر پاسخ شامل `points[]` و `emptyReason?` است تا UI بتواند حالت خالی صادق نشان دهد. منبع همه: انبار تحلیلی روزانه، `money_txn`، `monthly_close`، تجمیع `expense` — هیچ عدد ساختگی.

---

## S11-13 — کنسول سامانه

| متد | مسیر | توضیح |
|-----|------|--------|
| `GET` | `/platform/users?q=&cursor=` | جست‌وجوی کاربر (فقط `platform_owner`) |
| `PATCH` | `/platform/users/:uid/role` | تعیین نقش سامانه؛ ارتقا به owner از maker-checker |
| `POST` | `/platform/users/:uid/password-reset` | ارسال لینک بازنشانی |
| `POST` | `/platform/users/:uid/disable` | |
| `GET` | `/platform/flags` | پرچم‌های محصول از env واقعی |
| `GET` | `/platform/security-events?cursor=&category=&severity=` | رویدادهای امنیتی (store + فیلتر) |
| `POST` | `/platform/break-glass` | `{ workspaceId, reason, expiresInMinutes }` |
| `POST` | `/platform/break-glass/:bid/revoke` | |
| `GET` | `/platform/break-glass` | بازه‌های فعال و تاریخچه |

برای نقش‌های غیرمجاز همهٔ این مسیرها **۴۰۴** برمی‌گردانند تا وجودشان فاش نشود.

---

## S11-14 — دادهٔ راه‌اندازی

| متد | مسیر | توضیح |
|-----|------|--------|
| `POST` | `/demo/seed/colleagues` | سناریوی همکاران؛ فقط با اقدام صریح، مسدود در production |
| `DELETE` | `/demo/seed/colleagues` | پاک‌کردن کامل رکوردهای برچسب‌دار دمو |

از `assertDemoSeedAllowed` موجود استفاده می‌کند. هیچ auto-seed خاموشی وجود ندارد.
