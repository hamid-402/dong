"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  MembershipSummary,
  WorkspaceSubunitKind,
  WorkspaceSubunitSummary,
} from "@dang/contracts";
import { isFinanceManagerRole, spaceKindForTemplate } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { expenseHrefForUnit } from "@/lib/expense-unit-href";
import { NAV_LABELS } from "@/lib/nav-labels";
import { membershipRoleLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { wPath } from "@/lib/workspace-paths";

const KIND_LABEL: Record<WorkspaceSubunitKind, string> = {
  unit: "واحد",
  department: "بخش",
  subsidiary: "شرکت زیرمجموعه",
};

export function SubunitsView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const workspaceId = scope?.workspaceId || chrome.workspaceId;
  const workspace = chrome.workspaces.find((w) => w.id === workspaceId);
  const slug = workspace?.slug ?? scope?.slug ?? null;
  const spaceKind = spaceKindForTemplate(workspace?.template);

  const [rows, setRows] = useState<WorkspaceSubunitSummary[]>([]);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [kind, setKind] = useState<WorkspaceSubunitKind>(
    spaceKind === "org" ? "department" : "unit",
  );
  const [editAreaSqm, setEditAreaSqm] = useState("");
  const [editOccupancy, setEditOccupancy] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [assignIds, setAssignIds] = useState<string[]>([]);

  const myRole = members.find((m) => m.userId === chrome.actor?.userId)?.role;
  const canManage = isFinanceManagerRole(myRole);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const allowedKinds = useMemo((): WorkspaceSubunitKind[] => {
    if (spaceKind === "building") return ["unit"];
    if (spaceKind === "org") return ["department", "subsidiary"];
    return [];
  }, [spaceKind]);

  function refresh() {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const [nextRows, nextMembers] = await Promise.all([
            api.listSubunits(workspaceId),
            api.listMembers(workspaceId),
          ]);
          setRows(nextRows);
          setMembers(nextMembers.filter((m) => !m.disabledAt));
          setError(null);
          if (selectedId && !nextRows.some((r) => r.id === selectedId)) {
            setSelectedId(nextRows[0]?.id ?? "");
          } else if (!selectedId && nextRows[0]) {
            setSelectedId(nextRows[0].id);
            setAssignIds(nextRows[0].memberUserIds);
          }
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری زیرمجموعه‌ها ناموفق"));
        }
      })();
    });
  }

  useEffect(() => {
    refresh();
  }, [workspaceId]);

  useEffect(() => {
    if (!selected) {
      setAssignIds([]);
      setEditAreaSqm("");
      setEditOccupancy("");
      return;
    }
    setAssignIds(selected.memberUserIds);
    setEditAreaSqm(
      selected.areaSqm != null && Number.isFinite(selected.areaSqm)
        ? String(selected.areaSqm)
        : "",
    );
    setEditOccupancy(
      selected.occupancy != null && Number.isInteger(selected.occupancy)
        ? String(selected.occupancy)
        : "",
    );
  }, [selected?.id]);

  if (spaceKind === "personal" || spaceKind === "group" || allowedKinds.length === 0) {
    return (
      <AppShell
        workspaceId={chrome.workspaceId}
        workspaceName={chrome.workspaceName || undefined}
        userName={chrome.userName || undefined}
        persistenceLabel={chrome.persistenceLabel}
      >
        <WorkspacePageFrame
          title={NAV_LABELS.subunits}
          description="این صفحه برای ساختمان (واحدها) و سازمان (بخش‌ها / شرکت‌های زیرمجموعه) است."
          primaryAction={slug ? <Link href={wPath(slug, "members")}>{NAV_LABELS.members}</Link> : undefined}
          state="ready"
        >
          <EmptyHint>
            برای گروه دوستانه از صفحهٔ اعضا استفاده کنید. برای ساختمان یا سازمان، فضا را با قالب
            مناسب بسازید.
          </EmptyHint>
        </WorkspacePageFrame>
      </AppShell>
    );
  }

  const noun = spaceKind === "building" ? "واحد" : "بخش / شرکت زیرمجموعه";
  const expensesHref = slug ? wPath(slug, "expenses") : null;
  const chargeLabel = spaceKind === "building" ? "ثبت شارژ" : "ثبت خرج بخش";

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={spaceKind === "building" ? "واحدهای ساختمان" : "بخش‌ها و زیرمجموعه‌ها"}
        description={
          spaceKind === "building"
            ? "هر واحد ساکنان خودش را دارد — برای شارژ و قبوض آب و برق و گاز."
            : "هر بخش یا شرکت زیرمجموعه افراد خودش را دارد؛ قوانین می‌تواند متفاوت باشد."
        }
        primaryAction={slug ? <Link href={wPath(slug, "members")}>{NAV_LABELS.members}</Link> : undefined}
        secondaryActions={
          expensesHref ? <Link href={expensesHref}>{NAV_LABELS.expenses}</Link> : undefined
        }
        state={!chrome.ready ? "loading" : "ready"}
        loadingLabel="در حال بارگذاری…"
      >
        <FlashMessages error={error} />
        <StatusLine>
          نقش شما: {membershipRoleLabel(myRole)} · {rows.length.toLocaleString("fa-IR")} {noun}
        </StatusLine>

        <SectionCard title={`فهرست ${noun}`} badge={rows.length} delayClass="delay1">
          {rows.length === 0 ? (
            <EmptyHint>هنوز موردی نیست — از فرم پایین یکی بسازید.</EmptyHint>
          ) : (
            <DataList>
              {rows.map((row) => (
                <DataRow
                  key={row.id}
                  title={`${row.code} · ${row.name}`}
                  meta={`${KIND_LABEL[row.kind]} · ${row.memberUserIds.length.toLocaleString("fa-IR")} نفر${
                    row.areaSqm != null ? ` · ${row.areaSqm} م²` : ""
                  }${row.occupancy != null ? ` · ${row.occupancy} نفر` : ""}${
                    row.note ? ` · ${row.note}` : ""
                  }`}
                  actions={
                    <div className="dataRowActions">
                      {expensesHref ? (
                        <Link href={expenseHrefForUnit(expensesHref, row.code, row.name)}>
                          <Button type="button" variant="ghost">
                            {chargeLabel}
                          </Button>
                        </Link>
                      ) : null}
                      <Button
                        type="button"
                        variant={selectedId === row.id ? "primary" : "ghost"}
                        onClick={() => setSelectedId(row.id)}
                      >
                        انتخاب
                      </Button>
                    </div>
                  }
                />
              ))}
            </DataList>
          )}
        </SectionCard>

        {canManage ? (
          <SectionCard title={`افزودن ${noun}`} delayClass="delay1">
            <FormStack>
              {allowedKinds.length > 1 ? (
                <SelectField
                  label="نوع"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as WorkspaceSubunitKind)}
                >
                  {allowedKinds.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <TextField
                label="کد"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                hint={spaceKind === "building" ? "مثلاً 101 یا A-2" : "مثلاً FIN یا HR"}
                dir="ltr"
              />
              <TextField
                label="نام"
                value={name}
                onChange={(e) => setName(e.target.value)}
                hint={spaceKind === "building" ? "مثلاً واحد ۱۰۱" : "مثلاً مالی یا شرکت فرعی"}
              />
              <TextField
                label="یادداشت / قاعده (اختیاری)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                hint="مثلاً شارژ بر اساس متراژ یا بودجه مستقل بخش"
              />
              {spaceKind === "building" ? (
                <>
                  <TextField
                    label="متراژ (م²)"
                    value={areaSqm}
                    onChange={(e) => setAreaSqm(e.target.value)}
                    hint="برای تقسیم فرمولی قبوض مشترک"
                    dir="ltr"
                  />
                  <TextField
                    label="تعداد نفر"
                    value={occupancy}
                    onChange={(e) => setOccupancy(e.target.value)}
                    hint="ساکنان واحد برای فرمول نفر"
                    dir="ltr"
                  />
                </>
              ) : null}
              <Button
                type="button"
                disabled={pending || !code.trim() || !name.trim()}
                onClick={() =>
                  startTransition(() => {
                    void (async () => {
                      try {
                        const area = Number(areaSqm.replaceAll(",", ""));
                        const occ = Number(occupancy.replaceAll(",", ""));
                        await api.createSubunit(workspaceId, {
                          kind: allowedKinds.length === 1 ? allowedKinds[0]! : kind,
                          code: code.trim(),
                          name: name.trim(),
                          note: note.trim() || undefined,
                          areaSqm:
                            spaceKind === "building" &&
                            Number.isFinite(area) &&
                            area > 0
                              ? area
                              : undefined,
                          occupancy:
                            spaceKind === "building" &&
                            Number.isInteger(occ) &&
                            occ >= 1
                              ? occ
                              : undefined,
                        });
                        setCode("");
                        setName("");
                        setNote("");
                        setAreaSqm("");
                        setOccupancy("");
                        refresh();
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "ساخت زیرمجموعه ناموفق"));
                      }
                    })();
                  })
                }
              >
                افزودن
              </Button>
            </FormStack>
          </SectionCard>
        ) : (
          <StatusLine>
            <StatusPill tone="warn">فقط مشاهده</StatusPill> مدیریت {noun} برای مادرخرج/مالک است.
          </StatusLine>
        )}

        {selected && canManage ? (
          <SectionCard title={`اعضای ${selected.code}`} delayClass="delay2">
            <p className="liveHint" style={{ marginBottom: 8 }}>
              {selected.note ? selected.note : "اعضای این زیرمجموعه را از فهرست اعضا تیک بزنید."}
            </p>
            <FormStack>
              {spaceKind === "building" ? (
                <>
                  <TextField
                    label="متراژ (م²)"
                    value={editAreaSqm}
                    onChange={(e) => setEditAreaSqm(e.target.value)}
                    dir="ltr"
                  />
                  <TextField
                    label="تعداد نفر"
                    value={editOccupancy}
                    onChange={(e) => setEditOccupancy(e.target.value)}
                    dir="ltr"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(() => {
                        void (async () => {
                          try {
                            const area = Number(editAreaSqm.replaceAll(",", ""));
                            const occ = Number(editOccupancy.replaceAll(",", ""));
                            await api.updateSubunit(workspaceId, selected.id, {
                              areaSqm:
                                Number.isFinite(area) && area > 0 ? area : null,
                              occupancy:
                                Number.isInteger(occ) && occ >= 1 ? occ : null,
                            });
                            refresh();
                          } catch (err: unknown) {
                            setError(
                              friendlyErrorMessage(err, "ذخیره متراژ/نفر ناموفق"),
                            );
                          }
                        })();
                      })
                    }
                  >
                    ذخیره متراژ / نفر
                  </Button>
                </>
              ) : null}
              {members.map((m) => {
                const checked = assignIds.includes(m.userId);
                return (
                  <label key={m.userId} className="liveHint" style={{ display: "flex", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setAssignIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== m.userId)
                            : [...prev, m.userId],
                        )
                      }
                    />
                    <span>
                      {m.displayName} · {membershipRoleLabel(m.role)}
                    </span>
                  </label>
                );
              })}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => {
                      void (async () => {
                        try {
                          await api.updateSubunit(workspaceId, selected.id, {
                            memberUserIds: assignIds,
                          });
                          refresh();
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "ذخیره اعضا ناموفق"));
                        }
                      })();
                    })
                  }
                >
                  ذخیره اعضا
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => {
                      void (async () => {
                        try {
                          await api.deleteSubunit(workspaceId, selected.id);
                          setSelectedId("");
                          refresh();
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "حذف ناموفق"));
                        }
                      })();
                    })
                  }
                >
                  حذف {noun}
                </Button>
              </div>
            </FormStack>
          </SectionCard>
        ) : null}
      </WorkspacePageFrame>
    </AppShell>
  );
}
