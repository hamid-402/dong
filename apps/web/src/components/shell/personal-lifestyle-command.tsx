"use client";

import { useEffect, useId, useState, useTransition, type CSSProperties } from "react";
import {
  currentJalaliYearMonth,
  JALALI_MONTH_FA,
  LIFE_DOMAIN_LABEL_FA,
  type AllocationPlanSummary,
  type LifeDomain,
  type MonthLifestyleSnapshot,
} from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";
import { PersonalSpacesAccordion } from "@/components/shell/personal-spaces-accordion";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import { useAppChrome } from "@/lib/use-app-chrome";
import styles from "./personal-lifestyle-command.module.css";

function tomanToMinor(toman: string): string {
  const n = Number(toman.replaceAll(",", "").trim());
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n) * 10);
}

function monthLabelFa(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return yearMonth;
  return `${JALALI_MONTH_FA[m - 1]} ${y.toLocaleString("fa-IR", { useGrouping: false })}`;
}

function shiftYearMonth(yearMonth: string, delta: number): string {
  const [yRaw, mRaw] = yearMonth.split("-").map(Number);
  if (!yRaw || !mRaw) return yearMonth;
  let jm = mRaw + delta;
  let jy = yRaw;
  while (jm > 12) {
    jm -= 12;
    jy += 1;
  }
  while (jm < 1) {
    jm += 12;
    jy -= 1;
  }
  return `${jy}-${String(jm).padStart(2, "0")}`;
}

function domainClass(domain: LifeDomain): string {
  if (domain === "solo") return styles.domainSolo ?? "";
  if (domain === "group") return styles.domainGroup ?? "";
  if (domain === "building") return styles.domainBuilding ?? "";
  if (domain === "org") return styles.domainOrg ?? "";
  return styles.domainSavings ?? "";
}

const DOMAIN_ORDER: LifeDomain[] = ["solo", "group", "building", "org", "savings"];

type FlowPanel = "paycheck" | "allocation" | "annual";

/**
 * Hero lifestyle ledger on `/me/finance`: one composition — brand, month, closed balance,
 * domain envelopes, then progressive actions (paycheck / allocation / annual).
 */
