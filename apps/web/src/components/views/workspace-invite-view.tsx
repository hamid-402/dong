"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  CreateInviteResponse,
  JoinRequestSummary,
  MembershipSummary,
  OwnershipTransferSummary,
} from "@dang/contracts";
import {
  INVITE_ADMIN_ROLES,
  inviteSatisfiesFinanceQuorum,
  isFinanceManagerRole,
  isMembershipManagerRole,
  isReadOnlyRole,
  spaceKindForTemplate,
  uiInviteRoleOptions,
  uiRoleOptionsIncludingCurrent,
} from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import { LinkQrCode } from "@/components/link-qr-code";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { formatFaDate, formatFaDateTime } from "@/lib/fa-datetime";
import { membershipRoleLabel, spaceKindForTemplateLabel } from "@/lib/status-labels";
import { FlashMessages } from "@/lib/use-flash-message";
import { t } from "@/lib/i18n";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { GuestPlaceholdersPanel } from "@/components/guest-placeholders-panel";
import { AllowancesPanel } from "@/components/allowances-panel";
import { modulesForTemplate } from "@/lib/workspace-modules";
import styles from "./workspace-invite-view.module.css";

const INVITE_ROLES = new Set<string>(INVITE_ADMIN_ROLES);

function isActiveMembership(m: MembershipSummary): boolean {
  return !m.disabledAt;
}

