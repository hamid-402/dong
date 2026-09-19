# مرحله ۱۱ — مدل دامنه و پایگاه‌داده

مبنا: [ROADMAP-STAGE-11.md](../ROADMAP-STAGE-11.md) · وضعیت: طرح، در انتظار تأیید

قاعده: هیچ ستون یا جدول موجودی حذف یا تغییر معنا نمی‌دهد. همهٔ تغییرها `ADD COLUMN` با پیش‌فرض امن یا جدول جدید هستند.

---

## ۱. مبلغ و واحد

```
ذخیره‌سازی:    amount_minor  bigint/numeric  +  currency 'IRR'
معنای minor:   ۱ ریال = ۱ minor  (تومان = ۱۰ ریال، فقط در نمایش)
نمایش:         resolveDisplayUnit(user.displayUnit, workspace.displayUnit) → 'rial' | 'toman'
```

هیچ مهاجرت مبلغی لازم نیست. تغییر تصمیم ۱۳ فقط پیش‌فرض `workspace.display_unit` و یک ستون جدید روی کاربر است.

---

## ۲. اسکیمای `iam` — افزوده‌ها (S11-01، S11-03، S11-04، S11-13)

### `user_account` (ستون‌های جدید)
| ستون | نوع | توضیح |
|------|-----|--------|
| `username` | `text` UNIQUE NULL | فرم canonical: lowercase؛ NULL برای حساب‌های قدیمی تا انتخاب اولیه |
| `phone` | `text` UNIQUE NULL | E.164 نرمال‌شده |
| `phone_hash` | `text` INDEX NULL | `sha256(pepper ‖ phone)` برای تطبیق مخاطبین |
| `phone_verified_at` | `timestamptz` NULL | تا وصل‌شدن SMS همیشه NULL |
| `platform_role` | `text` NOT NULL DEFAULT `'user'` | `user` \| `platform_support` \| `platform_owner` |
| `display_unit` | `text` NULL | `rial` \| `toman`؛ NULL = پیروی از فضا |
| `username_changed_at` | `timestamptz` NULL | برای محدودیت تغییر مکرر |

قواعد ثابت:
- یکتایی روی `username` و `phone` حساس به حروف نیست (ذخیره در فرم canonical).
- `anonymizeAccount` باید `username` و `phone` و `phone_hash` را هم پاک کند.
- ارتقای `platform_role` به `platform_owner` از مسیر maker-checker می‌گذرد.

### `membership` (ستون‌های جدید)
| ستون | نوع | توضیح |
|------|-----|--------|
| `disabled_at` | موجود | از این پس واقعاً استفاده می‌شود |
| `disabled_by_user_id` | `uuid` NULL | عامل غیرفعال‌سازی |
| `disabled_reason` | `text` NULL | دلیل ثبت‌شده |
| `added_via` | `text` NOT NULL DEFAULT `'invite'` | `invite` \| `friend` \| `join_request` \| `user_id` \| `seed` |
| `added_by_user_id` | `uuid` NULL | چه کسی اضافه کرد |

### `workspace_role_grant` (جدید — S11-04)
| ستون | نوع |
|------|-----|
| `workspace_id` | `uuid` PK۱ |
| `role` | `text` PK۲ |
| `action` | `text` PK۳ — یکی از اقدام‌های ABAC |
| `effect` | `text` — `allow` \| `deny` |
| `updated_by_user_id` | `uuid` |
| `updated_at` | `timestamptz` |

نبود سطر = رفتار پیش‌فرض RBAC. فهرست اقدام‌های قفل‌شده در [ROLES-PERMISSIONS.md](./ROLES-PERMISSIONS.md).

### `membership_permission_override` (جدید — S11-04)
همان ساختار با `user_id` جای `role`. اولویت: override فرد > grant نقش > پیش‌فرض RBAC.

### `deputy_finance_window` (جدید — S11-04)
| ستون | نوع | توضیح |
|------|-----|--------|
| `id` | `uuid` PK | |
| `workspace_id` | `uuid` | |
| `user_id` | `uuid` | جانشین |
| `starts_at` / `ends_at` | `timestamptz` | بازهٔ اختیار |
| `reason` | `text` | مرخصی، سفر، … |
| `created_by_user_id` | `uuid` | مادرخرج یا مالک |
| `revoked_at` | `timestamptz` NULL | |

