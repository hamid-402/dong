# ناوبری مقیاس‌پذیر — Workspace Directory (`nav-scale-directory`)

وضعیت: فازهای ۱–۶ پیاده‌سازی‌شده  
قوانین: no-fake-data · additive · persona/role gates حفظ می‌شوند

## هدف مقیاس

~۲۰ گروه + ~۱۰ ساختمان + ~۱۰ سازمان (+ ~۲۰ بخش/واحد در هر org/building) بدون شلوغی، با جستجو/اسکرول/منوی حرفه‌ای.

## معماری قفل‌شده

**سه ورودی برای یافتن، یک زمینه برای کار:**

| ورودی | مسیر کد | نقش |
|--------|---------|-----|
| Directory Switcher | `workspace-switcher.tsx` | پرش بین فضاها |
| Universal Finder | `command-palette.tsx` (Ctrl+K) | فضا · بخش · صفحه · اقدام |
| Kind Directory | `/home?kind=` (`SpacesHubView`) | مرور فهرست متراکم |

داخل فضا: mosaic + (org/building) structural rail بخش/واحد.

## فازها

### فاز ۱ — پایهٔ Directory ✅
- [x] قرارداد `WorkspaceDirectoryEntry` + `GET /workspaces/directory`
- [x] `myRole` روی لیست عضویت (additive روی summary وقتی از list می‌آید)
- [x] pin/recent فضا (localStorage صادق، سقف محدود)
- [x] Directory Switcher: سرچ · پین · اخیر · accordion kind · کیبورد · prefetch
- [x] تست واحد prefs + filter (`workspace-directory-prefs` / `workspace-directory-model`)

### فاز ۲ — Universal Finder ✅
- [x] منابع نتیجه: فضاها · صفحات فضای جاری · recent/pin
- [x] بخش/واحد وقتی scope org/building (بارگذاری live از API)
- [x] سقف نتایج per-group · پیشوندهای اختیاری (`گ:` / `س:` / `فضا:` / `صفحه:`)
- [x] تست `parseDirectoryQuery` + fuzzy جدا در `lib/fuzzy-score`

### فاز ۳ — Kind Directory (`SpacesHubView`) ✅
- [x] چگالی فشرده برای kind فیلترشده / لیست بلند
- [x] virtualize نرم: cap ۱۵ + «نمایش بیشتر»
- [x] پین/اخیر در نوار بالای لیست
- [x] empty صادق + CTA مجاز

### فاز ۴ — Structural rail ✅
- [x] rail ثانویه در org/building home (`StructuralSubunitsRail`)
- [x] سرچ + cap + پین/اخیر واحد/بخش (local prefs)
- [x] CTA ثبت خرج نقش‌آگاه (`expenseHrefForUnit`)

### فاز ۵ — متریک اختیاری directory ✅
- [x] `myNetMinor` / `openSettlements` با `?metrics=1` و سقف `DIRECTORY_METRICS_WORKSPACE_CAP`
- [x] concurrency محدود (`mapPool`) — failure → omit فیلد (نه صفر جعلی)
- [x] `metricsIncluded` / `metricsOmittedReason` صادق در پاسخ
- [x] Switcher هنگام باز شدن metrics را درخواست می‌کند؛ بدون حضور فیلد، عدد نشان نمی‌دهد

### فاز ۶ — پین سرور ✅
- [x] `pinnedWorkspaceIds` روی `GET/PUT /me/ui-prefs` (+ migration `0090`)
- [x] `mergePinnedWorkspaceIds` — اتحاد local∪server بدون از دست دادن پین
- [x] client sync در Switcher و Kind Hub + PUT پس از toggle

## DoD مقیاس

- ۴۰ فضا در Switcher: سرچ فوری · اسکرول نرم · accordion/cap بدون رندر همه
- Finder بدون فریز با ترکیب فضا+صفحه+پیشوند
- مهمان/ناظر بدون CTAی ۴۰۳ روی ثبت خرج واحد
- a11y combobox/listbox · E2E دود `directory-switcher.spec.ts`
- پین‌ها بین دستگاه‌ها با `/me/ui-prefs` همگام می‌شوند (offline → local)

## غیرهدف این ارتقا

- درخت سازمانی جهانی همیشه باز
- hydrate کامل balances همهٔ فضاها در login
- حذف mosaic یا تب‌های Kind
