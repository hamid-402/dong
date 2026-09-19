# نقشهٔ Catch-up → Beyond (نسبت به consolidated roadmap)



هدف: هر جا نسبت به `dang-hamkari-final-consolidated-roadmap.md` عقب/ناقصیم، برسیم و در موارد کدپذیر **فراتر** برویم. بدون UI جعلی و بدون ادعای vendor ابری بدون کلید.



## برش اجرا (این اسپرینت)



| لایه | محتوا | فراتر از سند | وضعیت |

|------|--------|--------------|--------|

| **P1** | split personal-resources · outbox retry+DLQ سیاست · motion tokens · fuzzy palette | تست outbox + grep `--motion-duration-base` / `prefers-reduced-motion` در CI · تست واحد `fuzzyScore` | ✅ DONE |

| **P2** | `MasterKeyProvider` (env + vault-http opt-in) · `vault_access_log` · approval tiers چندتصمیمی | `ENABLE_HTTP_VAULT_MASTER_KEY=1` + timeout ۳ث + fail-closed · `persistence.approvalDecisions` | ✅ DONE |

| **P3** | Policy DSL JSON + evaluator · `GET …/policy-audit` · **runtime wired** into `WorkspaceAccessService.requireAccess` (built-ins when attrs available) | ۵ policy واقعی تست‌شده · UI نازک روی `/permissions` · unit deny وقتی DSL fail | ✅ DONE |

| **P4** | Skeleton قانون + EmptyStateIllustration · INP در lighthouse · a11y routes بیشتر | `ContentSkeleton` به‌جای EmptyHint loading روی personal/org/permissions/spaces | ✅ DONE |

| **T** | security.txt · X-RateLimit-* · retention job گسترش · `pnpm bootstrap` · ADR KMS | X-RateLimit روی expense/social/statements · `providers.retention=purge_v1` · Jobs UI enqueue `retention.purge` · prefs رویداد اعلان (مهاجرت `0072`) | ✅ DONE |



## Beyond (پس از catch-up)



| مورد | وضعیت |

|------|--------|

| Worker write-back به `ops.job_run` (`finished_at` / `last_error` · مهاجرت `0071`) | ✅ DONE |

| `retention.purge` + [`docs/ops/RETENTION.md`](./ops/RETENTION.md) + enqueue در Jobs UI | ✅ DONE |



## عمداً بیرون (نیاز کلید/انسان/ابر)



Vault production واقعی · PITR ابری تمرین‌شده · pentest vendor · وکیل ToS · PostHog میزبانی · FCM · Chromatic SaaS · AWS KMS · canary ترافیک واقعی ابری



## ترتیب واقعیت‌بینانه سند



P1 کامل → T🔴 کدپذیر → P2 → P3 → P4 → بقیهٔ T🟠 → Beyond write-back / retention
