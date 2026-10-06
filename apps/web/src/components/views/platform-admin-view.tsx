"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type {
  PlatformBreakGlassRecord,
  PlatformFlagsResponse,
  PlatformOutboxStatsResponse,
  PlatformRole,
  PlatformSloResponse,
  PlatformUserSummary,
  SecurityEvent,
  UserProfile,
} from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import {
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { RouteErrorState } from "@/components/shell/route-error-state";
import { api, ApiError } from "@/lib/api";
import { authErrorMessage } from "@/lib/api-errors";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";
import { t } from "@/lib/i18n";

function isPlatformRole(role: UserProfile["platformRole"] | undefined): boolean {
  return role === "platform_owner" || role === "platform_support";
}

export function PlatformAdminView() {
  const chrome = useAppChrome();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [gate, setGate] = useState<"loading" | "ok" | "404">("loading");
  const [users, setUsers] = useState<PlatformUserSummary[]>([]);
  const [flags, setFlags] = useState<PlatformFlagsResponse | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [eventCategory, setEventCategory] = useState("");
  const [eventSeverity, setEventSeverity] = useState("");
  const [slo, setSlo] = useState<PlatformSloResponse | null>(null);
  const [sloError, setSloError] = useState<string | null>(null);
  const [retentionPreview, setRetentionPreview] = useState<{
    statementBodies: number;
    attachmentBlobs: number;
    ranAt: string;
    dryRun: boolean;
  } | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<PlatformOutboxStatsResponse | null>(null);
  const [glasses, setGlasses] = useState<PlatformBreakGlassRecord[]>([]);
  const [query, setQuery] = useState("");
  const [bgWorkspaceId, setBgWorkspaceId] = useState("");
  const [bgReason, setBgReason] = useState("");
  const [bgMinutes, setBgMinutes] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingRoleByUser, setPendingRoleByUser] = useState<
    Record<string, { pendingId: string; role: PlatformRole }>
  >({});
  const [roleDraftByUser, setRoleDraftByUser] = useState<Record<string, PlatformRole>>(
    {},
  );
  const [confirmPendingByUser, setConfirmPendingByUser] = useState<Record<string, string>>(
    {},
  );
  const [pending, startTransition] = useTransition();
  const eventCategorySeeded = useRef(false);
  const userSelection = useRowSelection(users.map((u) => u.userId));
  const barUser =
    userSelection.selectedCount === 1
      ? (users.find((u) => u.userId === userSelection.selectedIds[0]) ?? null)
      : null;
  const barIsSelf = barUser != null && barUser.userId === profile?.userId;

  const isOwner = profile?.platformRole === "platform_owner";
  const platformLive =
    chrome.capabilities?.providers?.platformAdmin === "platform_v1";
  const sloLive = chrome.capabilities?.providers?.slo === "in_app_v1";
  const retentionLive =
    chrome.capabilities?.providers?.retention === "dry_run_purge_v1" ||
    chrome.capabilities?.providers?.retention === "purge_v1";

  function loadConsole(p: UserProfile) {
    startTransition(() => {
      void (async () => {
        try {
          const reads: Promise<unknown>[] = [
            api.flags(),
            api.securityEvents({
              category: eventCategory || undefined,
              severity: eventSeverity || undefined,
            }),
            api.listBreakGlass(),
          ];
          if (p.platformRole === "platform_owner") {
            reads.unshift(api.listUsers({ q: query.trim() || undefined }));
          }
          if (sloLive) {
            setSloError(null);
          }
          // SLO runs in parallel but fails independently — never invent burn rates.
          const sloPromise = sloLive
            ? api.slo().then(
                (snap) => {
                  setSlo(snap);
                  setSloError(null);
                },
                (err: unknown) => {
                  setSlo(null);
                  setSloError(authErrorMessage(err, "خواندن SLO ناموفق بود"));
                },
              )
            : Promise.resolve().then(() => {
                setSlo(null);
                setSloError(null);
              });
          // Outbox stats parallel — null stats → unavailable copy, never invent zeros.
          const outboxPromise = api.outboxStats().then(
            (snap) => {
              setOutbox(snap);
            },
            () => {
              setOutbox(null);
            },
          );
          const results = await Promise.all([...reads, sloPromise, outboxPromise]);
          let i = 0;
          if (p.platformRole === "platform_owner") {
            setUsers((results[i++] as Awaited<ReturnType<typeof api.listUsers>>).items);
          }
          setFlags(results[i++] as PlatformFlagsResponse);
          setEvents((results[i++] as Awaited<ReturnType<typeof api.securityEvents>>).items);
          setGlasses((results[i++] as Awaited<ReturnType<typeof api.listBreakGlass>>).items);
          setError(null);
        } catch (err: unknown) {
          if (err instanceof ApiError && err.status === 404) {
            setGate("404");
            return;
          }
          setError(authErrorMessage(err, "بارگذاری کنسول سامانه ناموفق بود"));
        }
      })();
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!platformLive) {
          if (!cancelled) setGate("404");
          return;
        }
        const p = await api.profile();
        if (cancelled) return;
        if (!isPlatformRole(p.platformRole)) {
          setGate("404");
          return;
        }
        setProfile(p);
        setGate("ok");
        loadConsole(p);
      } catch {
        if (!cancelled) setGate("404");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platformLive]);

  useEffect(() => {
    if (eventCategorySeeded.current || !chrome.capabilities) return;
    eventCategorySeeded.current = true;
    setEventCategory(
      chrome.capabilities.providers?.antifraud === "heuristics_v1" ? "fraud" : "",
    );
  }, [chrome.capabilities]);

  if (gate === "loading") {
    return <EmptyHint loading>در حال بررسی دسترسی…</EmptyHint>;
  }
  if (gate === "404") {
    return (
      <RouteErrorState
        code="404"
        title={t("error.notFound.title")}
        description={t("error.notFound.description")}
      />
    );
  }

  return (
    <div className="productPage">
      <FlashMessages error={error} successMessage={info} />
      <ProductGrid>
        {sloLive ? (
          <SectionCard title={t("platform.slo.sectionTitle")}>
            {slo == null ? (
              pending && !sloError ? (
                <EmptyHint loading>{t("platform.slo.loading")}</EmptyHint>
              ) : (
                <EmptyHint>
                  {sloError ?? "اسنپ‌شات SLO از API دریافت نشد — عددی نمایش داده نمی‌شود."}
                </EmptyHint>
              )
            ) : (
              <FormStack>
                <p>
                  وضعیت کلی:{" "}
                  <strong>
                    {slo.breached
                      ? t("platform.slo.breached")
                      : t("platform.slo.inBudget")}
                  </strong>
                  {" · تولید: "}
                  {formatFaDateTime(slo.generatedAt)}
                  {" · "}
                  {slo.provider}
                </p>
                <ul className="stackList">
                  {slo.windows.map((win) => (
                    <li key={win.id}>
                      <strong>{t("platform.slo.window", { id: win.id })}</strong>
                      {win.breached
                        ? ` · ${t("platform.slo.breachedShort")}`
                        : ` · ${t("platform.slo.healthyShort")}`}
                      <ul className="stackList">
                        {win.signals.map((sig) => (
                          <li key={`${win.id}-${sig.id}`}>
                            <code>{sig.id}</code>
                            {" · available="}
                            {sig.available ? "true" : "false"}
                            {" · "}
                            {sig.available
                              ? `burnRate=${sig.burnRate == null ? "null" : String(sig.burnRate)}`
                              : t("platform.slo.unavailable", {
                                  reason: sig.unavailableReason ?? "—",
                                })}
                            {" · breached="}
                            {sig.breached ? "true" : "false"}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {slo.notes && slo.notes.length > 0 ? (
                  <ul className="stackList">
                    {slo.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : null}
              </FormStack>
            )}
          </SectionCard>
        ) : null}
        {retentionLive ? (
          <SectionCard title="نگهداری داده (dry-run)">
            <FormStack>
              <StatusLine>
                پیش‌نمایش تعداد ردیف‌هایی که purge پاک می‌کند — بدون تغییر داده.
              </StatusLine>
              {retentionError ? <StatusLine>{retentionError}</StatusLine> : null}
              {retentionPreview ? (
                <StatusLine>
                  statements={retentionPreview.statementBodies}
                  {" · attachments="}
                  {retentionPreview.attachmentBlobs}
                  {" · "}
                  {formatFaDateTime(retentionPreview.ranAt)}
                  {" · dryRun="}
                  {retentionPreview.dryRun ? "true" : "false"}
                </StatusLine>
              ) : (
                <EmptyHint>هنوز پیش‌نمایش گرفته نشده.</EmptyHint>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(() => {
                    void api
                      .retentionDryRun()
                      .then((snap) => {
                        setRetentionPreview(snap);
                        setRetentionError(null);
                        setInfo("پیش‌نمایش retention بارگذاری شد");
                      })
                      .catch((err: unknown) => {
                        setRetentionPreview(null);
                        setRetentionError(authErrorMessage(err, "dry-run ناموفق"));
                      });
                  });
                }}
              >
                اجرای dry-run
              </Button>
            </FormStack>
          </SectionCard>
        ) : null}
        <SectionCard title={t("platform.outbox.title")}>
          {outbox?.stats == null ? (
            <EmptyHint>{t("platform.outbox.unavailable")}</EmptyHint>
          ) : (
            <FormStack>
              <StatusLine>
                persistence: {outbox.persistence}
                {" · pendingCount="}
                {outbox.stats.pendingCount}
                {" · failedPendingCount="}
                {outbox.stats.failedPendingCount}
                {" · oldestPendingAgeMs="}
                {outbox.stats.oldestPendingAgeMs == null
                  ? "null"
                  : String(outbox.stats.oldestPendingAgeMs)}
              </StatusLine>
              {isOwner ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    startTransition(() => {
                      void api
                        .outboxRedrive(25)
                        .then((result) => {
                          setInfo(
                            t("platform.outbox.redriveResult", {
                              attempted: String(result.attempted),
                              processed: String(result.processed),
                              failed: String(result.failed),
                            }),
                          );
                          return api.outboxStats();
                        })
                        .then((snap) => {
                          setOutbox(snap);
                          setError(null);
                        })
                        .catch((err: unknown) => {
                          setError(
                            authErrorMessage(err, t("platform.outbox.redriveError")),
                          );
                        });
                    });
                  }}
                >
                  {t("platform.outbox.redrive")}
                </Button>
              ) : null}
            </FormStack>
          )}
        </SectionCard>
        {isOwner ? (
          <SectionCard
            title="کاربران"
            description="برای عملیات، روی ردیف کلیک کنید یا مربع کنار کاربر را تیک بزنید (نوار انتخاب)."
          >
            <FormStack>
              <TextField
                label="جست‌وجو"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button
                type="button"
                disabled={pending}
                onClick={() => profile && loadConsole(profile)}
              >
                جست‌وجو
              </Button>
            </FormStack>
            {users.length === 0 ? (
              <EmptyHint>کاربری یافت نشد.</EmptyHint>
            ) : (
              <>
                <SelectionActionBar
                  selectedCount={userSelection.selectedCount}
                  idleHint="روی ردیف کلیک کنید یا مربع کنار کاربر را تیک بزنید"
                  onClear={userSelection.clear}
                >
                  {barUser && !barIsSelf ? (
                    <>
                      <SelectField
                        label="نقش سامانه"
                        value={roleDraftByUser[barUser.userId] ?? barUser.platformRole}
                        disabled={pending}
                        onChange={(e) =>
                          setRoleDraftByUser((prev) => ({
                            ...prev,
                            [barUser.userId]: e.target.value as PlatformRole,
                          }))
                        }
                      >
                        <option value="user">user</option>
                        <option value="platform_support">platform_support</option>
                        <option value="platform_owner">platform_owner</option>
                      </SelectField>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          pending ||
                          (roleDraftByUser[barUser.userId] ?? barUser.platformRole) ===
                            barUser.platformRole
                        }
                        onClick={() => {
                          const nextRole =
                            roleDraftByUser[barUser.userId] ?? barUser.platformRole;
                          startTransition(() => {
                            void (async () => {
                              try {
                                const res = await api.setUserRole(barUser.userId, {
                                  platformRole: nextRole,
                                });
                                if (res.status === "pending_second_owner") {
                                  if (res.pendingId) {
                                    setPendingRoleByUser((prev) => ({
                                      ...prev,
                                      [barUser.userId]: {
                                        pendingId: res.pendingId!,
                                        role: nextRole,
                                      },
                                    }));
                                  }
                                  setInfo(
                                    res.pendingId
                                      ? `ارتقا در انتظار تأیید مالک دوم · pendingId: ${res.pendingId}`
                                      : "ارتقا در انتظار تأیید مالک دوم",
                                  );
                                } else {
                                  setPendingRoleByUser((prev) => {
                                    const next = { ...prev };
                                    delete next[barUser.userId];
                                    return next;
                                  });
                                  setInfo(`نقش به ${res.user.platformRole} اعمال شد`);
                                  if (profile) loadConsole(profile);
                                }
                                setError(null);
                              } catch (err: unknown) {
                                setError(authErrorMessage(err, "تغییر نقش ناموفق"));
                              }
                            })();
                          });
                        }}
                      >
                        اعمال نقش
                      </Button>
                      {pendingRoleByUser[barUser.userId] ? (
                        <span className="liveHint">
                          وضعیت API: pending_second_owner · pendingId:{" "}
                          <code>{pendingRoleByUser[barUser.userId]?.pendingId}</code>
                          {" "}(تأیید باید توسط مالک سامانهٔ دیگر انجام شود)
                        </span>
                      ) : null}
                      <TextField
                        label="confirmPendingId (مالک دوم)"
                        value={
                          confirmPendingByUser[barUser.userId] ??
                          pendingRoleByUser[barUser.userId]?.pendingId ??
                          ""
                        }
                        disabled={pending}
                        onChange={(e) =>
                          setConfirmPendingByUser((prev) => ({
                            ...prev,
                            [barUser.userId]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          pending ||
                          !(
                            confirmPendingByUser[barUser.userId] ??
                            pendingRoleByUser[barUser.userId]?.pendingId
                          )?.trim()
                        }
                        onClick={() => {
                          const confirmPendingId = (
                            confirmPendingByUser[barUser.userId] ??
                            pendingRoleByUser[barUser.userId]?.pendingId ??
                            ""
                          ).trim();
                          const nextRole =
                            roleDraftByUser[barUser.userId] ??
                            pendingRoleByUser[barUser.userId]?.role ??
                            "platform_owner";
                          if (!confirmPendingId) return;
                          startTransition(() => {
                            void (async () => {
                              try {
                                const res = await api.setUserRole(barUser.userId, {
                                  platformRole: nextRole,
                                  confirmPendingId,
                                });
                                if (res.status === "applied") {
                                  setPendingRoleByUser((prev) => {
                                    const next = { ...prev };
                                    delete next[barUser.userId];
                                    return next;
                                  });
                                  setConfirmPendingByUser((prev) => {
                                    const next = { ...prev };
                                    delete next[barUser.userId];
                                    return next;
                                  });
                                  setInfo(
                                    `نقش به ${res.user.platformRole} تأیید و اعمال شد`,
                                  );
                                  if (profile) loadConsole(profile);
                                } else {
                                  setInfo(
                                    res.pendingId
                                      ? `هنوز در انتظار تأیید · pendingId: ${res.pendingId}`
                                      : "هنوز در انتظار تأیید مالک دوم",
                                  );
                                }
                                setError(null);
                              } catch (err: unknown) {
                                setError(
                                  authErrorMessage(err, "تأیید ارتقا ناموفق"),
                                );
                              }
                            })();
                          });
                        }}
                      >
                        تأیید با pendingId
                      </Button>
                    </>
                  ) : null}
                  {barUser ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          startTransition(() => {
                            void (async () => {
                              try {
                                const res = await api.passwordReset(barUser.userId);
                                setInfo(
                                  res.debugResetUrl
                                    ? `لینک بازنشانی: ${res.debugResetUrl}`
                                    : "لینک بازنشانی ارسال شد",
                                );
                                setError(null);
                              } catch (err: unknown) {
                                setError(authErrorMessage(err, "بازنشانی ناموفق"));
                              }
                            })();
                          });
                        }}
                      >
                        بازنشانی رمز
                      </Button>
                      {!barUser.disabledAt ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={pending || barIsSelf}
                          onClick={() => {
                            startTransition(() => {
                              void (async () => {
                                try {
                                  await api.disableUser(barUser.userId, {
                                    reason: "disabled from platform console",
                                  });
                                  setInfo("حساب غیرفعال شد");
                                  if (profile) loadConsole(profile);
                                } catch (err: unknown) {
                                  setError(authErrorMessage(err, "غیرفعال‌سازی ناموفق"));
                                }
                              })();
                            });
                          }}
                        >
                          غیرفعال
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </SelectionActionBar>
                <ul className="stackList">
                  {users.map((u) => (
                    <li
                      key={u.userId}
                      className={selStyles.selectableRow}
                      {...rowSelectActivateProps({
                        onActivate: () => {
                          if (userSelection.isSelected(u.userId)) userSelection.clear();
                          else userSelection.selectOnly(u.userId);
                        },
                      })}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <RowSelectCheckbox
                          checked={userSelection.isSelected(u.userId)}
                          onChange={() => {
                            if (userSelection.isSelected(u.userId)) userSelection.clear();
                            else userSelection.selectOnly(u.userId);
                          }}
                          label={`انتخاب ${u.displayName}`}
                        />
                        <strong>{u.displayName}</strong>
                      </span>{" "}
                      · {u.username ?? "—"} · {u.platformRole}
                      {u.disabledAt ? " · غیرفعال" : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>
        ) : null}

        <SectionCard title="پرچم‌های محصول (env)">
          {!flags ? (
            <EmptyHint>در حال بارگذاری…</EmptyHint>
          ) : (
            <ul className="stackList">
              {(Object.keys(flags.productFlags) as Array<keyof typeof flags.productFlags>).map(
                (key) => (
                  <li key={key}>
                    <code>{flags.envKeys[key]}</code> → {flags.productFlags[key] ? "on" : "off"}
                  </li>
                ),
              )}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="رویدادهای امنیتی">
          <FormStack>
            <SelectField
              label="دسته"
              value={eventCategory}
              disabled={pending}
              onChange={(e) => setEventCategory(e.target.value)}
            >
              <option value="">همه</option>
              <option value="auth">auth</option>
              <option value="access">access</option>
              <option value="fraud">fraud</option>
              <option value="privacy">privacy</option>
              <option value="integrity">integrity</option>
              <option value="ops">ops</option>
            </SelectField>
            <SelectField
              label="شدت"
              value={eventSeverity}
              disabled={pending}
              onChange={(e) => setEventSeverity(e.target.value)}
            >
              <option value="">همه</option>
              <option value="info">info</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </SelectField>
            <Button
              type="button"
              disabled={pending}
              onClick={() => profile && loadConsole(profile)}
            >
              فیلتر رویدادها
            </Button>
          </FormStack>
          {events.length === 0 ? (
            <EmptyHint>رویدادی با این فیلتر نیست.</EmptyHint>
          ) : (
            <ul className="stackList">
              {events.slice(0, 40).map((ev) => (
                <li key={ev.id}>
                  <code>{ev.event}</code> · {ev.category} · {ev.severity} · {ev.occurredAt}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Break-glass">
          {isOwner ? (
            <FormStack>
              <TextField
                label="workspaceId"
                value={bgWorkspaceId}
                onChange={(e) => setBgWorkspaceId(e.target.value)}
              />
              <TextField
                label="دلیل"
                value={bgReason}
                onChange={(e) => setBgReason(e.target.value)}
              />
              <TextField
                label="دقایق (۱–۲۴۰)"
                value={bgMinutes}
                onChange={(e) => setBgMinutes(e.target.value)}
              />
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        await api.openBreakGlass({
                          workspaceId: bgWorkspaceId.trim(),
                          reason: bgReason.trim(),
                          expiresInMinutes: Number(bgMinutes),
                        });
                        setInfo("break-glass باز شد");
                        setError(null);
                        if (profile) loadConsole(profile);
                      } catch (err: unknown) {
                        setError(authErrorMessage(err, "باز کردن break-glass ناموفق"));
                      }
                    })();
                  });
                }}
              >
                باز کردن
              </Button>
            </FormStack>
          ) : null}
          {glasses.length === 0 ? (
            <EmptyHint>سابقه‌ای نیست.</EmptyHint>
          ) : (
            <ul className="stackList">
              {glasses.map((g) => (
                <li key={g.id}>
                  {g.workspaceId.slice(0, 8)}… · {g.active ? "فعال" : "بسته"} · {g.reason}
                  {isOwner && g.active ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(() => {
                          void (async () => {
                            try {
                              await api.revokeBreakGlass(g.id);
                              setInfo("revoked");
                              if (profile) loadConsole(profile);
                            } catch (err: unknown) {
                              setError(authErrorMessage(err, "لغو ناموفق"));
                            }
                          })();
                        });
                      }}
                    >
                      لغو
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </ProductGrid>
      <p className="liveHint">
        persistence: {chrome.capabilities?.providers?.platformAdmin ?? "—"} · نقش:{" "}
        {profile?.platformRole}
      </p>
    </div>
  );
}
