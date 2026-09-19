"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  ContactSyncRunSummary,
  DirectoryUserSummary,
  FriendshipSummary,
  MembershipRole,
  MembershipSummary,
  SocialCountsSummary,
} from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  EmptyStateBlock,
  FormStack,
  ProductGrid,
  SectionCard,
} from "@/components/ui-blocks";
import { EmptyStateIllustration } from "@/components/ui/empty-state-illustration";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/api-errors";
import { formatFaDate } from "@/lib/fa-datetime";
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
  const [, setSocialCounts] = useState<SocialCountsSummary | null>(null);

  const activeWs =
    chrome.workspaces.find((w) => w.id === chrome.workspaceId) ?? chrome.workspaces[0];
  const activeSlug = activeWs?.slug;
  const activeWorkspaceId = activeWs?.id ?? chrome.workspaceId;
  const membersHref = activeSlug ? wPath(activeSlug, "members") : "/onboarding";
  const canAddMember =
    myRole === "owner" || myRole === "admin" || myRole === "finance";

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
              setMyRole(
                (members.find((m: MembershipSummary) => m.userId === chrome.actor?.userId)
                  ?.role as MembershipRole) ?? "",
              );
            } catch {
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

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || "دوستان"}
      userName={chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
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
            <ul className="profileAtelier__facts" style={{ marginTop: 12 }}>
              {matchResults.map((u) => (
                <li key={u.userId}>
                  <small>
                    {u.displayName}
                    {u.username ? ` · @${u.username}` : ""}
                  </small>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onRequest(u.userId)}
                    disabled={pending}
                  >
                    درخواست دوستی
                  </Button>
                </li>
              ))}
            </ul>
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
            <ul className="profileAtelier__facts">
              {incoming.map((row) => (
                <li key={row.id}>
                  <small>{row.otherUser.displayName}</small>
                  <span style={{ display: "flex", gap: 8 }}>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        startTransition(() => {
                          void api
                            .acceptFriendRequest(row.id)
                            .then(() => {
                              setInfo("دوستی پذیرفته شد");
                              refresh();
                            })
                            .catch((err: unknown) =>
                              setError(authErrorMessage(err, "پذیرش ناموفق بود")),
                            );
                        });
                      }}
                    >
                      پذیرش
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        startTransition(() => {
                          void api
                            .declineFriendRequest(row.id)
                            .then(refresh)
                            .catch((err: unknown) =>
                              setError(authErrorMessage(err, "رد درخواست ناموفق بود")),
                            );
                        });
                      }}
                    >
                      رد
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
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
            <ul className="profileAtelier__facts">
              {outgoing.map((row) => (
                <li key={row.id}>
                  <small>
                    {row.otherUser.displayName}
                    {row.otherUser.username ? ` · @${row.otherUser.username}` : ""}
                  </small>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      startTransition(() => {
                        void api
                          .cancelFriendRequest(row.id)
                          .then(() => {
                            setInfo("درخواست لغو شد");
                            refresh();
                          })
                          .catch((err: unknown) =>
                            setError(authErrorMessage(err, "لغو درخواست ناموفق بود")),
                          );
                      });
                    }}
                  >
                    لغو
                  </Button>
                </li>
              ))}
            </ul>
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
            <ul className="profileAtelier__facts">
              {friends.map((row) => (
                <li key={row.id}>
                  <small>
                    {row.otherUser.displayName}
                    {row.otherUser.username ? ` · @${row.otherUser.username}` : ""}
                  </small>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canAddMember && activeWorkspaceId ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          startTransition(() => {
                            void api
                              .addMember(
                                activeWorkspaceId,
                                { userId: row.otherUser.userId, role: "member" },
                                `friend-add:${activeWorkspaceId}:${row.otherUser.userId}`,
                              )
                              .then(() => {
                                setInfo(
                                  `${row.otherUser.displayName} به‌عنوان عضو به فضای فعال اضافه شد`,
                                );
                              })
                              .catch((err: unknown) =>
                                setError(authErrorMessage(err, "افزودن به فضا ناموفق بود")),
                              );
                          });
                        }}
                      >
                        افزودن به فضا
                      </Button>
                    ) : activeSlug ? (
                      <Link
                        className="textButton"
                        href={`${membersHref}?inviteUser=${encodeURIComponent(row.otherUser.userId)}&inviteName=${encodeURIComponent(row.otherUser.displayName)}`}
                      >
                        دعوت به فضا
                      </Link>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        startTransition(() => {
                          void api
                            .removeFriend(row.otherUser.userId)
                            .then(refresh)
                            .catch((err: unknown) =>
                              setError(authErrorMessage(err, "حذف دوستی ناموفق بود")),
                            );
                        });
                      }}
                    >
                      حذف
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        startTransition(() => {
                          void api
                            .blockUser(row.otherUser.userId)
                            .then(() => {
                              setInfo("کاربر مسدود شد — فهرست در حریم خصوصی");
                              refresh();
                            })
                            .catch((err: unknown) =>
                              setError(authErrorMessage(err, "مسدودسازی ناموفق بود")),
                            );
                        });
                      }}
                    >
                      مسدود
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </ProductGrid>
    </AppShell>
  );
}
