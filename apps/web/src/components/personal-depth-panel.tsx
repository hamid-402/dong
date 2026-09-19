"use client";

import { newClientId } from "@/lib/id";
import { useEffect, useState, useTransition } from "react";
import type {
  IncomeSourceKind,
  IncomeSourceSummary,
  MonthlyCloseSummary,
  SavingsGoalSummary,
  SpendingAlertSummary,
} from "@dang/contracts";
import { currentJalaliYearMonth } from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { JalaliDateField } from "@/components/jalali-date-field";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { formatFaDateTime } from "@/lib/fa-datetime";

function currentYearMonth(): string {
  return currentJalaliYearMonth();
}

function tomanToMinor(toman: string): string {
  const n = Number(toman.replaceAll(",", ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n) * 10);
}

function incomeKindLabel(kind: IncomeSourceKind): string {
  if (kind === "salary") return "حقوق";
  if (kind === "bonus") return "پاداش";
  if (kind === "freelance") return "پروژه‌ای";
  if (kind === "rent") return "اجاره";
  return "سایر";
}

function goalStatusLabel(status: SavingsGoalSummary["status"]): string {
  if (status === "reached") return "رسیده";
  if (status === "archived") return "بایگانی";
  return "فعال";
}

type Tab = "goals" | "month" | "income" | "alerts";

