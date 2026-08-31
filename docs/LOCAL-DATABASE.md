# اتصال PostgreSQL محلی

PostgreSQL روی `127.0.0.1:5432` فعال است، اما `psql` در PATH قرار ندارد. عملیات
زیر را می‌توان با Query Tool در pgAdmin انجام داد.

## 1. نقش‌ها و دیتابیس

رمزها را خودتان انتخاب کنید و در Chat، Git یا Screenshot قرار ندهید.

با اتصال مدیریتی موجود، این دستورات را جداگانه اجرا کنید:

```sql
CREATE ROLE dang_migrator
  LOGIN
  PASSWORD 'CHOOSE_A_STRONG_LOCAL_PASSWORD';

CREATE ROLE dang_runtime
  LOGIN
  PASSWORD 'CHOOSE_ANOTHER_STRONG_LOCAL_PASSWORD'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;
```

سپس خارج از Transaction:

```sql
CREATE DATABASE dang OWNER dang_migrator;
```

## 2. فایل محیط محلی

از `.env.example` یک `.env` محلی بسازید. این فایل توسط Git نادیده گرفته می‌شود.

برای Migration:

```text
DATABASE_URL=postgresql://dang_migrator:<PASSWORD>@127.0.0.1:5432/dang
```

برای Runtime در ادامه از اتصال `dang_runtime` استفاده می‌شود؛ Migration Credential
نباید در API Production قرار گیرد.

## 3. اجرای Migration از PowerShell

برای جلوگیری از ثبت رمز در فایل Repository، در همان Terminal مقدار را موقت تنظیم
کنید:

```powershell
$env:DATABASE_URL="postgresql://dang_migrator:<PASSWORD>@127.0.0.1:5432/dang"
pnpm --filter @dang/db db:migrate
Remove-Item Env:DATABASE_URL
```

## 4. Grantهای Runtime

پس از Migration، با Role مهاجرت اجرا شود:

```sql
GRANT CONNECT ON DATABASE dang TO dang_runtime;
GRANT USAGE ON SCHEMA iam, audit, app, accounting, finance, collab, procurement, asset, partnership TO dang_runtime;

GRANT SELECT, INSERT, UPDATE ON iam.user_account, iam.workspace, iam.membership, iam.invite
TO dang_runtime;
GRANT INSERT, SELECT ON audit.event TO dang_runtime;
GRANT INSERT, SELECT ON accounting.journal_entry, accounting.journal_line TO dang_runtime;
GRANT SELECT, INSERT, UPDATE ON finance.expense, finance.expense_split_line, finance.expense_payment_line, finance.settlement
TO dang_runtime;
GRANT SELECT, INSERT, UPDATE ON collab.comment, collab.attachment, collab.notification TO dang_runtime;
GRANT SELECT, INSERT, UPDATE ON procurement.need, procurement.purchase_request, procurement.budget TO dang_runtime;
GRANT SELECT, INSERT, UPDATE ON asset.vendor, asset.purchase_order, asset.delivery, asset.asset TO dang_runtime;
GRANT SELECT, INSERT, UPDATE ON partnership.agreement, partnership.contribution, partnership.partner_loan, partnership.withdrawal, partnership.period_lock TO dang_runtime;

REVOKE UPDATE, DELETE ON audit.event FROM dang_runtime;
REVOKE UPDATE, DELETE ON accounting.journal_entry, accounting.journal_line FROM dang_runtime;
```

با اضافه‌شدن Contextهای بعدی، Grantها در Migration امنیتی نسخه‌بندی می‌شوند.

## 5. قواعد اتصال API

- هر Request مربوط به Tenant باید داخل Transaction باشد.
- اولین Query، `set_config` محلی برای Workspace/User است.
- Connection خارج Transaction برای Query Tenant استفاده نمی‌شود.
- API از Role دارای `BYPASSRLS` یا Superuser استفاده نمی‌کند.
- Migration Role و Runtime Role جدا هستند.
- Ledger Postgres فقط وقتی `DATABASE_URL` و Migration `0004` اعمال شده باشد فعال است؛ در غیر این صورت memory.

## 6. وضعیت Migration

- `0000_same_nemesis.sql`: IAM، Workspace، Membership و Audit
- `0001_tenant_rls.sql`: Context Function، RLS و Audit Append-only
- `0002_membership_list_policies.sql`: سیاست‌های لیست عضویت
- `0003_invites.sql`: جدول دعوت و RLS
- `0004_accounting_journal.sql`: Journal Entry/Line + RLS (append-only)
- `0005_finance_documents.sql`: Expense, Settlement + RLS

Migrationها با `drizzle-kit check` تأیید شده‌اند، اما تا ورود Credential محلی روی
PostgreSQL اجرا نشده‌اند.
