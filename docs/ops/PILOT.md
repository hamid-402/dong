# پایلوت میدانی (W7) — چک‌لیست محلی

بدون vendor ابری. هدف: یک گروه واقعی کوچک تا اولین تسویه، با دادهٔ واقعی و بدون UI جعلی.

## پیش‌نیاز runtime

1. Postgres + `pnpm db:migrate` (حداقل تا `0086` برای webhook delivery)
2. API `:3006` · Web `:3005` · Redis اگر jobs/outbox صف می‌خواهید
3. `allowDevAuth` فقط برای آزمایش محلی؛ پایلوت واقعی = ورود password/OIDC
4. Capabilities را از `/system/capabilities` چک کنید — persistence، email، jobs، `conversionLive`، stubs
5. نوار صداقت UI: `ProviderStubBadges` روی خانه و مالی (OCR/AV/email/PSP/FX) — بدون badge جعلی

## چک‌لیست pilot سازمانی (R9)

| مورد | معیار سبز |
|------|-----------|
| Persistence chrome | برچسب از capabilities (پایدار / مختلط N/M / حافظه) — نه سه فیلد جدا |
| Stub/keys | SMTP/PSP/OCR/AV/FX در UI فقط از capabilities |
| Digest | ترجیح ذخیره می‌شود؛ بدون ادعای «آخرین ارسال» وقتی API ندارد |
| Depth | لینک اهداف/نمودار فقط با `goals_v1` / `charts_v1` |
| i18n | `partners.*` و `procurement.*` در fa+en |
| Deputy cap | UI سقف تأیید (`approvalCapMinor`) روی دسترسی‌ها |
| a11y finance | CI با `A11Y_REQUIRE_FINANCE=1` + API زنده |
| SoT | STATUS · IA · این سند · tracker هم‌خوان |

## مسیر رشد (حداقل)

| گام | مسیر | معیار موفقیت |
|-----|------|-------------|
| ۱ ساخت فضا | `/onboarding` | `workspace.create` در audit · CTA «دعوت اعضا» |
| ۲ دعوت | `/w/[slug]/members` | لینک کپی؛ اگر `providers.email` = log/none → ارسال دستی |
| ۳ پذیرش | `/invite?token=` | نشست واقعی یا (فقط dev) هویت محلی · redirect به `/w/[slug]` |
| ۴ دوستان (اختیاری) | `/account/friends` | lookup / تطبیق مخاطبین / لغو خروجی |
| ۵ اولین خرج | `/w/[slug]/expenses` | `expense.post` · مانده خانه به‌روز |
| ۶ متریک | `/w/[slug]/metrics` | قیف از audit: create → invite.create → accept → expense → settle |

## دمو

- Seed ساده (`POST /demo/seed`) فقط وقتی capability اجازه دهد
- سناریوی همکاران: UI باید عبارت `SEED_COLLEAGUES_DEMO` / `PURGE_COLLEAGUES_DEMO` را تایپ کند — نه یک‌کلیک پنهان
- همیشه برچسب «دمو» در UI/نتیجه

## عمداً خارج از پایلوت

- SMTP واقعی / زرین‌پال / Vault ابری / Grafana
- تکمیل worker برای `job_run` — DONE (`0071` write-back وقتی `DATABASE_URL`؛ وگرنه silently skip)
- دوستی در متریک workspace (گراف حساب است — `/me/social-counts`)

## اسناد مرتبط

- [`STATUS.md`](../STATUS.md) · [`IA.md`](../IA.md) · [`PRODUCT-METRICS.md`](../PRODUCT-METRICS.md)
- [`CANARY-DEPLOY.md`](./CANARY-DEPLOY.md) · [`PROVIDERS-RUNBOOK.md`](./PROVIDERS-RUNBOOK.md)