/** S11-10: savings goals + monthly close + income + alerts — API-backed only. */
export function PersonalDepthPanel({
  goalsLive = true,
}: {
  /** When false, goals tab is hidden (capabilities.providers.savingsGoals). */
  goalsLive?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(goalsLive ? "goals" : "month");
  const [goals, setGoals] = useState<SavingsGoalSummary[]>([]);
  const [sources, setSources] = useState<IncomeSourceSummary[]>([]);
  const [alerts, setAlerts] = useState<SpendingAlertSummary[]>([]);
  const [close, setClose] = useState<MonthlyCloseSummary | null>(null);
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [goalName, setGoalName] = useState("");
  const [goalTargetToman, setGoalTargetToman] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [contribGoalId, setContribGoalId] = useState("");
  const [contribToman, setContribToman] = useState("");

  const [incomeName, setIncomeName] = useState("");
  const [incomeKind, setIncomeKind] = useState<IncomeSourceKind>("salary");
  const [incomeExpectedToman, setIncomeExpectedToman] = useState("");

  const [alertLimitToman, setAlertLimitToman] = useState("");
  const [alertThreshold, setAlertThreshold] = useState("80");

  async function refresh() {
    const [g, s, m, a] = await Promise.all([
      goalsLive ? api.listSavingsGoals() : Promise.resolve([] as SavingsGoalSummary[]),
      api.listIncomeSources(),
      api.getMonthlyClose(yearMonth),
      api.listSpendingAlerts(),
    ]);
    setGoals(g);
    setSources(s);
    setClose(m);
    setAlerts(a);
    if (!contribGoalId && g[0]) setContribGoalId(g[0].id);
  }

  useEffect(() => {
    if (!goalsLive && tab === "goals") setTab("month");
  }, [goalsLive, tab]);

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        try {
          await refresh();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری اهداف/تحلیل ماه ناموفق"));
        }
      })();
    });
  }, [yearMonth, goalsLive]);

  function onCreateGoal() {
    const targetMinor = tomanToMinor(goalTargetToman);
    if (!goalName.trim() || !targetMinor) {
      setError("نام و مبلغ هدف لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.createSavingsGoal({
            name: goalName.trim(),
            targetMinor,
            targetDate: goalDate || undefined,
            idempotencyKey: newClientId(),
          });
          setGoalName("");
          setGoalTargetToman("");
          setGoalDate("");
          setInfo("هدف پس‌انداز ثبت شد");
          await refresh();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت هدف ناموفق"));
        }
      })();
    });
  }

  function onAddContribution() {
    const amountMinor = tomanToMinor(contribToman);
    if (!contribGoalId || !amountMinor) {
      setError("هدف و مبلغ واریز لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.addSavingsGoalContribution(contribGoalId, {
            amountMinor,
            occurredAt: new Date().toISOString(),
            idempotencyKey: newClientId(),
          });
          setContribToman("");
          setInfo("واریز ثبت شد؛ پیشرفت از ledger حساب پیوندی + واریزهاست");
          await refresh();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت واریز ناموفق"));
        }
      })();
    });
  }

  function onCreateIncome() {
    if (!incomeName.trim()) {
      setError("نام منبع درآمد لازم است");
      return;
    }
    const expectedMinor = incomeExpectedToman
      ? tomanToMinor(incomeExpectedToman)
      : undefined;
    startTransition(() => {
      void (async () => {
        try {
          await api.createIncomeSource({
            name: incomeName.trim(),
            kind: incomeKind,
            expected: expectedMinor
              ? { amountMinor: expectedMinor, currency: "IRR" }
              : undefined,
            idempotencyKey: newClientId(),
          });
          setIncomeName("");
          setIncomeExpectedToman("");
          setInfo("منبع درآمد ثبت شد");
          await refresh();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت منبع درآمد ناموفق"));
        }
      })();
    });
  }

  function onRecompute() {
    startTransition(() => {
      void (async () => {
        try {
          const row = await api.recomputeMonthlyClose(yearMonth);
          setClose(row);
          setInfo("تحلیل ماه از دادهٔ خام بازسازی شد");
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بازسازی تحلیل ماه ناموفق"));
        }
      })();
    });
  }

  function onSaveAlert() {
    const limitMinor = tomanToMinor(alertLimitToman);
    const thresholdPercent = Number(alertThreshold);
    if (!limitMinor || !Number.isFinite(thresholdPercent)) {
      setError("سقف و آستانه هشدار لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.putSpendingAlerts({
            alerts: [
              ...alerts.map((a) => ({
                id: a.id,
                scope: a.scope,
                refId: a.refId ?? null,
                period: a.period,
                limitMinor: a.limit.amountMinor,
                thresholdPercent: a.thresholdPercent,
                channel: a.channel,
                active: a.active,
              })),
              {
                scope: "total" as const,
                period: "month" as const,
                limitMinor,
                thresholdPercent: Math.min(100, Math.max(1, Math.floor(thresholdPercent))),
                channel: "inapp" as const,
                active: true,
              },
            ],
          });
          setAlertLimitToman("");
          setInfo("هشدار سقف ثبت شد؛ فقط با خرج واقعی بیش از آستانه فعال می‌شود");
          await refresh();
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت هشدار ناموفق"));
        }
      })();
    });
  }

  return (
    <SectionCard title="اهداف و تحلیل ماه" delayClass="delay1">
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {goalsLive ? (
          <Button
            type="button"
            variant={tab === "goals" ? "primary" : "secondary"}
            onClick={() => setTab("goals")}
          >
            اهداف پس‌انداز
          </Button>
        ) : null}
        <Button
          type="button"
          variant={tab === "month" ? "primary" : "secondary"}
          onClick={() => setTab("month")}
        >
          تحلیل ماه
        </Button>
        <Button
          type="button"
          variant={tab === "income" ? "primary" : "secondary"}
          onClick={() => setTab("income")}
        >
          منابع درآمد
        </Button>
        <Button
          type="button"
          variant={tab === "alerts" ? "primary" : "secondary"}
          onClick={() => setTab("alerts")}
        >
          هشدار سقف
        </Button>
      </div>

      {error ? <StatusLine>{error}</StatusLine> : null}
      {info ? <StatusLine>{info}</StatusLine> : null}
      {!goalsLive ? (
        <StatusLine>
          اهداف پس‌انداز وقتی providers.savingsGoals برابر goals_v1 باشد فعال
          می‌شود — الان خاموش است؛ پیشرفت نمایشی نشان داده نمی‌شود.
        </StatusLine>
      ) : null}

      {tab === "goals" ? (
        <FormStack>
          <TextField
            label="نام هدف"
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
          />
          <TextField
            label="مبلغ هدف (تومان)"
            value={goalTargetToman}
            onChange={(e) => setGoalTargetToman(e.target.value)}
          />
          <JalaliDateField label="تاریخ هدف (اختیاری)" value={goalDate} onChange={setGoalDate} />
          <Button type="button" onClick={onCreateGoal} disabled={pending}>
            افزودن هدف
          </Button>

          {goals.length === 0 ? (
            <EmptyHint>هنوز هدف پس‌اندازی ثبت نشده است.</EmptyHint>
          ) : (
            <DataList>
              {goals.map((g) => (
                <DataRow
                  key={g.id}
                  title={g.name}
                  meta={
                    <StatusPill tone={g.status === "reached" ? "ok" : "neutral"}>
                      {goalStatusLabel(g.status)} · {g.progressPercent}٪
                      <span
                        role="progressbar"
                        aria-valuenow={Math.min(100, g.progressPercent)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        style={{
                          display: "block",
                          marginTop: 4,
                          height: 6,
                          borderRadius: 3,
                          background: "color-mix(in srgb, var(--line) 80%, transparent)",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            height: "100%",
                            width: `${Math.min(100, Math.max(0, g.progressPercent))}%`,
                            background: "var(--primary)",
                          }}
                        />
                      </span>
                    </StatusPill>
                  }
                  trailing={
                    <span>
                      <Amount irrMinor={g.contributed.amountMinor} /> /{" "}
                      <Amount irrMinor={g.target.amountMinor} />
                    </span>
                  }
                />
              ))}
            </DataList>
          )}

          {goals.length > 0 ? (
            <>
              <label className="field">
                <span>واریز به هدف</span>
                <select
                  value={contribGoalId}
                  onChange={(e) => setContribGoalId(e.target.value)}
                >
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="مبلغ واریز (تومان)"
                value={contribToman}
                onChange={(e) => setContribToman(e.target.value)}
              />
              <Button type="button" onClick={onAddContribution} disabled={pending}>
                ثبت واریز
              </Button>
            </>
          ) : null}
        </FormStack>
      ) : null}

      {tab === "month" ? (
        <FormStack>
          <TextField
            label="ماه (YYYY-MM)"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          />
          <Button type="button" onClick={onRecompute} disabled={pending}>
            بازسازی از دادهٔ خام
          </Button>
          {!close ? (
            <EmptyHint>تحلیل ماه هنوز محاسبه نشده است.</EmptyHint>
          ) : close.empty ? (
            <EmptyHint>
              {close.emptyReason ?? "برای این ماه تراکنش یا سهم گروهی ثبت نشده است."}
            </EmptyHint>
          ) : (
            <DataList>
              <DataRow
                title="درآمد ثبت‌شده"
                trailing={<Amount irrMinor={close.income.amountMinor} />}
              />
              <DataRow
                title="هزینهٔ شخصی"
                trailing={<Amount irrMinor={close.personal.amountMinor} />}
              />
              <DataRow
                title="سهم گروه"
                trailing={<Amount irrMinor={close.groupShare.amountMinor} />}
              />
              <DataRow
                title="جمع هزینه"
                trailing={<Amount irrMinor={close.expense.amountMinor} />}
              />
              <DataRow
                title="باقی‌مانده / پس‌انداز"
                trailing={<Amount irrMinor={close.saved.amountMinor} />}
              />
            </DataList>
          )}
          {close && !close.empty ? (
            <StatusLine>
              محاسبه‌شده در {formatFaDateTime(close.computedAt)}
            </StatusLine>
          ) : null}
        </FormStack>
      ) : null}

      {tab === "income" ? (
        <FormStack>
          <TextField
            label="نام منبع"
            value={incomeName}
            onChange={(e) => setIncomeName(e.target.value)}
          />
          <label className="field">
            <span>نوع</span>
            <select
              value={incomeKind}
              onChange={(e) => setIncomeKind(e.target.value as IncomeSourceKind)}
            >
              <option value="salary">حقوق</option>
              <option value="bonus">پاداش</option>
              <option value="freelance">پروژه‌ای</option>
              <option value="rent">اجاره</option>
              <option value="other">سایر</option>
            </select>
          </label>
          <TextField
            label="مبلغ مورد انتظار (تومان، اختیاری)"
            value={incomeExpectedToman}
            onChange={(e) => setIncomeExpectedToman(e.target.value)}
          />
          <Button type="button" onClick={onCreateIncome} disabled={pending}>
            افزودن منبع درآمد
          </Button>
          {sources.length === 0 ? (
            <EmptyHint>منبع درآمدی ثبت نشده است.</EmptyHint>
          ) : (
            <DataList>
              {sources.map((s) => (
                <DataRow
                  key={s.id}
                  title={s.name}
                  meta={
                    <StatusPill tone={s.active ? "ok" : "warn"}>
                      {incomeKindLabel(s.kind)}
                      {!s.active ? " · غیرفعال" : ""}
                    </StatusPill>
                  }
                  trailing={
                    s.expected ? (
                      <Amount irrMinor={s.expected.amountMinor} />
                    ) : (
                      <span>—</span>
                    )
                  }
                />
              ))}
            </DataList>
          )}
        </FormStack>
      ) : null}

      {tab === "alerts" ? (
        <FormStack>
          <StatusLine>
            هشدار فقط وقتی می‌زند که جمع خرج واقعی دوره از آستانهٔ سقف بگذرد — نه به‌صورت نمایشی.
          </StatusLine>
          <TextField
            label="سقف ماهانه (تومان)"
            value={alertLimitToman}
            onChange={(e) => setAlertLimitToman(e.target.value)}
          />
          <TextField
            label="آستانه هشدار (٪)"
            value={alertThreshold}
            onChange={(e) => setAlertThreshold(e.target.value)}
          />
          <Button type="button" onClick={onSaveAlert} disabled={pending}>
            افزودن هشدار کل
          </Button>
          {alerts.length === 0 ? (
            <EmptyHint>هشدار سقفی تنظیم نشده است.</EmptyHint>
          ) : (
            <DataList>
              {alerts.map((a) => (
                <DataRow
                  key={a.id}
                  title={a.scope === "total" ? "کل خرج شخصی" : a.scope}
                  meta={
                    <StatusPill tone={a.active ? "ok" : "warn"}>
                      آستانه {a.thresholdPercent}٪
                      {a.lastFiredAt
                        ? ` · آخرین هشدار ${formatFaDateTime(a.lastFiredAt)}`
                        : " · هنوز فعال نشده"}
                    </StatusPill>
                  }
                  trailing={<Amount irrMinor={a.limit.amountMinor} />}
                />
              ))}
            </DataList>
          )}
        </FormStack>
      ) : null}
    </SectionCard>
  );
}
