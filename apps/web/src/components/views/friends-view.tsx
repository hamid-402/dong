"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ContactSyncRunSummary,
  DirectoryUserSummary,
  FriendshipSummary,
  MembershipRole,
  MembershipSummary,
  SocialCountsSummary,
} from "@dang/contracts";
import {
  inviteSatisfiesFinanceQuorum,
  isFinanceManagerRole,
  spaceKindForTemplate,
} from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  EmptyStateBlock,
  FormStack,
  ProductGrid,
  SectionCard,
} from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { EmptyStateIllustration } from "@/components/ui/empty-state-illustration";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/api-errors";
import { formatFaDate } from "@/lib/fa-datetime";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { wPath } from "@/lib/workspace-paths";

function parsePhoneLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

const rowTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
} as const;

export function FriendsView() {
  const chrome = useAppChrome();
  const [friends, setFriends] = useState<FriendshipSummary[]>([]);
  const [incoming, setIncoming] = useState<FriendshipSummary[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipSummary[]>([]);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<DirectoryUserSummary | null | undefined>(
    undefined,
  );
  const [phonePaste, setPhonePaste] = useState("");
  const [matchResults, setMatchResults] = useState<DirectoryUserSummary[]>([]);
  const [matchRuns, setMatchRuns] = useState<ContactSyncRunSummary[]>([]);
  const [lastMatchMeta, setLastMatchMeta] = useState<{
    submitted: number;
    matched: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [myRole, setMyRole] = useState<MembershipRole | "">("");
  const [workspaceMembers, setWorkspaceMembers] = useState<MembershipSummary[]>([]);
  const [, setSocialCounts] = useState<SocialCountsSummary | null>(null);

  const friendIds = useMemo(() => friends.map((r) => r.id), [friends]);
  const incomingIds = useMemo(() => incoming.map((r) => r.id), [incoming]);
  const outgoingIds = useMemo(() => outgoing.map((r) => r.id), [outgoing]);
  const matchIds = useMemo(() => matchResults.map((u) => u.userId), [matchResults]);
  const friendSel = useRowSelection(friendIds);
  const incomingSel = useRowSelection(incomingIds);
  const outgoingSel = useRowSelection(outgoingIds);
  const matchSel = useRowSelection(matchIds);

  const barFriend =
    friendSel.selectedCount === 1
      ? (friends.find((r) => r.id === friendSel.selectedIds[0]) ?? null)
      : null;
  const barMatch =
    matchSel.selectedCount === 1
      ? (matchResults.find((u) => u.userId === matchSel.selectedIds[0]) ?? null)
      : null;

  const activeWs =
    chrome.workspaces.find((w) => w.id === chrome.workspaceId) ?? chrome.workspaces[0];
  const activeSlug = activeWs?.slug;
  const activeWorkspaceId = activeWs?.id ?? chrome.workspaceId;
  const membersHref = activeSlug ? wPath(activeSlug, "members") : "/onboarding";
  const canAddMember =
    myRole === "owner" || myRole === "admin" || myRole === "finance";
  const activeMembers = workspaceMembers.filter((m) => !m.disabledAt);
  const financeManagerCount = activeMembers.filter((m) =>
    isFinanceManagerRole(m.role),
  ).length;
  const needsSecondFinance = !inviteSatisfiesFinanceQuorum({
    spaceKind: spaceKindForTemplate(activeWs?.template),
    currentMemberCount: activeMembers.length,
    currentFinanceManagerCount: financeManagerCount,
    inviteRole: "member",
  }).ok;

  function refresh() {
    startTransition(() => {
      void (async () => {
        try {
          const [f, inc, out, runs, counts] = await Promise.all([
            api.listFriends(),
            api.listFriendRequests("incoming"),
            api.listFriendRequests("outgoing"),
            api.listContactRuns().catch(() => [] as ContactSyncRunSummary[]),
            api.socialCounts().catch(() => null),
          ]);
          setFriends(f);
          setIncoming(inc);
          setOutgoing(out);
          setMatchRuns(runs);
          setSocialCounts(counts);
          setError(null);
          if (activeWorkspaceId && chrome.actor?.userId) {
            try {
              const members = await api.listMembers(activeWorkspaceId);
              setWorkspaceMembers(members);
              setMyRole(
                (members.find((m: MembershipSummary) => m.userId === chrome.actor?.userId)
                  ?.role as MembershipRole) ?? "",
              );
            } catch {
              setWorkspaceMembers([]);
              setMyRole("");
            }
          }
        } catch (err: unknown) {
          setError(authErrorMessage(err, "بارگذاری دوستان ناموفق بود"));
        }
      })();
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  function onLookup() {
    const q = lookupQuery.trim();
    if (!q) return;
    startTransition(() => {
      void (async () => {
        try {
          const body = q.includes("@")
            ? null
            : q.match(/^\+?\d/) || q.startsWith("09")
              ? { phone: q }
              : { username: q };
          if (!body) {
            setError("جست‌وجو فقط با نام کاربری دقیق یا شماره موبایل");
            return;
          }
          const found = await api.lookupDirectory(body);
          setLookupResult(found);
          setError(null);
          setInfo(found ? null : "کاربری با این مشخصات یافت نشد");
        } catch (err: unknown) {
          setLookupResult(null);
          setError(authErrorMessage(err, "جست‌وجو ناموفق بود"));
        }
      })();
    });
  }

  function onRequest(userId: string) {
    startTransition(() => {
      void (async () => {
        try {
          await api.sendFriendRequest({ targetUserId: userId });
          setInfo("درخواست دوستی ارسال شد");
          setLookupResult(undefined);
          setMatchResults((prev) => prev.filter((u) => u.userId !== userId));
          refresh();
        } catch (err: unknown) {
          setError(authErrorMessage(err, "ارسال درخواست ناموفق بود"));
        }
      })();
    });
  }

  function onMatchContacts() {
    const phones = parsePhoneLines(phonePaste);
    if (phones.length === 0) {
      setError("حداقل یک شماره موبایل وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const res = await api.matchContacts({ phones });
          setMatchResults(res.matched);
          setLastMatchMeta({ submitted: res.submittedCount, matched: res.matchedCount });
          setInfo(
            res.matchedCount > 0
              ? `${res.matchedCount} نفر از ${res.submittedCount} شماره پیدا شد`
              : "هیچ مخاطبی در فهرست قابل‌یافتن نبود",
          );
          setError(null);
          setMatchRuns(await api.listContactRuns().catch(() => []));
        } catch (err: unknown) {
          setError(authErrorMessage(err, "تطبیق مخاطبین ناموفق بود"));
        }
      })();
    });
  }

  function acceptIncomingSelected() {
    if (incomingSel.selectedCount === 0) return;
    const ids = incomingSel.selectedIds;
    startTransition(() => {
      void (async () => {
        try {
          for (const id of ids) await api.acceptFriendRequest(id);
          setInfo(
            ids.length === 1
              ? "دوستی پذیرفته شد"
              : `${ids.length.toLocaleString("fa-IR")} درخواست پذیرفته شد`,
          );
          incomingSel.clear();
          refresh();
        } catch (err: unknown) {
          setError(authErrorMessage(err, "پذیرش ناموفق بود"));
        }
      })();
    });
  }

  function declineIncomingSelected() {
    if (incomingSel.selectedCount === 0) return;
    const ids = incomingSel.selectedIds;
    const label =
      ids.length === 1
        ? "این درخواست رد شود؟"
        : `${ids.length.toLocaleString("fa-IR")} درخواست رد شوند؟`;
    if (!window.confirm(label)) return;
    startTransition(() => {
      void (async () => {
        try {
          for (const id of ids) await api.declineFriendRequest(id);
          incomingSel.clear();
          refresh();
        } catch (err: unknown) {
          setError(authErrorMessage(err, "رد درخواست ناموفق بود"));
        }
      })();
    });
  }

  function cancelOutgoingSelected() {
    if (outgoingSel.selectedCount === 0) return;
    const ids = outgoingSel.selectedIds;
    const label =
      ids.length === 1
        ? "این درخواست لغو شود؟"
        : `${ids.length.toLocaleString("fa-IR")} درخواست لغو شوند؟`;
    if (!window.confirm(label)) return;
    startTransition(() => {
      void (async () => {
        try {
          for (const id of ids) await api.cancelFriendRequest(id);
          setInfo(
            ids.length === 1
              ? "درخواست لغو شد"
              : `${ids.length.toLocaleString("fa-IR")} درخواست لغو شد`,
          );
          outgoingSel.clear();
          refresh();
        } catch (err: unknown) {
          setError(authErrorMessage(err, "لغو درخواست ناموفق بود"));
        }
      })();
    });
  }

  function removeFriendsSelected() {
    if (friendSel.selectedCount === 0) return;
    const rows = friends.filter((r) => friendSel.selectedIds.includes(r.id));
    const label =
      rows.length === 1
        ? "این دوستی حذف شود؟"
        : `${rows.length.toLocaleString("fa-IR")} دوستی حذف شوند؟`;
    if (!window.confirm(label)) return;
    startTransition(() => {
      void (async () => {
        try {
          for (const row of rows) await api.removeFriend(row.otherUser.userId);
          friendSel.clear();
          refresh();
        } catch (err: unknown) {
          setError(authErrorMessage(err, "حذف دوستی ناموفق بود"));
        }
      })();
    });
  }

  function blockFriendSelected() {
    if (!barFriend) return;
    if (!window.confirm("این کاربر مسدود شود؟")) return;
    startTransition(() => {
      void api
        .blockUser(barFriend.otherUser.userId)
        .then(() => {
          setInfo("کاربر مسدود شد — فهرست در حریم خصوصی");
          friendSel.clear();
          refresh();
        })
        .catch((err: unknown) => setError(authErrorMessage(err, "مسدودسازی ناموفق بود")));
    });
  }

  function addFriendToSpace() {
    if (!barFriend || !canAddMember || !activeWorkspaceId) return;
    startTransition(() => {
      const role = needsSecondFinance ? "finance" : "member";
      void api
        .addMember(
          activeWorkspaceId,
          { userId: barFriend.otherUser.userId, role },
          `friend-add:${activeWorkspaceId}:${barFriend.otherUser.userId}`,
        )
        .then(() => {
          setInfo(
            needsSecondFinance
              ? `${barFriend.otherUser.displayName} به‌عنوان مادرخرج به فضای فعال اضافه شد`
              : `${barFriend.otherUser.displayName} به‌عنوان عضو به فضای فعال اضافه شد`,
          );
          friendSel.clear();
          refresh();
        })
        .catch((err: unknown) =>
          setError(authErrorMessage(err, "افزودن به فضا ناموفق بود")),
        );
    });
  }

  function requestMatchSelected() {
    if (!barMatch) return;
    onRequest(barMatch.userId);
    matchSel.clear();
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || NAV_LABELS.friends}
      userName={chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.friends}
        description="یافتن کاربر، درخواست دوستی، و دعوت به فضای فعال — بدون فهرست عمومی."
        secondaryActions={<Link href="/account/privacy">حریم خصوصی</Link>}
      >
        <FlashMessages error={error} successMessage={info ?? null} />

        <ProductGrid>
        <SectionCard title="یافتن کاربر" delayClass="delay1">
          <p className="liveHint">
            فقط نام کاربری دقیق یا شماره موبایل — فهرست‌برداری وجود ندارد. یافتن‌پذیری در{" "}
            <Link href="/account/privacy">حریم خصوصی</Link> تنظیم می‌شود.
          </p>
          <FormStack>
            <TextField
              id="friends-lookup"
              label="نام کاربری یا موبایل"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
            />
            <Button type="button" onClick={onLookup} disabled={pending}>
              جست‌وجو
            </Button>
          </FormStack>
          {lookupResult ? (
            <div className="profileFormBlock" style={{ marginTop: 16 }}>
              <p>
                <b>{lookupResult.displayName}</b>
                {lookupResult.username ? ` · @${lookupResult.username}` : ""}
              </p>
              <Button type="button" onClick={() => onRequest(lookupResult.userId)} disabled={pending}>
                درخواست دوستی
              </Button>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="تطبیق مخاطبین" tone="quiet" delayClass="delay1">
          <p className="liveHint">
            شماره‌ها فقط برای تطبیق هش می‌شوند و خام ذخیره نمی‌شوند. فقط کاربرانی که یافتن با
            موبایل را روشن کرده‌اند دیده می‌شوند.
          </p>
          <FormStack>
            <label className="liveHint" htmlFor="friends-phones">
              شماره‌ها (هر خط یا جدا با ویرگول — حداکثر ۱۰۰)
            </label>
            <textarea
              id="friends-phones"
              className="textField"
              rows={4}
              value={phonePaste}
              onChange={(e) => setPhonePaste(e.target.value)}
              placeholder={"09121234567\n+989121111111"}
              style={{ width: "100%", resize: "vertical" }}
            />
            <Button type="button" onClick={onMatchContacts} disabled={pending}>
              تطبیق
            </Button>
          </FormStack>
          {lastMatchMeta ? (
            <p className="liveHint" style={{ marginTop: 8 }}>
              آخرین اجرا: {lastMatchMeta.matched} از {lastMatchMeta.submitted} · منبع API
            </p>
          ) : null}
          {matchResults.length > 0 ? (
            <>
              <SelectionActionBar
                selectedCount={matchSel.selectedCount}
                idleHint="روی ردیف کلیک کنید یا مربع کنار نفر را تیک بزنید"
                onClear={matchSel.clear}
              >
                <button
                  type="button"
                  disabled={!barMatch || pending}
                  onClick={requestMatchSelected}
                >
                  درخواست دوستی
                </button>
              </SelectionActionBar>
              <ul className="profileAtelier__facts" style={{ marginTop: 12 }}>
                {matchResults.map((u) => (
                  <li
                    key={u.userId}
                    className={selStyles.selectableRow}
                    {...rowSelectActivateProps({
                      onActivate: () => matchSel.toggle(u.userId),
                    })}
                  >
                    <span style={rowTitleStyle}>
                      <RowSelectCheckbox
                        checked={matchSel.isSelected(u.userId)}
                        onChange={() => matchSel.toggle(u.userId)}
                        label={`انتخاب ${u.displayName}`}
                      />
                      <small>
                        {u.displayName}
                        {u.username ? ` · @${u.username}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : lastMatchMeta && lastMatchMeta.matched === 0 ? (
            <EmptyStateBlock
              title="تطبیقی نبود"
              description="مخاطبین یا در دنگ نیستند یا یافتن با موبایل را خاموش کرده‌اند."
              sticker="handshake"
              action={<Link href="/account/privacy">تنظیم یافتن‌پذیری من</Link>}
            />
          ) : null}
          {matchRuns.length > 0 ? (
            <p className="liveHint" style={{ marginTop: 12 }}>
              اجراهای اخیر:{" "}
              {matchRuns.slice(0, 3).map((r) => (
                <span key={r.id}>
                  {formatFaDate(r.ranAt)}{" "}
                  ({r.matchedCount}/{r.submittedCount}){" "}
                </span>
              ))}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="درخواست‌های ورودی" tone="quiet" delayClass="delay2">
          {incoming.length === 0 ? (
            <EmptyStateBlock
              title="درخواست ورودی ندارید"
              sticker="invite"
              description="با نام کاربری دقیق دوست را پیدا کنید یا مخاطبین را تطبیق دهید."
              action={
                <button
                  type="button"
                  className="textButton"
                  onClick={() => document.getElementById("friends-lookup")?.focus()}
                >
                  رفتن به جست‌وجو
                </button>
              }
            />
          ) : (
            <>
              <SelectionActionBar
                selectedCount={incomingSel.selectedCount}
                idleHint="روی ردیف کلیک کنید یا مربع کنار درخواست را تیک بزنید"
                onClear={incomingSel.clear}
              >
                <button
                  type="button"
                  disabled={incomingSel.selectedCount === 0 || pending}
                  onClick={acceptIncomingSelected}
                >
                  پذیرش
                </button>
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={incomingSel.selectedCount === 0 || pending}
                  onClick={declineIncomingSelected}
                >
                  رد
                </button>
              </SelectionActionBar>
              <ul className="profileAtelier__facts">
                {incoming.map((row) => (
                  <li
                    key={row.id}
                    className={selStyles.selectableRow}
                    {...rowSelectActivateProps({
                      onActivate: () => incomingSel.toggle(row.id),
                    })}
                  >
                    <span style={rowTitleStyle}>
                      <RowSelectCheckbox
                        checked={incomingSel.isSelected(row.id)}
                        onChange={() => incomingSel.toggle(row.id)}
                        label={`انتخاب ${row.otherUser.displayName}`}
                      />
                      <small>{row.otherUser.displayName}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard title="درخواست‌های خروجی" tone="quiet" delayClass="delay2">
          {outgoing.length === 0 ? (
            <EmptyStateBlock
              title="درخواست خروجی ندارید"
              description="پس از ارسال درخواست، اینجا قابل لغو است."
              sticker="spark"
            />
          ) : (
            <>
              <SelectionActionBar
                selectedCount={outgoingSel.selectedCount}
                idleHint="روی ردیف کلیک کنید یا مربع کنار درخواست را تیک بزنید"
                onClear={outgoingSel.clear}
              >
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={outgoingSel.selectedCount === 0 || pending}
                  onClick={cancelOutgoingSelected}
                >
                  لغو
                </button>
              </SelectionActionBar>
              <ul className="profileAtelier__facts">
                {outgoing.map((row) => (
                  <li
                    key={row.id}
                    className={selStyles.selectableRow}
                    {...rowSelectActivateProps({
                      onActivate: () => outgoingSel.toggle(row.id),
                    })}
                  >
                    <span style={rowTitleStyle}>
                      <RowSelectCheckbox
                        checked={outgoingSel.isSelected(row.id)}
                        onChange={() => outgoingSel.toggle(row.id)}
                        label={`انتخاب ${row.otherUser.displayName}`}
                      />
                      <small>
                        {row.otherUser.displayName}
                        {row.otherUser.username ? ` · @${row.otherUser.username}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard title="دوستان من" delayClass="delay3">
          {friends.length === 0 ? (
            <EmptyStateBlock
              illustration={<EmptyStateIllustration variant="no-group" />}
              title="هنوز دوستی ندارید"
              description="با نام کاربری دقیق فرد را پیدا کنید یا از تطبیق مخاطبین استفاده کنید."
              action={
                <Link href="/account/privacy">یافتن‌پذیری در حریم خصوصی</Link>
              }
            />
          ) : (
            <>
              <SelectionActionBar
                selectedCount={friendSel.selectedCount}
                idleHint="روی ردیف کلیک کنید یا مربع کنار دوست را تیک بزنید"
                onClear={friendSel.clear}
              >
                {canAddMember && activeWorkspaceId ? (
                  <button
                    type="button"
                    disabled={!barFriend || pending}
                    onClick={addFriendToSpace}
                  >
                    {needsSecondFinance ? "افزودن به‌عنوان مادرخرج" : "افزودن به فضا"}
                  </button>
                ) : activeSlug && barFriend ? (
                  <Link
                    href={`${membersHref}?inviteUser=${encodeURIComponent(barFriend.otherUser.userId)}&inviteName=${encodeURIComponent(barFriend.otherUser.displayName)}`}
                  >
                    دعوت به فضا
                  </Link>
                ) : activeSlug ? (
                  <button type="button" disabled>
                    دعوت به فضا
                  </button>
                ) : null}
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={friendSel.selectedCount === 0 || pending}
                  onClick={removeFriendsSelected}
                >
                  حذف
                </button>
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={!barFriend || pending}
                  onClick={blockFriendSelected}
                >
                  مسدود
                </button>
              </SelectionActionBar>
              <ul className="profileAtelier__facts">
                {friends.map((row) => (
                  <li
                    key={row.id}
                    className={selStyles.selectableRow}
                    {...rowSelectActivateProps({
                      onActivate: () => friendSel.toggle(row.id),
                    })}
                  >
                    <span style={rowTitleStyle}>
                      <RowSelectCheckbox
                        checked={friendSel.isSelected(row.id)}
                        onChange={() => friendSel.toggle(row.id)}
                        label={`انتخاب ${row.otherUser.displayName}`}
                      />
                      <small>
                        {row.otherUser.displayName}
                        {row.otherUser.username ? ` · @${row.otherUser.username}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </ProductGrid>
      </WorkspacePageFrame>
    </AppShell>
  );
}