export function PersonalLifestyleCommand() {
  const chrome = useAppChrome();
  const titleId = useId();
  const [snap, setSnap] = useState<MonthLifestyleSnapshot | null>(null);
  const [plan, setPlan] = useState<AllocationPlanSummary | null>(null);
  const [yearMonth, setYearMonth] = useState(currentJalaliYearMonth);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const [openPanel, setOpenPanel] = useState<FlowPanel | null>("paycheck");

  const [paycheckToman, setPaycheckToman] = useState("");
  const [paycheckDate, setPaycheckDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [percents, setPercents] = useState<Record<LifeDomain, number>>({
    solo: 40,
    group: 15,
    building: 10,
    org: 5,
    savings: 30,
  });
  const [annualYear, setAnnualYear] = useState(() =>
    Number(currentJalaliYearMonth().slice(0, 4)),
  );

  function refresh(ym = yearMonth) {
    startTransition(async () => {
      setError(null);
      try {
        const [lifestyle, allocation] = await Promise.all([
          api.lifestyleSnapshot({ yearMonth: ym }),
          api.getAllocationPlan(),
        ]);
        setSnap(lifestyle);
        setPlan(allocation);
        setPercents({ ...allocation.percents });
        if (lifestyle.emptyReason) setOpenPanel("paycheck");
      } catch (e) {
        setError(friendlyErrorMessage(e, "بارگذاری تراز ماه ناموفق بود"));
      } finally {
        setLoaded(true);
      }
    });
  }

  useEffect(() => {
    if (!chrome.ready) return;
    refresh(yearMonth);
     
  }, [chrome.ready, yearMonth]);

  function submitPaycheck() {
    const amountMinor = tomanToMinor(paycheckToman);
    if (!amountMinor) {
      setError("مبلغ حقوق را به تومان وارد کنید");
      return;
    }
    startTransition(async () => {
      setError(null);
      setInfo(null);
      try {
        const pc = await api.createPaycheck({
          amountMinor,
          occurredOn: paycheckDate,
          note: `حقوق ${monthLabelFa(yearMonth)}`,
          idempotencyKey: newClientId(),
        });
        if (pc.yearMonth !== yearMonth) setYearMonth(pc.yearMonth);
        setPaycheckToman("");
        setInfo("حقوق ثبت شد و به حساب شخصی واریز شد");
        await api.recomputeMonthlyClose(pc.yearMonth).catch(() => undefined);
        refresh(pc.yearMonth);
      } catch (e) {
        setError(friendlyErrorMessage(e, "ثبت حقوق ناموفق بود"));
      }
    });
  }

  function savePlan() {
    const sum =
      percents.solo +
      percents.group +
      percents.building +
      percents.org +
      percents.savings;
    if (sum !== 100) {
      setError(`جمع درصدها باید ۱۰۰ باشد (الان ${sum})`);
      return;
    }
    startTransition(async () => {
      setError(null);
      setInfo(null);
      try {
        const next = await api.putAllocationPlan({ percents });
        setPlan(next);
        setInfo("تخصیص حوزه‌ها ذخیره شد");
        refresh(yearMonth);
      } catch (e) {
        setError(friendlyErrorMessage(e, "ذخیره تخصیص ناموفق بود"));
      }
    });
  }

  function downloadAnnual(format: "csv" | "html_print") {
    startTransition(async () => {
      setError(null);
      setInfo(null);
      try {
        await api.downloadPersonalAnnualStatement({
          jalaliYear: annualYear,
          format,
        });
        setInfo(format === "csv" ? "CSV دانلود شد" : "فایل چاپ دانلود شد");
      } catch (e) {
        setError(friendlyErrorMessage(e, "دانلود گزارش سالانه ناموفق بود"));
      }
    });
  }

  const remainder = snap ? BigInt(snap.remainder.amountMinor) : 0n;
  const income = snap ? BigInt(snap.incomeTotal.amountMinor) : 0n;
  const savings = snap ? BigInt(snap.savingsTotal.amountMinor) : 0n;
  const spend = snap ? BigInt(snap.lifestyleSpendTotal.amountMinor) : 0n;
  const flowBase = income > 0n ? income : savings + spend;
  const savePct =
    flowBase > 0n ? Math.min(100, Number((savings * 100n) / flowBase)) : 0;
  const spendPct = flowBase > 0n ? Math.max(0, 100 - savePct) : 0;

  const balanceTone = !snap
    ? "empty"
    : snap.emptyReason
      ? "empty"
      : snap.balanced
        ? "ok"
        : "warn";

  const percentSum =
    percents.solo +
    percents.group +
    percents.building +
    percents.org +
    percents.savings;

  const isEmpty = Boolean(snap?.emptyReason);
  const showEquation = snap && !isEmpty && income > 0n;

  return (
    <section
      id="lifestyle"
      className={styles.command}
      aria-labelledby={titleId}
      aria-busy={pending && !loaded}
    >
      <div className={styles.grain} aria-hidden />
      <div className={styles.inner}>
        <header className={styles.heroTop}>
          <div className={styles.brandBlock}>
            <h1 className={styles.brand} id={titleId}>
              مالی من
            </h1>
            <p className={styles.lede}>
              یک نگاه به چرخهٔ ماه: حقوق، پس‌انداز، و مصرف در حوزه‌های زندگی.
            </p>
          </div>
          <div className={styles.monthNav} role="group" aria-label="ماه شمسی">
            <button
              type="button"
              className={styles.monthBtn}
              aria-label="ماه قبل"
              disabled={pending}
              onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
            >
              ‹
            </button>
            <span className={styles.monthLabel}>{monthLabelFa(yearMonth)}</span>
            <button
              type="button"
              className={styles.monthBtn}
              aria-label="ماه بعد"
              disabled={pending}
              onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
            >
              ›
            </button>
          </div>
        </header>

        {!loaded && pending ? <div className={styles.loadingPulse} aria-hidden /> : null}

        {snap && loaded ? (
          <div
            className={styles.stage}
            style={
              {
                "--save-pct": `${savePct}%`,
                "--spend-pct": `${spendPct}%`,
              } as CSSProperties
            }
          >
            {showEquation ? (
              <>
                <div className={styles.equation} aria-label="معادله تراز ماه">
                  <div className={styles.eqCell}>
                    <span className={styles.eqLabel}>حقوق</span>
                    <span className={styles.eqValue}>
                      <Amount irrMinor={snap.incomeTotal.amountMinor} />
                    </span>
                  </div>
                  <span className={styles.eqOp} aria-hidden>
                    ≈
                  </span>
                  <div className={styles.eqCell}>
                    <span className={styles.eqLabel}>پس‌انداز</span>
                    <span className={styles.eqValue}>
                      <Amount irrMinor={snap.savingsTotal.amountMinor} />
                    </span>
                  </div>
                  <span className={styles.eqOp} aria-hidden>
                    +
                  </span>
                  <div className={styles.eqCell}>
                    <span className={styles.eqLabel}>مصرف سبک‌زندگی</span>
                    <span className={styles.eqValue}>
                      <Amount irrMinor={snap.lifestyleSpendTotal.amountMinor} />
                    </span>
                  </div>
                </div>
                {flowBase > 0n ? (
                  <div
                    className={styles.flowBar}
                    role="img"
                    aria-label={`پس‌انداز ${savePct} درصد، مصرف ${spendPct} درصد`}
                  >
                    <div className={styles.flowSave} />
                    <div className={styles.flowSpend} />
                  </div>
                ) : null}
                <div className={styles.stageMeta}>
                  <span
                    className={`${styles.status} ${
                      balanceTone === "ok"
                        ? styles.statusOk
                        : balanceTone === "warn"
                          ? styles.statusWarn
                          : styles.statusEmpty
                    }`}
                  >
                    {snap.balanced
                      ? "تراز بسته"
                      : remainder < 0n
                        ? "مصرف بیش از حقوق"
                        : "ماندهٔ تخصیص‌نشده"}
                  </span>
                  <span
                    className={`${styles.remainder} ${
                      remainder < 0n ? styles.remainderNeg : ""
                    }`}
                  >
                    مانده: <Amount irrMinor={snap.remainder.amountMinor} />
                  </span>
                  <span>
                    نقد از جیب: <Amount irrMinor={snap.cashPaidTotal.amountMinor} />
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.emptyInvite}>
                <p className={styles.emptyTitle}>هنوز حقوق این ماه ثبت نشده</p>
                <p className={styles.emptyCopy}>
                  {snap.emptyReason ||
                    "با ثبت اولین حقوق، پاکت‌های تخصیص و تراز ماه ساخته می‌شود."}
                </p>
                <Button
                  type="button"
                  onClick={() => setOpenPanel("paycheck")}
                  disabled={pending}
                >
                  ثبت حقوق ماه
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {error ? <p className={`${styles.flash} ${styles.flashError}`}>{error}</p> : null}
        {info ? <p className={`${styles.flash} ${styles.flashInfo}`}>{info}</p> : null}

        {snap?.byDomain?.length && !isEmpty ? (
          <div>
            <div className={styles.domainsHead}>
              <h2 className={styles.domainsTitle}>پاکت‌های تخصیص</h2>
              <p className={styles.domainsHint}>مصرف واقعی نسبت به سقف درصد</p>
            </div>
            <div className={styles.domains} role="list">
              {snap.byDomain.map((line) => {
                const over = line.usedPercent > 100;
                return (
                  <div
                    key={line.domain}
                    className={`${styles.domain} ${domainClass(line.domain)}`}
                    role="listitem"
                  >
                    <div className={styles.domainTop}>
                      <span className={styles.domainName}>{line.labelFa}</span>
                      <span className={styles.domainPct}>{line.percent}٪</span>
                    </div>
                    <div className={styles.bar} aria-hidden>
                      <div
                        className={`${styles.barFill} ${over ? styles.barFillOver : ""}`}
                        style={{ width: `${Math.min(line.usedPercent, 100)}%` }}
                      />
                    </div>
                    <div className={styles.domainMeta}>
                      <Amount irrMinor={line.actual.amountMinor} /> از{" "}
                      <Amount irrMinor={line.budget.amountMinor} /> ·{" "}
                      {line.usedPercent.toLocaleString("fa-IR")}٪
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <PersonalSpacesAccordion yearMonth={yearMonth} focus="share" hidePersonal />

        <div className={styles.flow}>
          <details
            className={styles.panel}
            open={openPanel === "paycheck"}
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) setOpenPanel("paycheck");
              else if (openPanel === "paycheck") setOpenPanel(null);
            }}
          >
            <summary className={styles.panelSummary}>ثبت حقوق ماه</summary>
            <div className={styles.panelBody}>
              <p className={styles.panelLead}>
                مبلغ به حساب شخصی واریز می‌شود و برای همین ماه شمسی یک‌بار قابل ثبت است.
              </p>
              <div className={styles.formRow}>
                <TextField
                  label="مبلغ (تومان)"
                  value={paycheckToman}
                  onChange={(e) => setPaycheckToman(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
                <JalaliDateField
                  label="تاریخ واریز"
                  value={paycheckDate}
                  onChange={setPaycheckDate}
                />
                <Button type="button" onClick={submitPaycheck} disabled={pending}>
                  ثبت حقوق
                </Button>
              </div>
            </div>
          </details>

          <details
            className={styles.panel}
            open={openPanel === "allocation"}
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) setOpenPanel("allocation");
              else if (openPanel === "allocation") setOpenPanel(null);
            }}
          >
            <summary className={styles.panelSummary}>تخصیص درصد حوزه‌ها</summary>
            <div className={styles.panelBody}>
              <p className={styles.panelLead}>
                سهم هر حوزه از حقوق ماه. جمع باید دقیقاً ۱۰۰ باشد.
              </p>
              <div className={styles.percentGrid}>
                {DOMAIN_ORDER.map((d) => (
                  <TextField
                    key={d}
                    label={LIFE_DOMAIN_LABEL_FA[d]}
                    value={String(percents[d])}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d]/g, ""));
                      setPercents((prev) => ({
                        ...prev,
                        [d]: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0,
                      }));
                    }}
                    inputMode="numeric"
                  />
                ))}
              </div>
              <div className={styles.percentSum}>
                <span
                  className={
                    percentSum === 100 ? styles.percentSumOk : styles.percentSumBad
                  }
                >
                  جمع: {percentSum.toLocaleString("fa-IR")}٪
                </span>
                <Button type="button" onClick={savePlan} disabled={pending || percentSum !== 100}>
                  ذخیره تخصیص
                </Button>
                {plan ? (
                  <span>
                    {plan.updatedAt === new Date(0).toISOString()
                      ? "پیش‌فرض سامانه"
                      : `آخرین ذخیره ${new Date(plan.updatedAt).toLocaleDateString("fa-IR")}`}
                  </span>
                ) : null}
              </div>
            </div>
          </details>

          <details
            className={styles.panel}
            open={openPanel === "annual"}
            onToggle={(e) => {
              const el = e.currentTarget;
              if (el.open) setOpenPanel("annual");
              else if (openPanel === "annual") setOpenPanel(null);
            }}
          >
            <summary className={styles.panelSummary}>گزارش سالانه</summary>
            <div className={styles.panelBody}>
              <p className={styles.panelLead}>
                خلاصهٔ دوازده ماه شمسی — چاپ HTML یا خروجی CSV از داده‌های واقعی.
              </p>
              <div className={styles.formRow}>
                <TextField
                  label="سال شمسی"
                  value={String(annualYear)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ""));
                    if (Number.isFinite(n)) setAnnualYear(n);
                  }}
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => downloadAnnual("html_print")}
                  disabled={pending}
                >
                  نسخهٔ چاپ
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => downloadAnnual("csv")}
                  disabled={pending}
                >
                  CSV
                </Button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