اختیار مالی جانشین فقط وقتی `now() BETWEEN starts_at AND ends_at AND revoked_at IS NULL`.

### `workspace_join_request` (جدید — S11-03)
| ستون | نوع |
|------|-----|
| `id` | `uuid` PK |
| `workspace_id` | `uuid` |
| `user_id` | `uuid` |
| `message` | `text` NULL |
| `status` | `pending` \| `approved` \| `rejected` \| `withdrawn` \| `expired` |
| `requested_at` / `decided_at` | `timestamptz` |
| `decided_by_user_id` | `uuid` NULL |
| `granted_role` | `text` NULL |

UNIQUE جزئی: یک درخواست `pending` برای هر (workspace, user).

### `workspace_ownership_transfer` (جدید — S11-03)
`id, workspace_id, from_user_id, to_user_id, status(pending|accepted|declined|cancelled|expired), created_at, decided_at, expires_at`
انتقال دومرحله‌ای: مالک پیشنهاد می‌دهد، طرف مقابل می‌پذیرد. مالک قبلی به `admin` تنزل می‌کند نه حذف.

### `platform_break_glass` (جدید — S11-13)
`id, actor_user_id, workspace_id, reason, granted_at, expires_at, revoked_at, ticket_ref`
حداکثر بازه: ۴ ساعت. هر بازکردن → رکورد audit + رویداد امنیتی `access.break_glass_opened`.

---

## ۳. اسکیمای `social` (جدید — S11-02)

### `user_directory_setting`
| ستون | پیش‌فرض | توضیح |
|------|---------|--------|
| `user_id` PK | | |
| `findable_by_username` | `true` | |
| `findable_by_phone` | `true` | |
| `findable_by_email` | `false` | عمداً خاموش — ضدفهرست‌برداری |
| `allow_friend_requests` | `true` | |
| `allow_group_invites` | `true` | |
| `updated_at` | | |

### `friendship`
| ستون | نوع | توضیح |
|------|-----|--------|
| `id` | `uuid` PK | |
| `requester_user_id` | `uuid` | |
| `addressee_user_id` | `uuid` | |
| `pair_key` | `text` | `least(a,b)‖':'‖greatest(a,b)` — UNIQUE برای جلوگیری از درخواست دوگانه |
| `status` | `text` | `pending` \| `accepted` \| `declined` \| `blocked` |
| `blocked_by_user_id` | `uuid` NULL | چه کسی بلاک کرد |
| `note` | `text` NULL | پیام درخواست |
| `requested_at` / `responded_at` | `timestamptz` | |

قواعد ثابت:
- `requester != addressee`.
- `blocked` هر دو جهت را قطع می‌کند و درخواست جدید را رد می‌کند.
- `declined` اجازهٔ درخواست دوباره می‌دهد بعد از بازهٔ خنک‌شدن (۷ روز).

### `contact_sync_run`
`id, user_id, ran_at, submitted_count, matched_count, source(manual|device)`
**هیچ شمارهٔ خامی ذخیره نمی‌شود** — فقط آمار اجرا برای شفافیت با کاربر.

---

## ۴. اسکیمای `catalog` (جدید — S11-06)

### `unit`
| ستون | نوع | توضیح |
|------|-----|--------|
| `code` | `text` PK | `piece`, `pack`, `kg`, `g`, `l`, `ml`, `m`, `hour`, `day`, `service` |
| `label_fa` / `label_en` | `text` | عدد، بسته، کیلوگرم، … |
| `kind` | `text` | `count` \| `weight` \| `volume` \| `length` \| `time` \| `service` |
| `base_code` / `base_factor` | | برای تبدیل (گرم→کیلوگرم) |
| `is_system` | `bool` | واحد آزاد کاربر `false` |
| `workspace_id` | `uuid` NULL | NULL = سیستمی |

### `catalog_category`
`id, workspace_id (NULL=سیستمی), parent_id, name, slug, sort_order, active, created_by_user_id, created_at`
سلسله‌مراتبی مثل `expense_category` موجود؛ حداکثر دو سطح تا UI ساده بماند.

### `catalog_item`
قلمرو: هر کالا، خدمت، وعدهٔ غذایی، تنقلات یا هزینهٔ متفرقه — نه محدود به ناهار.
دو سطح مالکیت:
- `owner_kind = 'workspace'` → کاتالوگ مشترک گروه (`workspace_id` پر)
- `owner_kind = 'user'` → **منوی شخصی** (`owner_user_id` پر؛ قابل کپی/پیشنهاد به گروه)

