# فاز ۵ — صیقل و رشد بلندمدت (بک‌لاگ زمان‌بندی‌شده)

این آیتم‌ها مانع لانچ احتیاطی نیستند؛ بر اساس اولویت محصول زمان‌بندی می‌شوند.

| آیتم | وضعیت |
|------|--------|
| MFA/TOTP برای Owner/Admin/Finance/Support | **برنامه‌ریزی‌شده** — در `docs/SECURITY.md` به‌عنوان فاز ۵ علامت خورده؛ پیاده‌سازی کامل بعد از baseline امن |
| axe/a11y خودکار در CI | بک‌لاگ |
| تست fail-closed ClamAV/OCR | فقط همزمان با `CLAMAV_ENABLED=1` / `OCR_ENABLED=1` |
| Dead-letter queue برای Redis jobs | مستند در `docs/PHASE2-REDIS.md` (الگو)؛ پیاده‌سازی هنگام اسکیل worker |
| بودجه bundle-size | بک‌لاگ |
| Storybook برای `@dang/ui` | بک‌لاگ (Modal/Skeleton آمادهٔ شروع) |
| i18n آماده‌سازی | بک‌لاگ |
| license review | بک‌لاگ |
| داشبورد متریک کسب‌وکار | بک‌لاگ |

## آماده لانچ با پول واقعی (چک‌لیست)

- [x] CI با Postgres + migrate + dang_runtime + cross-tenant + gitleaks
- [ ] Branch protection required check `check` (دستی در GitHub — `docs/CI-PHASE0.md`)
- [x] Zod روی expenses (+ pipe عمومی)؛ migration تدریجی بقیه endpointها ادامه دارد
- [x] Zero-sum ledger در اپ + DB trigger
- [x] Argon2id + ارتقای scrypt در لاگین
- [x] زرین‌پال: amount سمت سرور
- [x] Rate-limit / idempotency Redis-ready
- [x] Dev-auth در production قفل‌شده با تست
- [x] `docs/SECURITY.md` با واقعیت هم‌خوان (MFA برچسب برنامه‌ریزی)
