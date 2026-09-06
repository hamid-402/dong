# فاز ۰ CI — یادداشت عملیاتی

## انجام‌شده در کد

- `.github/workflows/ci.yml`: سرویس Postgres 17، `db:migrate`، `db:check`، bootstrap نقش `dang_runtime` (NOBYPASSRLS)، سپس `pnpm test` روی همان نقش
- `packages/db/scripts/ci-bootstrap-runtime.{sql,mjs}`: ساخت نقش runtime + grantها
- `cross-tenant.test.ts`: اگر اتصال BYPASSRLS/superuser باشد fail می‌کند (نه skip خاموش)
- secret scan با gitleaks؛ `pnpm audit --audit-level=high` (فعلاً continue-on-error تا پین نسخه‌ها در فاز ۴)

## تنظیم Branch Protection (۰.۲)

با `gh` (پس از `gh auth login`):

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

یا در UI: Settings → Branches → Branch protection rule برای `main`:

1. Require a pull request before merging (اختیاری ولی توصیه‌شده)
2. **Require status checks to pass** → وضعیت job با نام `check` را required کنید
3. بدون سبز شدن CI، merge ممکن نباشد

بدون این تنظیم، فاز ۰ کامل نیست حتی اگر workflow درست باشد.

## E2E محلی

اگر دانلود مرورگر Playwright از CDN مسدود باشد، `playwright.config.ts` از Chrome سیستم (`channel: chrome`) استفاده می‌کند.
