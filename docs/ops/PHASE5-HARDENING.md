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
5. تا مرحلهٔ ۳ سبز نشود، RES-01 در tracker **باز** می‌ماند

مرجع: [`ADR-kms-master-key.md`](../adr/ADR-kms-master-key.md)