جریان: تعریف دستی اول → بعد انتخاب در ثبت روز/خرج. پیشنهاد «پرکاربرد دیگران» از `catalog_item_usage` اعضای همان گروه می‌آید.

| ستون | نوع | اجباری |
|------|-----|:------:|
| `id` | `uuid` PK | |
| `owner_kind` | `text` | ✓ (`workspace` \| `user`) |
| `workspace_id` | `uuid` NULL | برای گروهی |
| `owner_user_id` | `uuid` NULL | برای منوی شخصی |
| `category_id` | `uuid` NULL | |
| `name` | `text` | ✓ |
| `name_normalized` | `text` | ✓ (برای یکتایی و جست‌وجو) |
| `unit_code` | `text` | ✓ |
| `reference_price_minor` | `numeric` | ✓ |
| `currency` | `text` DEFAULT `'IRR'` | |
| `description` | `text` NULL | |
| `sku` / `barcode` | `text` NULL | |
| `active` | `bool` DEFAULT `true` | |
| `created_by_user_id` | `uuid` | |
| `created_at` / `updated_at` | | |
| `archived_at` | `timestamptz` NULL | |

- UNIQUE `(workspace_id, name_normalized)` وقتی `archived_at IS NULL`.
- جست‌وجو: ایندکس `pg_trgm` روی `name_normalized`؛ در store حافظه، تطبیق زیررشته.
- `active = false` → در انتخابگر ثبت جدید نمی‌آید ولی در سوابق و صورتحساب‌های قبلی باقی است.

### `catalog_item_price`
`id, item_id, price_minor, currency, effective_from, created_by_user_id, note`
تغییر `reference_price_minor` همیشه یک سطر تاریخچه می‌سازد. خرج‌های ثبت‌شده قیمت خودشان را روی قلم نگه می‌دارند و بازنویسی نمی‌شوند.

### `catalog_item_usage`
`workspace_id, item_id, use_count, last_used_at, PK(workspace_id, item_id)`
با هر ثبت مصرف افزایش می‌یابد. «پرکاربردها» از این شمارش **واقعی** مرتب می‌شود.

### `catalog_item_pin`
`workspace_id, item_id, pinned_by_user_id, pinned_at, sort_order`
فهرست دستی مادرخرج برای تیک‌زدن روزانه؛ جدا از شمارش خودکار.

---

## ۵. اتصال کاتالوگ به خرج (S11-07)

### `expense_item` (ستون‌های جدید)
| ستون | نوع | توضیح |
|------|-----|--------|
| `catalog_item_id` | `uuid` NULL | NULL = تایپ آزاد (مسیر قدیم حفظ می‌شود) |
| `unit_code` | `text` NULL | |
| `quantity` | `numeric(18,3)` NULL | |
| `unit_price_minor` | `numeric` NULL | قیمت لحظهٔ ثبت — snapshot |

قاعدهٔ ثابت: وقتی هر سه پر باشند، `amount_minor = round(quantity × unit_price_minor)` و تست این را تضمین می‌کند.

### `daily_ledger_entry` (ستون‌های جدید)
همان چهار ستون بالا، با همان قاعده.

### `expense` (ستون‌های جدید — S11-09)
| ستون | نوع | توضیح |
|------|-----|--------|
| `funding_source_kind` | `text` NULL | `petty_cash` \| `personal_account` \| `other_member` \| `group_credit` |
| `funding_ref_id` | `uuid` NULL | شناسهٔ تنخواه / حساب / عضو / خرید اعتباری |

`paymentLines` موجود همچنان مرجع «چه کسی چقدر پرداخت کرد» است؛ این دو ستون فقط منبع مالی را روشن می‌کنند.

---

## ۶. صورتحساب و فاکتور (S11-08)

### `member_invoice_line` (ستون‌های جدید)
`expense_item_id`, `catalog_item_id`, `item_name_snapshot`, `unit_code`, `quantity`, `unit_price_minor`, `share_ratio`

امروز خط در سطح split است؛ با این ستون‌ها به سطح قلم می‌رسد. خطوط قدیمی با `expense_item_id IS NULL` معتبر می‌مانند.

