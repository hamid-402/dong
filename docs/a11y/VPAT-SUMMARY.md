# VPAT خلاصه / WCAG 2.2 AA (R10-13 برش)

این سند **گواهی رسمی VPAT کامل نیست** — خلاصهٔ نگاشت کنترل‌ها به شواهد خودکار موجود.

| حوزه WCAG | وضعیت | شواهد |
|-----------|--------|--------|
| Perceivable — contrast / text | 🟡 جزئی | Design System + axe smoke |
| Operable — keyboard | ✅ برش | `e2e/a11y-shell.spec.ts` · keyboard-journey |
| Understandable — lang/dir | ✅ | `lang=fa` · `dir=rtl` روی shell |
| Robust — name/role/value | 🟡 | axe wcag2a/aa روی login/register/forgot/invite |
| Focus visible | ✅ برش | a11y login keyboard focus test |
| Error identification (forms) | 🟡 | auth forms؛ همهٔ فرم‌های مالی هنوز باز |
| Full AA audit + signed VPAT | ⬜ | ممیزی دستی خارج از این برش |

## اجرای خودکار

```bash
pnpm --filter @dang/web test:a11y
```

تگ‌های axe: `wcag2a`, `wcag2aa`. نقض critical/serious باید صفر باشد.

## خارج از برش

- ممیزی دستی کامل صفحات مالی/Operations Room
- سند VPAT امضاشده برای فروش سازمانی
- پوشش wcag22aa اختصاصی در همهٔ مسیرها
