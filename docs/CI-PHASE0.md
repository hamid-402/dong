# فاز ۰ CI — یادداشت عملیاتی

## انجام‌شده در کد

- `.github/workflows/ci.yml`: سرویس Postgres 17، `db:migrate`، `db:check`، bootstrap نقش `dang_runtime` (NOBYPASSRLS)، سپس `pnpm test` روی همان نقش
- `packages/db/scripts/ci-bootstrap-runtime.{sql,mjs}`: ساخت نقش runtime + grantها
- `cross-tenant.test.ts`: اگر اتصال BYPASSRLS/superuser باشد fail می‌کند (نه skip خاموش)
- secret scan با gitleaks؛ `pnpm audit --audit-level=high` (فعلاً continue-on-error تا پین نسخه‌ها در فاز ۴)

## تنظیم Branch Protection (۰.۲)

اعمال‌شده روی `main` برای `hamid-402/dong`:

- Require status checks: **`check`** (strict)
- Enforce admins: on
- Force push / delete: off

تأیید در UI: Settings → Branches → Branch protection rule برای `main`.

با `gh` (پس از `gh auth login`) یا توکن با دسترسی admin:

```bash
gh api repos/hamid-402/dong/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["check"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

## E2E محلی

اگر دانلود مرورگر Playwright از CDN مسدود باشد، `playwright.config.ts` از Chrome سیستم (`channel: chrome`) استفاده می‌کند.