export function WorkspaceInviteView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const workspaces = chrome.workspaces;
  const workspaceId = scope?.workspaceId || chrome.workspaceId;
  const [role, setRole] = useState("member");
  const [invitedSubject, setInvitedSubject] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestSummary[]>([]);
  const [myRole, setMyRole] = useState("");
  const [myUserId, setMyUserId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [lookupPreview, setLookupPreview] = useState<{
    userId: string;
    displayName: string;
    username?: string;
  } | null>(null);
  const [addRole, setAddRole] = useState("member");
  const [editRole, setEditRole] = useState("member");
  const [disableReason, setDisableReason] = useState("");
  const [pendingTransfer, setPendingTransfer] = useState<OwnershipTransferSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successHint, setSuccessHint] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [emailProvider, setEmailProvider] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const presenceIds = new Set(chrome.presenceUserIds);
  const presenceLive = chrome.presenceLive;

  useEffect(() => {
    const identity = getDevIdentity();
    setDevIdentity(identity.subject, identity.displayName);
    void api.capabilities().then((caps) => {
      setEmailProvider(caps.providers?.email ?? null);
    }).catch(() => setEmailProvider(null));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const inviteUser = params.get("inviteUser")?.trim();
    const inviteName = params.get("inviteName")?.trim();
    if (!inviteUser) return;
    setLookupPreview({
      userId: inviteUser,
      displayName: inviteName || inviteUser.slice(0, 8),
    });
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setMembers([]);
      setJoinRequests([]);
      setMyRole("");
      setMyUserId("");
      setPendingTransfer(null);
      return;
    }
    void refreshAll(workspaceId).catch((err: unknown) =>
      setError(friendlyErrorMessage(err, "بارگذاری اعضا ناموفق")),
    );
  }, [workspaceId]);

  async function refreshAll(id: string) {
    const [list, me] = await Promise.all([api.listMembers(id), api.me()]);
    const roleNow = list.find((m) => m.userId === me.actor.userId)?.role ?? "";
    setMembers(list);
    setMyRole(roleNow);
    setMyUserId(me.actor.userId);
    try {
      const transfers = await api.listOwnershipTransfers(id);
      setPendingTransfer(
        transfers.find((t) => t.status === "pending") ?? null,
      );
    } catch {
      setPendingTransfer(null);
    }
    if (isMembershipManagerRole(roleNow)) {
      try {
        setJoinRequests(await api.listJoinRequests(id));
      } catch {
        setJoinRequests([]);
      }
    } else {
      setJoinRequests([]);
    }
  }

  function run(label: string, work: () => Promise<void>) {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          await work();
          setError(null);
          await refreshAll(workspaceId);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, label));
        }
      })();
    });
  }

  function onCreate() {
    if (!workspaceId) return;
    run("ساخت دعوت ناموفق", async () => {
      const invite = await api.createInvite(workspaceId, {
        role: role as CreateInviteResponse["role"],
        invitedSubject: invitedSubject || undefined,
        expiresInHours: (() => {
          const n = Number(expiresInHours);
          return Number.isFinite(n) && n > 0 ? Math.min(24 * 30, Math.floor(n)) : undefined;
        })(),
      });
      setCreated(invite);
    });
  }

  const pageError = error ?? chrome.error;
  const selected = workspaces.find((w) => w.id === workspaceId);
  const slug = selected?.slug ?? scope?.slug ?? null;
  const kind = spaceKindForTemplate(selected?.template);
  const canInvite = INVITE_ROLES.has(myRole);
  const canManage = isMembershipManagerRole(myRole);
  const isOwner = myRole === "owner";
  const readOnlyInvite = isReadOnlyRole(myRole) || (!!myRole && !canInvite);
  const activeMembers = members.filter(isActiveMembership);
  const financeManagerCount = activeMembers.filter((m) =>
    isFinanceManagerRole(m.role),
  ).length;
  const needsSecondFinance = !inviteSatisfiesFinanceQuorum({
    spaceKind: kind,
    currentMemberCount: activeMembers.length,
    currentFinanceManagerCount: financeManagerCount,
    inviteRole: "member",
  }).ok;
  const flags = chrome.capabilities?.productFlags;
  const modules = modulesForTemplate(selected?.template);
  const roleOptionFlags = {
    showApprover: Boolean(flags?.approvalQueue || flags?.expensePolicy),
    showBuyer:
      modules.has("procurement") ||
      modules.has("assets") ||
      modules.has("assets_light"),
    showAuditor: kind !== "personal",
  };
  const assignableRoleOptions = uiInviteRoleOptions(roleOptionFlags);
  const selectedMember =
    members.find((member) => member.userId === selectedMemberId) ??
    members[0] ??
    null;
  const editRoleOptions = uiRoleOptionsIncludingCurrent(
    roleOptionFlags,
    selectedMember?.role,
  );
  const pendingJoins = joinRequests.filter((r) => r.status === "pending");

  useEffect(() => {
    if (!selectedMember || selectedMember.role === "owner") return;
    setEditRole(selectedMember.role);
  }, [selectedMember?.userId, selectedMember?.role]);

  useEffect(() => {
    if (!needsSecondFinance) return;
    setAddRole((prev) => (isFinanceManagerRole(prev) ? prev : "finance"));
    setRole((prev) => (isFinanceManagerRole(prev) ? prev : "finance"));
  }, [needsSecondFinance, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#member-add-panel") return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("member-add-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [canManage, workspaceId]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.members}
        description={
          canInvite
            ? "فهرست اعضا، تغییر نقش، افزودن با نام‌کاربری و ساخت لینک دعوت — مرکز مدیریت گروه."
            : canManage
              ? "مادرخرج: افزودن عضو با نام‌کاربری/شناسه اینجا؛ ساخت لینک دعوت فقط برای مالک و ادمین است."
              : "فهرست اعضا و نقش‌ها در این فضا."
        }
        primaryAction={
          canManage ? (
            <button
              type="button"
              className="textButton"
              onClick={() =>
                document
                  .getElementById("member-add-panel")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              افزودن عضو
            </button>
          ) : slug ? (
            <Link href={wPath(slug, "expenses")}>{NAV_LABELS.expenses}</Link>
          ) : undefined
        }
        state={!chrome.ready ? "loading" : !workspaceId ? "empty" : "ready"}
        loadingLabel="در حال بارگذاری اعضا…"
        empty={<EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>}
      >
      <FlashMessages error={pageError} successMessage={successHint} />
      {slug && needsSecondFinance ? (
        <StatusLine>
          <StatusPill tone="warn">نیاز به مدیر مالی</StatusPill>{" "}
          الان {financeManagerCount.toLocaleString("fa-IR")} مدیر مالی دارید. برای افزودن عضو
          عادی، حداقل یک نفر با نقش «مادرخرج / مدیر مالی»، «ادمین» یا «مالک» لازم است.
        </StatusLine>
      ) : null}
      {slug ? (
        <GroupPublicIdCard slug={slug} name={selected?.name} compact />
      ) : null}
      {slug || selected ? (
        <div className={styles.toolbar}>
          {selected ? (
            <span>
              <strong>{selected.name}</strong>
              {" · "}
              {spaceKindForTemplateLabel(kind)}
              {" · "}
              نقش شما: {membershipRoleLabel(myRole)}
            </span>
          ) : null}
          {slug ? (
            <nav className={styles.toolbarNav} aria-label="مسیرهای مرتبط">
              <Link href={wPath(slug, "expenses")}>{NAV_LABELS.expenses}</Link>
              <Link href={wPath(slug, "settlements")}>{NAV_LABELS.settlements}</Link>
              <Link href={wPath(slug, "space")}>خلاصهٔ گروه</Link>
              {canManage ? <a href="#member-add-panel">افزودن عضو</a> : null}
              {canInvite ? <a href="#invite-create-panel">ساخت دعوت</a> : null}
            </nav>
          ) : null}
        </div>
      ) : null}
      <ProductGrid>
        <SectionCard title="اعضای فعلی" badge={members.length} delayClass="delay1">
          {!chrome.ready ? (
            <EmptyHint loading>در حال بارگذاری فضاها…</EmptyHint>
          ) : workspaces.length === 0 ? (
            <EmptyHint>
              ابتدا یک فضا بسازید — <Link href="/spaces/new">شروع فضای کاری</Link>
            </EmptyHint>
          ) : members.length === 0 ? (
            <EmptyStateBlock
              title="عضوی بارگذاری نشد"
              description={
                pageError
                  ? pageError
                  : "اگر تازه ساخته‌اید، خودتان باید عضو باشید؛ در غیر این صورت دعوت بسازید."
              }
              sticker="invite"
              action={
                canInvite ? (
                  <Button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("invite-create-panel")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    ساخت دعوت
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.masterDetail}>
              <div className={styles.roster}>
                <p className={styles.presenceHint}>
                  {!presenceLive
                    ? t("shell.presenceUnavailable")
                    : t("shell.presenceLiveHint")}
                  {" · "}
                  روی هر ردیف بزنید تا جزئیات و مدیریت نقش باز شود.
                </p>
                <ul className={styles.memberList} role="listbox" aria-label="فهرست اعضا">
                  {members.map((m) => {
                    const online = presenceLive && presenceIds.has(m.userId);
                    const selectedRow =
                      (selectedMember?.userId ?? "") === m.userId;
                    const initial =
                      (m.displayName.trim().charAt(0) || "?").toLocaleUpperCase(
                        "fa",
                      );
                    return (
                      <li key={m.userId} role="option" aria-selected={selectedRow}>
                        <button
                          type="button"
                          className={styles.memberRow}
                          aria-pressed={selectedRow}
                          onClick={() => setSelectedMemberId(m.userId)}
                        >
                          <span className={styles.avatar} aria-hidden>
                            {initial}
                          </span>
                          <span className={styles.memberMain}>
                            <strong>{m.displayName}</strong>
                            <small>
                              {m.disabledAt
                                ? `${membershipRoleLabel(m.role)} · غیرفعال`
                                : membershipRoleLabel(m.role)}
                            </small>
                          </span>
                          <span className={styles.memberMeta}>
                            {presenceLive && !m.disabledAt ? (
                              <span
                                className={`${styles.presenceDot}${
                                  online ? ` ${styles.presenceDotOnline}` : ""
                                }`}
                                title={
                                  online
                                    ? t("shell.presenceOnline")
                                    : t("shell.presenceOffline")
                                }
                                aria-label={
                                  online
                                    ? t("shell.presenceOnline")
                                    : t("shell.presenceOffline")
                                }
                              />
                            ) : null}
                            <StatusPill
                              tone={
                                m.disabledAt
                                  ? "warn"
                                  : isReadOnlyRole(m.role)
                                    ? "warn"
                                    : m.role === "owner" || isFinanceManagerRole(m.role)
                                      ? "ok"
                                      : "neutral"
                              }
                            >
                              {m.disabledAt
                                ? "غیرفعال"
                                : membershipRoleLabel(m.role)}
                            </StatusPill>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {selectedMember ? (
                <aside className={styles.inspector} aria-label="جزئیات عضو انتخاب‌شده">
                  <p className={styles.inspectorEyebrow}>جزئیات عضو</p>
                  <div className={styles.inspectorHead}>
                    <h3>{selectedMember.displayName}</h3>
                  </div>
                  <div className={styles.inspectorPills}>
                    <StatusPill
                      tone={
                        selectedMember.disabledAt
                          ? "warn"
                          : isReadOnlyRole(selectedMember.role)
                            ? "warn"
                            : "ok"
                      }
                    >
                      {selectedMember.disabledAt
                        ? "غیرفعال"
                        : membershipRoleLabel(selectedMember.role)}
                    </StatusPill>
                    {!selectedMember.disabledAt && presenceLive ? (
                      <StatusPill
                        tone={
                          presenceIds.has(selectedMember.userId) ? "ok" : "warn"
                        }
                      >
                        {presenceIds.has(selectedMember.userId)
                          ? t("shell.presenceOnline")
                          : t("shell.presenceOffline")}
                      </StatusPill>
                    ) : null}
                  </div>
                  <dl>
                    <div>
                      <dt>شناسه</dt>
                      <dd>
                        <code title={selectedMember.userId}>
                          {selectedMember.userId.length > 16
                            ? `${selectedMember.userId.slice(0, 8)}…${selectedMember.userId.slice(-4)}`
                            : selectedMember.userId}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>سهم پیش‌فرض</dt>
                      <dd>{selectedMember.defaultShares}</dd>
                    </div>
                    <div>
                      <dt>عضویت از</dt>
                      <dd>{formatFaDate(selectedMember.joinedAt)}</dd>
                    </div>
                    {selectedMember.addedVia ? (
                      <div>
                        <dt>نحوه افزودن</dt>
                        <dd>{selectedMember.addedVia}</dd>
                      </div>
                    ) : null}
                    {selectedMember.disabledReason ? (
                      <div>
                        <dt>دلیل غیرفعال</dt>
                        <dd>{selectedMember.disabledReason}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {canManage && selectedMember.userId !== myUserId ? (
                    <FormStack density="compact" className={styles.inspectorActions}>
                      {selectedMember.role !== "owner" && !selectedMember.disabledAt ? (
                        <>
                          <SelectField
                            label="تغییر نقش"
                            value={editRole}
                            onChange={(event) => setEditRole(event.target.value)}
                          >
                            {editRoleOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.labelFa}
                                {opt.tier === "advanced" ? " · پیشرفته" : ""}
                              </option>
                            ))}
                          </SelectField>
                          <Button
                            type="button"
                            disabled={
                              pending ||
                              editRole === selectedMember.role ||
                              editRole === "owner"
                            }
                            onClick={() =>
                              run("تغییر نقش ناموفق", async () => {
                                await api.updateMember(
                                  workspaceId,
                                  selectedMember.userId,
                                  { role: editRole },
                                );
                              })
                            }
                          >
                            ذخیره نقش
                          </Button>
                          <p className="liveHint">
                            نقش «مادرخرج / مدیر مالی» برای ثبت/تأیید مالی لازم است. اگر فقط یک
                            مدیر مالی دارید، نمی‌توانید نقشش را پایین بیاورید.
                          </p>
                        </>
                      ) : null}
                      {selectedMember.disabledAt ? (
                        <Button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run("فعال‌سازی عضو ناموفق", () =>
                              api
                                .enableMember(workspaceId, selectedMember.userId)
                                .then(() => undefined),
                            )
                          }
                        >
                          فعال‌سازی
                        </Button>
                      ) : selectedMember.role !== "owner" ? (
                        <>
                          <TextField
                            label="دلیل غیرفعال‌سازی"
                            value={disableReason}
                            onChange={(event) =>
                              setDisableReason(event.target.value)
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={pending || disableReason.trim().length === 0}
                            onClick={() =>
                              run("غیرفعال‌سازی عضو ناموفق", async () => {
                                await api.disableMember(
                                  workspaceId,
                                  selectedMember.userId,
                                  { reason: disableReason.trim() },
                                );
                                setDisableReason("");
                              })
                            }
                          >
                            غیرفعال‌سازی
                          </Button>
                        </>
                      ) : null}
                      {isOwner &&
                      isActiveMembership(selectedMember) &&
                      selectedMember.role !== "owner" ? (
                        <Button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run("پیشنهاد انتقال مالکیت ناموفق", async () => {
                              const row = await api.proposeOwnershipTransfer(
                                workspaceId,
                                { toUserId: selectedMember.userId },
                              );
                              setPendingTransfer(row);
                            })
                          }
                        >
                          پیشنهاد انتقال مالکیت
                        </Button>
                      ) : null}
                    </FormStack>
                  ) : null}
                </aside>
              ) : null}
            </div>
          )}
        </SectionCard>

        {canManage ? (
          <div className={styles.opsGrid}>
            <SectionCard
              id="member-add-panel"
              title="افزودن عضو با نام‌کاربری"
              delayClass="delay1"
            >
              <FormStack density="compact">
                <p className="liveHint">
                  جست‌وجوی دقیق در دایرکتوری — فقط کاربران موجود؛ حساب جدید ساخته نمی‌شود.
                  {lookupPreview && !addUsername.trim()
                    ? " · از صفحهٔ دوستان پیش‌پر شده؛ نقش را انتخاب و افزودن را بزنید."
                    : null}
                </p>
                <TextField
                  label="نام‌کاربری"
                  value={addUsername}
                  onChange={(event) => {
                    setAddUsername(event.target.value);
                    setLookupPreview(null);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || addUsername.trim().length < 3}
                  onClick={() =>
                    run("جست‌وجوی نام‌کاربری ناموفق", async () => {
                      const hit = await api.lookupDirectory({
                        username: addUsername.trim(),
                      });
                      setLookupPreview(hit);
                      if (!hit) {
                        throw new Error("کاربری با این نام‌کاربری یافت نشد");
                      }
                    })
                  }
                >
                  جست‌وجو
                </Button>
                {lookupPreview ? (
                  <StatusLine>
                    {lookupPreview.displayName}
                    {lookupPreview.username ? ` · @${lookupPreview.username}` : ""}{" "}
                    · <code>{lookupPreview.userId.slice(0, 8)}</code>
                  </StatusLine>
                ) : null}
                <SelectField
                  label="نقش"
                  value={addRole}
                  onChange={(event) => setAddRole(event.target.value)}
                >
                  {assignableRoleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.labelFa}
                      {needsSecondFinance && !isFinanceManagerRole(opt.value)
                        ? " (فعلاً مجاز نیست)"
                        : ""}
                    </option>
                  ))}
                </SelectField>
                {needsSecondFinance ? (
                  <StatusLine>
                    نقش پیش‌فرض روی مادرخرج گذاشته شد — تا وقتی حداقل یک مدیر مالی فعال نباشد،
                    نقش‌های غیرمالی با خطای ۴۰۹ رد می‌شوند.
                  </StatusLine>
                ) : (
                  <p className="liveHint">
                    طرف مقابل باید قبلاً در دنگ ثبت‌نام کرده باشد؛ با نام‌کاربری جست‌وجو و
                    اضافه کنید.
                  </p>
                )}
                <Button
                  type="button"
                  disabled={
                    pending ||
                    !workspaceId ||
                    !lookupPreview ||
                    (needsSecondFinance && !isFinanceManagerRole(addRole))
                  }
                  onClick={() =>
                    run("افزودن عضو ناموفق", async () => {
                      if (!lookupPreview) return;
                      if (needsSecondFinance && !isFinanceManagerRole(addRole)) {
                        throw new Error(
                          "قبل از افزودن عضو عادی، نقش را مادرخرج یا ادمین بگذارید.",
                        );
                      }
                      await api.addMember(workspaceId, {
                        userId: lookupPreview.userId,
                        role: addRole,
                      });
                      setAddUsername("");
                      setLookupPreview(null);
                    })
                  }
                >
                  {needsSecondFinance ? "افزودن به‌عنوان مادرخرج" : "افزودن عضو"}
                </Button>
              </FormStack>
            </SectionCard>

            <SectionCard
              title="درخواست‌های عضویت"
              badge={pendingJoins.length}
              delayClass="delay2"
            >
              {pendingJoins.length === 0 ? (
                <EmptyHint>درخواست بازی نیست.</EmptyHint>
              ) : (
                <DataList>
                  {pendingJoins.map((req) => (
                    <DataRow
                      key={req.id}
                      title={req.displayName}
                      meta={req.message ?? req.userId.slice(0, 8)}
                      actions={
                        <>
                          <Button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run("تأیید درخواست ناموفق", () =>
                                api
                                  .approveJoinRequest(workspaceId, req.id, {
                                    role: needsSecondFinance ? "finance" : "member",
                                  })
                                  .then(() => undefined),
                              )
                            }
                          >
                            {needsSecondFinance
                              ? "تأیید به‌عنوان مادرخرج"
                              : "تأیید"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              run("رد درخواست ناموفق", () =>
                                api
                                  .rejectJoinRequest(workspaceId, req.id)
                                  .then(() => undefined),
                              )
                            }
                          >
                            رد
                          </Button>
                        </>
                      }
                    />
                  ))}
                </DataList>
              )}
            </SectionCard>
          </div>
        ) : null}

        {pendingTransfer && pendingTransfer.status === "pending" ? (
          <SectionCard
            id="ownership-transfer"
            title="انتقال مالکیت در انتظار"
            delayClass="delay2"
          >
            <StatusLine>
              به{" "}
              {members.find((m) => m.userId === pendingTransfer.toUserId)?.displayName ??
                pendingTransfer.toUserId.slice(0, 8)}{" "}
              · انقضا{" "}
              {formatFaDateTime(pendingTransfer.expiresAt)}
            </StatusLine>
            <FormStack>
              {myUserId === pendingTransfer.fromUserId ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run("لغو انتقال ناموفق", async () => {
                      await api.cancelOwnershipTransfer(workspaceId, pendingTransfer.id);
                      setPendingTransfer(null);
                    })
                  }
                >
                  لغو پیشنهاد
                </Button>
              ) : null}
              {myUserId === pendingTransfer.toUserId ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run("پذیرش انتقال ناموفق", async () => {
                      await api.acceptOwnershipTransfer(workspaceId, pendingTransfer.id);
                      setPendingTransfer(null);
                    })
                  }
                >
                  پذیرش مالکیت
                </Button>
              ) : null}
            </FormStack>
          </SectionCard>
        ) : null}

        <SectionCard id="invite-create-panel" title="ساخت دعوت" delayClass="delay1">
          {readOnlyInvite ? (
            <StatusLine>
              {isReadOnlyRole(myRole)
                ? `نقش ${membershipRoleLabel(myRole)} فقط مشاهده دارد — ساخت دعوت فعال نیست.`
                : canManage
                  ? "مادرخرج می‌تواند عضو موجود را با شناسه اضافه کند؛ ساخت لینک دعوت فقط برای مالک/ادمین است."
                  : "فقط مالک یا ادمین می‌توانند دعوت بسازند."}
            </StatusLine>
          ) : (
            <FormStack>
              <p className="liveHint" style={{ marginBottom: 8 }}>
                فضای فعال: <strong>{selected?.name ?? "—"}</strong>
              </p>
              <SelectField
                label="نقش"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {assignableRoleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelFa}
                    {needsSecondFinance && !isFinanceManagerRole(opt.value)
                      ? " (فعلاً مجاز نیست)"
                      : ""}
                  </option>
                ))}
              </SelectField>
              {needsSecondFinance ? (
                <StatusLine>
                  برای دعوت، نقش را مادرخرج یا ادمین بگذارید تا حداقل یک مدیر مالی فعال داشته باشید.
                </StatusLine>
              ) : (
                <p className="emptyHint" style={{ border: "none", padding: 0, marginTop: -4 }}>
                  یک مادرخرج/مدیر مالی فعال کافی است؛ نفر دوم اختیاری است.
                </p>
              )}
              {role === "finance" ? (
                <p className="emptyHint" style={{ border: "none", padding: 0, marginTop: -4 }}>
                  مادرخرج می‌تواند صورتحساب بسازد، تسویه را تأیید کند و دوره‌های مالی را ببندد —
                  برای نقش‌های حساس فعال‌سازی MFA توصیه می‌شود.
                </p>
              ) : null}
              <TextField
                label="شناسه/ایمیل مدعو (اختیاری)"
                value={invitedSubject}
                onChange={(event) => setInvitedSubject(event.target.value)}
                hint="اگر Resend یا SMTP واقعی فعال باشد، دعوت ایمیل می‌شود"
              />
              <TextField
                label="انقضا (ساعت)"
                value={expiresInHours}
                onChange={(event) => setExpiresInHours(event.target.value)}
                hint="پیش‌فرض ۷۲؛ حداکثر ۳۰ روز — یادآوری نزدیک انقضا از job‏ invite.remind"
                dir="ltr"
              />
              <Button
                onClick={onCreate}
                disabled={
                  pending ||
                  !workspaceId ||
                  (needsSecondFinance && !isFinanceManagerRole(role))
                }
              >
                ساخت دعوت
              </Button>
            </FormStack>
          )}
        </SectionCard>

        {created ? (
          <SectionCard title="نتیجه دعوت" delayClass="delay2">
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              <StatusPill tone="ok">دعوت ساخته شد</StatusPill>
              {created.emailDelivered ? " · ایمیل ارسال شد" : null}
            </p>
            {!created.emailDelivered &&
            (emailProvider === "log" || emailProvider === "none" || !emailProvider) ? (
              <p className="liveHint">
                ارسال ایمیل واقعی فعال نیست ({emailProvider ?? "نامشخص"}) — لینک را دستی بفرستید.
              </p>
            ) : null}
            <FormStack>
              <code
                style={{
                  display: "block",
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--surface-2)",
                  wordBreak: "break-all",
                }}
              >
                {created.debugInviteUrl ?? created.acceptPath}
              </code>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Button
                  type="button"
                  onClick={() => {
                    const link = created.debugInviteUrl ?? created.acceptPath;
                    void navigator.clipboard
                      ?.writeText(
                        link.startsWith("http")
                          ? link
                          : `${window.location.origin}${link.startsWith("/") ? "" : "/"}${link}`,
                      )
                      .then(() => setCopyHint("لینک کپی شد"))
                      .catch(() => setCopyHint("کپی پشتیبانی نشد — دستی انتخاب کنید"));
                  }}
                >
                  کپی لینک
                </Button>
                <Link href={created.acceptPath}>باز کردن لینک پذیرش</Link>
              </div>
              <div style={{ marginTop: 12 }}>
                <StatusLine>QR دعوت — با دوربین گوشی اسکن کنید</StatusLine>
                <LinkQrCode
                  value={
                    (created.debugInviteUrl ?? created.acceptPath).startsWith("http")
                      ? (created.debugInviteUrl ?? created.acceptPath)
                      : `${typeof window !== "undefined" ? window.location.origin : ""}${
                          (created.debugInviteUrl ?? created.acceptPath).startsWith("/")
                            ? ""
                            : "/"
                        }${created.debugInviteUrl ?? created.acceptPath}`
                  }
                  alt="QR دعوت"
                />
              </div>
              {copyHint ? <StatusLine>{copyHint}</StatusLine> : null}
            </FormStack>
          </SectionCard>
        ) : null}

        {workspaceId && kind === "group" ? (
          <GuestPlaceholdersPanel
            workspaceId={workspaceId}
            readOnly={readOnlyInvite}
            onError={(message) => setError(message)}
            onSuccess={(message) => {
              setError(null);
              setSuccessHint(message);
            }}
          />
        ) : null}

        {workspaceId &&
        canManage &&
        chrome.capabilities?.productFlags?.allowance ? (
          <div id="member-allowances">
            <AllowancesPanel
              workspaceId={workspaceId}
              members={members.filter(isActiveMembership)}
              onError={(message) => setError(message)}
              onSuccess={(message) => {
                setError(null);
                setSuccessHint(message);
              }}
            />
          </div>
        ) : null}
      </ProductGrid>
      </WorkspacePageFrame>
    </AppShell>
  );
}
