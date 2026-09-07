## Checklist طراحی / a11y

- [ ] فرم جدید از `TextField`/`SelectField` با `error` و `aria-describedby` (از طریق prop `error`) استفاده می‌کند
- [ ] حالت loading از `EmptyHint loading` یا `Skeleton` است — نه همان EmptyHint متنی
- [ ] Empty state واقعی یک CTA دارد
- [ ] مودال جدید از `Modal` مشترک `@dang/ui` است (focus-trap / Escape)
- [ ] هدف لمسی کنترل‌های جدید ≥ ۴۸px
- [ ] مسیرهای حساس به `PUBLIC_PREFIXES` middleware اضافه نشده‌اند مگر عمدی

## Checklist فنی

- [ ] `@Body()` جدید با Zod schema در contracts
- [ ] تست واحد/قرارداد برای مسیر پول یا auth اگر تغییر کرده
- [ ] بدون دادهٔ جعلی در UI (قانون پروژه)
