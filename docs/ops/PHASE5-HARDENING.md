# فاز ۵ — سخت‌گیری تولید (عمق کد)

**وضعیت کد:** کامل برای مسیرهای بدون کلید/vendor  
**باقی‌مانده عملیاتی (عمداً ادعای سبز جعلی نمی‌شود):**

| مورد | چه لازم است |
|------|-------------|
| HTTP Vault / KMS واقعی | چک‌لیست زیر → `masterKeySource=http_vault` |
| Visual hard | commit `login-chromium-linux.png` → job hard با hashFiles (R6) |
| ZAP High blocking | `ZAP_TARGET_URL` + `zap-fail-on-high.mjs` (R6) |
| Vendor pen-test | [`PENTEST-KICKOFF.md`](../security/PENTEST-KICKOFF.md) |
| Canary promote زنده | `CANARY_API_URL` / `CANARY_WEB_URL` روی اسلات canary |

## دستورهای محلی

```bash
pnpm openapi:break
pnpm sbom:generate
pnpm canary:policy:test
REDIS_URL=redis://127.0.0.1:6379 pnpm ci:redis-worker-smoke
pnpm --filter @dang/contracts exec tsx --test tests/finance-property.test.ts
```

## صداقت capabilities

- `providers.secrets` = `local_vault_v1` یعنی store داخل محصول wired است — **نه** Vault ابری
- `providers.masterKeySource` = `http_vault` فقط وقتی HttpVault واقعاً unseal شده
- `penTest=prep_ready` یعنی آماده‌سازی، نه پاس شدن pen-test

## چک‌لیست staging — HTTP Vault (RES-01)

کد `HttpVaultMasterKeyProvider` واقعی است (KV v2، fail-closed، تست واحد). زنده شدن staging:

1. Vault KV v2 با path پیش‌فرض `secret/data/dang/master-key` و فیلد `key` = ۳۲ بایت base64
2. در env staging:
   ```env
   ENABLE_HTTP_VAULT_MASTER_KEY=1
   VAULT_ADDR=https://<vault-host>
   VAULT_TOKEN=<token>
   # optional: VAULT_MASTER_KEY_PATH=secret/data/dang/master-key
   ```
3. Restart API → `GET /api/v1/system/capabilities` باید `masterKeySource: "http_vault"` بدهد
4. اگر Vault قطع باشد، boot/unseal **fail-closed** است — UI را «امن» نشان ندهید
5. تا مرحلهٔ ۳ سبز نشود، RES-01 در tracker **باز تا تأیید staging** می‌ماند
6. تست واحد (بدون شبکه): `apps/api/src/key-vault/key-vault.res01.test.ts` — بدون پرچم هرگز `http_vault` نیست؛ با پرچم + mock موفق source صادق؛ fail-closed روی `VAULT_HTTP_FETCH_FAILED`

مرجع: [`ADR-kms-master-key.md`](../adr/ADR-kms-master-key.md)

## فاز ۷ — چک‌لیست انتشار (اجرای محلی روی `dev`، ۱۴۰۵/۰۸/۰۲)

بدون SMTP / SMS / درگاه بیرونی و بدون دیتابیس پرود. نتیجهٔ صادق:

| # | مورد | دستور | نتیجه |
|---|------|--------|--------|
| 4 | audit high+ | `pnpm audit --audit-level=high` | **رد** — ۲ critical + ۴ high (Storybook preview/dev-server GHSA-f2ph / GHSA-px85؛ zod GHSA-mrhx؛ undici در testcontainers GHSA-xjj6). پچ Storybook/zod خارج از این batch. |
| 5 | license | `pnpm license:check` | **پاس** |
| 6 | bundle | `pnpm bundle:check` | **پاس** — static ≈ ۴٫۲۶ MiB (warn ۸ / fail ۱۵) |
| 8 | smoke سلامت | `pnpm smoke:health` | **پاس** روی API `:3006` + web `:3005` لوکال |
| 10 | SBOM | `pnpm sbom:generate` | **پاس** — `artifacts/sbom.cdx.json` (gitignore) |
| 11 | OpenAPI break | `pnpm openapi:break` | **پاس** — ۴۱۹ route، additive |
| 12 | canary policy | `pnpm canary:policy:test` | **پاس** (۴ تست واحد؛ URL زندهٔ canary اجرا نشد — نیاز به `CANARY_*` env) |
| 14 | a11y | `pnpm test:a11y` | **رد جزئی** — ۳۹ پاس / ۶ رد (color-contrast جدی روی theme کاغذی؛ timeout کیبورد/spaces روی production build). بدون تغییر UI در این فاز. |
| — | visual Windows | build + production server | **پاس** — ۱۹× `*-chromium-win32.png`؛ `statements-print` با `emulateMedia({media:'print'})` از `statements` متمایز |
| — | visual Linux CI | workflow `visual-baseline-capture` | **نیاز به GitHub** — `workflow_dispatch`؛ بعد از `pnpm --filter @dang/web build` snapshot لینوکس می‌گیرد. روی این ماشین اجرا نشد. |

**یادداشت production web:** با `output: "standalone"`، `next start` هشدار می‌دهد؛ baselines ویندوز با `node apps/web/.next/standalone/apps/web/server.js` (پس از کپی `.next/static`) گرفته شد تا نشانگر dev ظاهر نشود.
