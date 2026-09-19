# حریم خصوصی — خروجی داده و ناشناس‌سازی (R10-14)

| فیلد | مقدار |
|------|--------|
| وضعیت | برش ۱ — حساب خودخدمت |
| قانون | بدون حذف سخت ردیف‌های ledger (FK حفظ می‌شود) |

## API

| روش | مسیر | توضیح |
|-----|------|--------|
| GET | `/api/v1/auth/me/data-export` | JSON: پروفایل + workspaceها + متادیتای نشست |
| POST | `/api/v1/auth/me/delete-account` | body: `{ "confirm": "DELETE", "password?": "…" }` |

حذف = **ناشناس‌سازی**: ایمیل tombstone، نام «حساب حذف‌شده»، پاک‌سازی رمز/TOTP، ابطال نشست‌ها.

## UI

حساب → بخش «حریم خصوصی و داده» (`/account`).

## خارج از برش

- پاک‌سازی کامل ردیف‌های مالی / export کامل ledger همه workspaceها
- Retention job زمان‌مند
- درخواست حذف توسط وکیل/اپراتور (DSAR ticket) — UI حساب صادقانه اعلام می‌کند که فقط خودخدمت است

## عمق D3

- Zod `accountDataExportSchema` + تست `exportMyData` بدون نشت `passwordHash`/TOTP
- کپی UI: «تیکت وکیل/اپراتور هنوز نیست»
