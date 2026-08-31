# فهرست تصمیم‌های معماری

هر تصمیم هنگام شروع پیاده‌سازی خود باید به ADR مستقل با زمینه، گزینه‌ها، پیامدها و
شرایط بازنگری تبدیل شود.

| شناسه | تصمیم | وضعیت |
|---|---|---|
| ADR-001 | Modular Monolith به‌جای Microservice | تصویب‌شده |
| ADR-002 | یک Product Core با چهار Workspace Template | تصویب‌شده |
| ADR-003 | TypeScript End-to-end و Monorepo | تصویب‌شده |
| ADR-004 | Next.js فقط Presentation/BFF محدود | تصویب‌شده |
| ADR-005 | NestJS روی Fastify برای API | تصویب‌شده |
| ADR-006 | Worker مستقل از همان Codebase | تصویب‌شده |
| ADR-007 | PostgreSQL و Schema-per-context | تصویب‌شده |
| ADR-008 | Shared Database + workspace_id + RLS | تصویب‌شده |
| ADR-009 | Drizzle و SQL Migration بازبینی‌شده | تصویب‌شده |
| ADR-010 | Immutable Double-entry Ledger | تصویب‌شده |
| ADR-011 | Transactional Outbox و Idempotent Consumer | تصویب‌شده |
| ADR-012 | OIDC و Authorization داخلی Workspace | تصویب‌شده |
| ADR-013 | ریال Canonical و تومان Display | تصویب‌شده |
| ADR-014 | UTC/Gregorian Storage و Jalali Presentation | تصویب‌شده |
| ADR-015 | REST/OpenAPI و Idempotency Key | تصویب‌شده |
| ADR-016 | PWA؛ Offline فقط Draft | تصویب‌شده |
| ADR-017 | S3-compatible Private Object Storage | تصویب‌شده |
| ADR-018 | No-custody Payment در MVP | تصویب‌شده |
| ADR-019 | Tailwind + Radix + Storybook برای UI | تصویب‌شده |
| ADR-020 | Dark Luxury Controlled به‌عنوان جهت بصری اصلی | تصویب‌شده |
| ADR-021 | OCR Provider پس از Benchmark فارسی | در انتظار داده |
| ADR-022 | Payment Provider پس از Legal/SLA Review | در انتظار داده |
| ADR-023 | Hosting/Data Residency | در انتظار ارزیابی |

## شرایط تغییر تصمیم

- شواهد Performance یا Scale واقعی
- محدودیت حقوقی یا Provider
- هزینه عملیاتی خارج از Budget
- شکست Usability در آزمون
- افزایش Risk یا کاهش Maintainability

تغییر سلیقه‌ای بدون داده برای تصمیم‌های بنیادین کافی نیست.
