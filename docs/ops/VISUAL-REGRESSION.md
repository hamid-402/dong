# Visual regression (R10-23 / S11-12 / D3)

## Baseline محلی (واضح)

| مورد | مقدار |
|------|--------|
| Spec | `apps/web/e2e/visual-shell.spec.ts` |
| Snapshots | `apps/web/e2e/visual-shell.spec.ts-snapshots/` |
| سطوح پایدار | `login`، `404` عمومی |
| سطوح با seed/نقش | `admin-gate`، `payments`، `approvals`، `statements`، `statements-print` (skip صادق بدون seed) |
| `maxDiffPixelRatio` | `0.02` (عمومی) / `0.03` (صفحات seeded) |
| CI سخت | **opt-in** با `VISUAL_REGRESSION=1` — پیش‌فرض خاموش (تفاوت OS/فونت) |
| CI نرم | job اختیاری با `continue-on-error` + آپلود artifact؛ hard-fail فقط پس از commit baseline لینوکس |

تولید/به‌روزرسانی baseline باید روی همان OS باشد که مقایسه می‌کند (Linux CI ≠ Windows local).

## تولید baseline لینوکس برای CI (سخت)

روی runner لینوکس (یا container هم‌سان با CI):

```bash
VISUAL_REGRESSION=1 pnpm --filter @dang/web exec playwright test e2e/visual-shell.spec.ts --update-snapshots
git add apps/web/e2e/visual-shell.spec.ts-snapshots
```

تا وقتی این snapshotهای لینوکس commit نشوند، job سخت را روشن نکنید — job نرم فقط artifact می‌سازد.

## اجرا با Chrome سیستمی (پیشنهادی روی ویندوز)

وقتی نصب Chromium باندل‌شدهٔ Playwright به‌خاطر CDN مسدود است، از کانال `chrome` استفاده کنید:

```powershell
cd apps/web
$env:PLAYWRIGHT_CHANNEL = "chrome"
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"   # اگر web از قبل روی :3005 است
$env:VISUAL_REGRESSION = "1"
pnpm exec playwright test e2e/visual-shell.spec.ts --update-snapshots
```

مقایسه بدون به‌روزرسانی baseline:

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"
$env:VISUAL_REGRESSION = "1"
pnpm exec playwright test e2e/visual-shell.spec.ts
```

یا با اسکریپت پکیج (همان envها را ست کنید):

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"
$env:VISUAL_REGRESSION = "1"
pnpm --filter @dang/web test:visual -- --update-snapshots
```

## Linux / CI

```bash
VISUAL_REGRESSION=1 pnpm --filter @dang/web exec playwright test e2e/visual-shell.spec.ts --update-snapshots
```

## سیاست

- به‌صورت پیش‌فرض در CI سخت فعال نیست (تفاوت OS/فونت).
- Gate اختیاری با `VISUAL_REGRESSION=1`.
- بدون داده جعلی؛ صفحات واقعی login/404 و در صورت seed، payments/approvals/admin.
- `PLAYWRIGHT_CHANNEL=chrome` اختیاری است؛ پیش‌فرض config همان Chromium باندل‌شده است.
