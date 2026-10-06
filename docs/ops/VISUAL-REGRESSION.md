# Visual regression (R10-23 / S11-12 / D3 / R6)

## Baseline محلی (واضح)

| مورد | مقدار |
|------|--------|
| Spec | `apps/web/e2e/visual-shell.spec.ts` |
| Snapshots | `apps/web/e2e/visual-shell.spec.ts-snapshots/` |
| سطوح پایدار | `login`، `404` عمومی |
| سطوح با seed/نقش | `admin-gate`، `payments`، `approvals`، `statements`، `statements-print` (skip صادق بدون seed) |
| `maxDiffPixelRatio` | `0.02` (عمومی) / `0.03` (صفحات seeded) |
| CI نرم | job `visual-regression-soft` **فقط وقتی** `login-chromium-linux.png` موجود نیست — با `--update-snapshots` artifact آمادهٔ commit می‌سازد |
| CI سخت | job `visual-regression-hard` وقتی همان فایل لینوکس commit شده (file gate — بدون repo var) |

تولید/به‌روزرسانی baseline باید روی همان OS باشد که مقایسه می‌کند (Linux CI ≠ Windows local).

## فعال‌سازی hard gate (R6)

1. یکی از این‌ها:
   - Workflow `visual-baseline-capture` را روی GitHub اجرا کنید (ubuntu)، یا
   - Artifact job `visual-regression-soft` را بعد از push دانلود کنید (همان `--update-snapshots`).
2. Artifact را review کنید.
3. حداقل این‌ها را commit کنید:
   - `login-chromium-linux.png`
   - `not-found-chromium-linux.png`
4. از آن PR به بعد، `visual-regression-hard` بدون `continue-on-error` اجرا می‌شود.

دیگر نیازی به `ENABLE_VISUAL_HARD` نیست — وجود فایل لینوکس همان سوئیچ صادق است.

## تولید baseline لینوکس برای CI (سخت)

روی runner لینوکس (یا container هم‌سان با CI):

```bash
VISUAL_REGRESSION=1 pnpm --filter @dang/web exec playwright test e2e/visual-shell.spec.ts --update-snapshots
git add apps/web/e2e/visual-shell.spec.ts-snapshots
```

Workflow کمکی: `.github/workflows/visual-baseline-capture.yml` (`workflow_dispatch`).

## اجرا با Chrome سیستمی (پیشنهادی روی ویندوز)

```powershell
cd apps/web
$env:PLAYWRIGHT_CHANNEL = "chrome"
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"
$env:VISUAL_REGRESSION = "1"
pnpm exec playwright test e2e/visual-shell.spec.ts --update-snapshots
```

## سیاست

- بدون داده جعلی؛ صفحات واقعی login/404 و در صورت seed، payments/approvals/admin.
- Hard gate فقط پس از commit baseline لینوکس — تا آن موقع soft فقط artifact می‌سازد.