### `statement_export` (جدید)
`id, workspace_id, subject_user_id, from_date, to_date, granularity(day|period|range), format(csv|json), status(pending|ready|failed), row_count, file_ref, requested_by_user_id, created_at, completed_at`

الگوی موجود `finance_export` تکرار می‌شود. PDF از صفحهٔ چاپی مرورگر تولید می‌شود (بدون وابستگی جدید و بدون ادعای سرویس PDF).

قاعدهٔ ثابت: `Σ خطوط صورتحساب عضو = Σ سهم‌های همان عضو در همان بازه` — تست zero-sum.

---

## ۷. پرداخت (S11-09) — اسکیمای `finance`

### `payment_receipt` (جدید)
| ستون | نوع | توضیح |
|------|-----|--------|
| `id` | `uuid` PK | |
| `workspace_id` | `uuid` | |
| `settlement_id` | `uuid` NULL | |
| `member_invoice_id` | `uuid` NULL | |
| `payer_user_id` | `uuid` | |
| `method` | `text` | `card_to_card` \| `cash` \| `bank_transfer` \| `gateway` |
| `amount_minor` | `numeric` | |
| `paid_at` | `timestamptz` | |
| `reference_no` | `text` NULL | شمارهٔ پیگیری |
| `dest_holder_name` | `text` NULL | نام صاحب حساب مقصد |
| `dest_last4` | `text` NULL | **فقط ۴ رقم آخر** |
| `attachment_id` | `uuid` NULL | فیش/عکس از سامانهٔ پیوست موجود |
| `status` | `text` | `submitted` \| `approved` \| `rejected` |
| `reviewed_by_user_id` / `reviewed_at` / `review_note` | | |
| `idempotency_key` | `text` UNIQUE | |

**قاعدهٔ ثابت طلایی:** فقط `status = 'approved'` ژورنال می‌سازد و بدهی را کم می‌کند. `submitted` هیچ اثر مالی ندارد. رد کردن قابل بازگشت نیست (رکورد جدید لازم است).

### `petty_cash_fund` (جدید)
`id, workspace_id, name, custodian_user_id, opening_balance_minor, currency, active, created_by_user_id, created_at`
متصدی پیش‌فرض = مادرخرج فعال.

### `petty_cash_movement` (جدید)
`id, fund_id, kind(topup|spend|return|adjust), amount_minor, expense_id NULL, settlement_id NULL, actor_user_id, occurred_at, note, idempotency_key`
مانده = جمع حرکت‌ها. قاعدهٔ ثابت: `spend` که مانده را منفی کند رد می‌شود.

### `supplier` (جدید یا استفاده از `procurement.vendor` موجود)
اول `procurement.vendor` بررسی می‌شود؛ اگر کافی بود همان استفاده می‌شود و جدول جدید ساخته نمی‌شود.

### `credit_purchase` (جدید)
`id, workspace_id, supplier_ref, amount_minor, currency, purchased_at, due_date, status(open|partially_paid|paid|overdue), expense_id NULL, created_by_user_id, note`

### `credit_purchase_payment` (جدید)
`id, credit_purchase_id, amount_minor, paid_at, source_kind, source_ref_id, actor_user_id, receipt_id NULL`
قاعدهٔ ثابت: `Σ پرداخت‌ها ≤ amount_minor`؛ برابری → `paid`.

### `payment_on_behalf` (عمق S11-09)
| ستون | نوع | توضیح |
|------|-----|--------|
| `id` | `uuid` PK | |
| `workspace_id` | `uuid` | |
| `debtor_user_id` | `uuid` | بدهکاری که تسویه می‌شود |
| `payer_user_id` | `uuid` | منبع وجه (≠ بدهکار) |
| `amount_minor` | `bigint` | |
| `settlement_id` | `uuid` NULL | در صورت لینک، مبلغ باید برابر تسویه باشد |
| `method` | `payment_receipt_method` | |
| `note` | `text` NULL | |
| `status` | `pending` \| `approved` \| `rejected` | فقط `approved` ژورنال می‌سازد |
| `initiated_by_user_id` | `uuid` | |
| `approved_by_user_id` / `approved_at` / `reject_note` / `journal_entry_id` | | |
| `idempotency_key` | `text` UNIQUE per workspace | |

تأیید: مالی **یا** پرداخت‌کننده. بدهکار برای مبالغ ≥ سقف maker-checker خودتأیید نمی‌کند.

---

## ۸. مالی شخصی (S11-10) — اسکیمای `personal`

### `income_source` (جدید)
`id, user_id, name, kind(salary|bonus|freelance|rent|other), expected_minor NULL, cadence(monthly|weekly|yearly|irregular), currency, active, created_at`

### `money_txn` (ستون‌های جدید)
`income_source_id` NULL, `savings_goal_id` NULL

### `savings_goal` (جدید)
`id, user_id, name, target_minor, currency, target_date NULL, account_id NULL, status(active|reached|archived), created_at, reached_at`
پیشرفت **محاسبه‌شده** از جمع واریزها — هیچ عدد دستی ذخیره نمی‌شود.

### `savings_goal_contribution` (جدید)
`id, goal_id, amount_minor, occurred_at, txn_id NULL, note`

### `spending_alert` (جدید)
`id, user_id, scope(total|category|group|workspace), ref_id NULL, period(month|week), limit_minor, threshold_percent, channel(inapp|email), active, last_fired_at`
تعمیم `budget.alert_percent` موجود؛ بودجهٔ ماهانه حذف نمی‌شود و به این جدول پل می‌خورد.

### `monthly_close` (جدید)
`user_id, year_month, income_minor, expense_minor, group_share_minor, personal_minor, saved_minor, top_category_id, computed_at, PK(user_id, year_month)`
جدول rollup برای «آخر ماه پولم کجا رفت». محاسبهٔ idempotent از دادهٔ خام؛ قابل بازسازی.

---

## ۹. فهرست مهاجرت‌ها

| شماره | برش | محتوا |
|-------|-----|--------|
| `0044` | S11-01 | `user_account`: username, phone, phone_hash, phone_verified_at, platform_role, display_unit, username_changed_at |
| `0045` | S11-02 | اسکیمای `social`: directory setting, friendship, contact_sync_run |
| `0046` | S11-03 | join_request, ownership_transfer, membership.added_via/disabled_* |
| `0047` | S11-04 | role_grant, permission_override, deputy_finance_window |
| `0048` | S11-05 | `workspace.display_unit` پیش‌فرض `'rial'` (فضاهای موجود دست‌نخورده) |
| `0049` | S11-06 | اسکیمای `catalog` کامل + seed واحدها و دسته‌های سیستمی |
| `0054` | S11-07 | expense_item و expense: catalog_item_id, unit_code, quantity, unit_price_minor |
| `0051` | S11-08 | member_invoice_line ستون‌های قلم + statement_export |
| `0052` | S11-09 | payment_receipt, petty_cash_fund/movement, credit_purchase/payment, expense.funding_* |
| `0058` | S11-09 depth | payment_on_behalf + journal_source payment_on_behalf |
| `0053` | S11-10 | income_source, savings_goal(+contribution), spending_alert, monthly_close, money_txn FKها |
| `0054` | S11-07 | expense catalog line FKs (موجود در درخت) |
| `0055` | S11-13 | platform_break_glass + user_account.disabled_* |

هر مهاجرت: فقط additive، با پیش‌فرض امن، بدون قفل طولانی روی جدول‌های بزرگ (ایندکس‌ها `CONCURRENTLY` در محیط زنده).

---

## ۱۰. اثر روی `capabilities`

| کلید | مقدار جدید |
|------|-------------|
| `providers.accessPolicy` | `rbac_abac_grants_v1` |
| `providers.social` | `none` \| `directory_friends_v1` |
| `providers.catalog` | `none` \| `catalog_v1` |
| `providers.statements` | `none` \| `csv_json_print_v1` |
| `providers.paymentReceipts` | `none` \| `manual_review_v1` |
| `providers.pettyCash` | `none` \| `fund_v1` |
| `providers.paymentOnBehalf` | `none` \| `on_behalf_v1` |
| `providers.savingsGoals` | `none` \| `goals_v1` |
| `providers.displayUnit` | `rial` \| `toman` (مقدار مؤثر همین درخواست) |
| `providers.platformAdmin` | `none` \| `platform_v1` |
| `providers.sms` | `none` — تا وقتی سرویس واقعی نداریم |

هیچ‌کدام مقدار ثابت `true` نمی‌گیرند؛ همه از وضعیت واقعی store و پرچم خوانده می‌شوند.
