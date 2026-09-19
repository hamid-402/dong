"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  MembershipSummary,
  ProposalKind,
  ProposalSettingsSummary,
  ProposalSummary,
} from "@dang/contracts";
import { spaceKindForTemplate, isReadOnlyRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { membershipRoleLabel, proposalStatusLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "accepted") return "ok";
  if (status === "open") return "gold";
  if (status === "rejected" || status === "withdrawn") return "danger";
  return "neutral";
}

function kindLabel(kind: ProposalKind): string {
  return kind === "service" ? "????" : "????";
}

function requiredYesLabel(required: number, members: number, percent: number): string {
  return `${required} ??? ????? ?? ${members} ??? (?????? ${percent}%)`;
}

function ProposalProgress({ yes, required }: { yes: number; required: number }) {
  const pct = required > 0 ? Math.min(100, Math.round((yes / required) * 100)) : 0;
  return (
    <div className="proposalProgress" aria-label={`?????? ?????? ${pct} ????`}>
      <div className="proposalProgress__track">
        <span className="proposalProgress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="proposalProgress__meta">
        <span>
          ????? {yes.toLocaleString("fa-IR")} / {required.toLocaleString("fa-IR")}
        </span>
        <span>{pct.toLocaleString("fa-IR")}%</span>
      </div>
    </div>
  );
}

export function ProposalsView() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ProposalSettingsSummary | null>(null);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [meUserId, setMeUserId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProposalKind>("goods");
  const [description, setDescription] = useState("");
  const [toman, setToman] = useState("");
  const [quorumDraft, setQuorumDraft] = useState("51");
  const [pending, startTransition] = useTransition();

  const workspace = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const kindSpace = spaceKindForTemplate(workspace?.template);
  const myRole = members.find((m) => m.userId === meUserId)?.role;
  const canEditSettings = myRole === "owner" || myRole === "admin";
  const readOnly = isReadOnlyRole(myRole);

  const open = useMemo(() => proposals.filter((p) => p.status === "open"), [proposals]);
  const accepted = useMemo(
    () => proposals.filter((p) => p.status === "accepted"),
    [proposals],
  );
  const closedOther = useMemo(
    () => proposals.filter((p) => p.status === "rejected" || p.status === "withdrawn"),
    [proposals],
  );

  function memberName(userId: string): string {
    return members.find((m) => m.userId === userId)?.displayName ?? "???";
  }

  async function refresh(workspaceId: string) {
    const [s, list, memberList, me] = await Promise.all([
      api.getProposalSettings(workspaceId),
      api.listProposals(workspaceId),
      api.listMembers(workspaceId),
      api.me(),
    ]);
    setSettings(s);
    setQuorumDraft(String(s.quorumPercent));
    setProposals(list);
    setMembers(memberList);
    setMeUserId(me.actor.userId);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    if (!chrome.workspaceId) {
      setLoading(false);
      setProposals([]);
      setSettings(null);
      return;
    }
    setLoading(true);
    void refresh(chrome.workspaceId)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "???")))
      .finally(() => setLoading(false));
  }, [chrome.workspaceId, chrome.ready]);

  function onCreate() {
    if (!chrome.workspaceId) return;
    const name = title.trim();
    if (name.length < 2) {
      setError("????? ??????? ?? ???? ????");
      return;
    }
    const tomanNum = toman.trim() ? tomanInputToIrrMinor(toman) : null;
    startTransition(() => {
      void (async () => {
        try {
          await api.createProposal(chrome.workspaceId, {
            workspaceId: chrome.workspaceId,
            kind,
            title: name,
            description: description.trim() || undefined,
            estimatedAmount: tomanNum ?? undefined,
            idempotencyKey: newClientId(),
          });
          setTitle("");
          setDescription("");
          setToman("");
          flashSuccess("??????? ??? ?? ? ???? ??? ???? ??? ???");
          await refresh(chrome.workspaceId);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "??? ??????? ??????"));
        }
      })();
    });
  }

  function onVote(proposalId: string, choice: "yes" | "no") {
    if (!chrome.workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const updated = await api.castProposalVote(chrome.workspaceId, proposalId, { choice });
          await refresh(chrome.workspaceId);
          if (updated.status === "accepted") {
            flashSuccess("?????? ????? ?? � ??????? ?? ???? ?????? ????? ??");
          } else if (updated.status === "rejected") {
            flashSuccess("???????? ???? ??? ??????? ?? ?????? ?????");
          } else {
            flashSuccess(choice === "yes" ? "??? ????? ??? ??? ??" : "??? ????? ??? ??? ??");
          }
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "??? ??? ??????"));
        }
      })();
    });
  }

  function onWithdraw(proposalId: string) {
    if (!chrome.workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.withdrawProposal(chrome.workspaceId, proposalId);
          flashSuccess("??????? ??? ??");
          await refresh(chrome.workspaceId);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "??? ??????"));
        }
      })();
    });
  }

  function onSaveQuorum() {
    if (!chrome.workspaceId || !canEditSettings) return;
    const pct = Number(quorumDraft);
    startTransition(() => {
      void (async () => {
        try {
          const next = await api.updateProposalSettings(chrome.workspaceId, {
            quorumPercent: pct,
          });
          setSettings(next);
          flashSuccess(`?????? ${next.quorumPercent}% ???? ?????????? ???? ????? ??`);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "????? ?????? ??????"));
        }
      })();
    });
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      {error ? <p className="liveError">{error}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}
      {loading ? <ContentSkeleton rows={3} label="?? ??? ???????? ?????????�" /> : null}

      {!chrome.workspaceId && !loading ? (
        <EmptyHint>????? ?? ???? ????? ?? ??????? ?????? ????.</EmptyHint>
      ) : null}

      {chrome.workspaceId && !loading ? (
        <ProductGrid>
          <SectionCard
            title="????? ????????"
            badge={open.length}
            delayClass="delay1"
          >
            <StatusLine>
              ???: <b>{open.length.toLocaleString("fa-IR")}</b>
              {" � "}
              ???????: <b>{accepted.length.toLocaleString("fa-IR")}</b>
              {" � "}
              ????: <b>{members.length.toLocaleString("fa-IR")}</b>
              {settings ? (
                <>
                  {" � "}
                  ??????: <b>{settings.quorumPercent.toLocaleString("fa-IR")}%</b>
                </>
              ) : null}
            </StatusLine>
            {settings ? (
              <p className="liveHint">
                {requiredYesLabel(
                  Math.max(1, Math.ceil((members.length * settings.quorumPercent) / 100)),
                  members.length,
                  settings.quorumPercent,
                )}
              </p>
            ) : null}

            <details className="reportDetails">
              <summary>
                <span>??? ??????? ????</span>
                <span>{kindLabel(kind)}</span>
              </summary>
              <div className="reportDetails__body">
                {readOnly ? (
                  <StatusLine>
                    ??? {membershipRoleLabel(myRole)} ??? ?????? ???? � ??? ??????? ???? ????.
                  </StatusLine>
                ) : (
                <FormStack density="compact">
                  <SelectField
                    label="???"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as ProposalKind)}
                  >
                    <option value="goods">????</option>
                    <option value="service">????</option>
                  </SelectField>
                  <TextField
                    label="?????"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    hint="????? ???? ???????? ?? ????? ????? ??????"
                  />
                  <TextField
                    label="?????"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    hint="??????? � ???? ?? ??????"
                  />
                  <TextField
                    label="?????? (?????)"
                    value={toman}
                    onChange={(e) => setToman(e.target.value)}
                    inputMode="numeric"
                    hint="??????? � ????? ?? ???? ???? ???? ??????"
                  />
                  <Button type="button" disabled={pending} onClick={onCreate}>
                    ????? ???? ????????
                  </Button>
                </FormStack>
                )}
              </div>
            </details>

            {canEditSettings && settings ? (
              <details className="reportDetails">
                <summary>
                  <span>????? ??????</span>
                  <span>{settings.quorumPercent}%</span>
                </summary>
                <div className="reportDetails__body">
                  <FormStack density="compact">
                    <TextField
                      label="???? ?????? (? ?? ???)"
                      value={quorumDraft}
                      onChange={(e) => setQuorumDraft(e.target.value)}
                      inputMode="numeric"
                      hint="??? owner/admin � ??? ?????????? ??? ???? ????? ??????"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={onSaveQuorum}
                    >
                      ????? ??????
                    </Button>
                  </FormStack>
                </div>
              </details>
            ) : null}
          </SectionCard>

          <SectionCard title="?? ?? ???" badge={open.length} delayClass="delay1">
            {open.length === 0 ? (
              <EmptyHint>??????? ???? ????. ?? ??? ???? ??? ??? ????.</EmptyHint>
            ) : (
              <div className="proposalList">
                {open.map((item) => {
                  const canWithdraw =
                    item.createdByUserId === meUserId || canEditSettings;
                  return (
                    <article key={item.id} className="proposalCard">
                      <header className="proposalCard__head">
                        <div className="proposalCard__titles">
                          <div className="proposalCard__tags">
                            <StatusPill tone="neutral">{kindLabel(item.kind)}</StatusPill>
                            <StatusPill tone={statusTone(item.status)}>
                              {proposalStatusLabel(item.status)}
                            </StatusPill>
                          </div>
                          <h3>{item.title}</h3>
                          <p className="proposalCard__by">
                            ????????????: {memberName(item.createdByUserId)}
                            {item.tally.myVote
                              ? ` � ??? ???: ${item.tally.myVote === "yes" ? "?????" : "?????"}`
                              : " � ???? ??? ?????????"}
                          </p>
                        </div>
                        {item.estimatedAmount ? (
                          <div className="proposalCard__amount">
                            <span>??????</span>
                            <Amount irrMinor={item.estimatedAmount.amountMinor} />
                          </div>
                        ) : null}
                      </header>

                      {item.description ? (
                        <p className="proposalCard__desc">{item.description}</p>
                      ) : null}

                      <ProposalProgress
                        yes={item.tally.yesCount}
                        required={item.tally.requiredYes}
                      />
                      <p className="proposalCard__tallyHint">
                        ????? {item.tally.noCount.toLocaleString("fa-IR")} �{" "}
                        {requiredYesLabel(
                          item.tally.requiredYes,
                          item.tally.activeMemberCount,
                          settings?.quorumPercent ?? 51,
                        )}
                      </p>

                      <div className="proposalCard__actions">
                        {readOnly ? (
                          <StatusLine>
                            ??? {membershipRoleLabel(myRole)} ??? ?????? � ??? ???? ????.
                          </StatusLine>
                        ) : (
                          <>
                        <Button
                          type="button"
                          size="sm"
                          variant={item.tally.myVote === "yes" ? "primary" : "ghost"}
                          disabled={pending}
                          onClick={() => onVote(item.id, "yes")}
                        >
                          ?????
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={item.tally.myVote === "no" ? "secondary" : "ghost"}
                          disabled={pending}
                          onClick={() => onVote(item.id, "no")}
                        >
                          ?????
                        </Button>
                        {canWithdraw ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={pending}
                            onClick={() => onWithdraw(item.id)}
                          >
                            ???
                          </Button>
                        ) : null}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="??????????????" badge={accepted.length} tone="quiet" delayClass="delay2">
            {accepted.length === 0 ? (
              <EmptyHint>???? ???????? ?? ?????? ?????? ???.</EmptyHint>
            ) : (
              <div className="proposalList">
                {accepted.map((item) => (
                  <article key={item.id} className="proposalCard proposalCard--done">
                    <header className="proposalCard__head">
                      <div className="proposalCard__titles">
                        <div className="proposalCard__tags">
                          <StatusPill tone="neutral">{kindLabel(item.kind)}</StatusPill>
                          <StatusPill tone="ok">{proposalStatusLabel(item.status)}</StatusPill>
                        </div>
                        <h3>{item.title}</h3>
                        <p className="proposalCard__by">
                          ????????????: {memberName(item.createdByUserId)} � ?????{" "}
                          {item.tally.yesCount.toLocaleString("fa-IR")}/
                          {item.tally.requiredYes.toLocaleString("fa-IR")}
                        </p>
                      </div>
                      {item.estimatedAmount ? (
                        <div className="proposalCard__amount">
                          <span>??????</span>
                          <Amount irrMinor={item.estimatedAmount.amountMinor} />
                        </div>
                      ) : null}
                    </header>
                    {item.acceptedNeedId ? (
                      <div className="proposalCard__actions">
                        <StatusLine>
                          ?? ???? ?????? ????? ??
                          {kindSpace === "org" ? (
                            <>
                              {" � "}
                              <Link
                                href={
                                  workspace
                                    ? wPath(workspace.slug, "procurement")
                                    : hubPathFor("/workspaces/procurement")
                                }
                              >
                                ????? ?? ???????
                              </Link>
                            </>
                          ) : null}
                        </StatusLine>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </SectionCard>

          {closedOther.length > 0 ? (
            <SectionCard
              title="?? / ??? ???"
              badge={closedOther.length}
              tone="quiet"
              delayClass="delay2"
            >
              <div className="proposalList">
                {closedOther.map((item) => (
                  <article key={item.id} className="proposalCard proposalCard--muted">
                    <header className="proposalCard__head">
                      <div className="proposalCard__titles">
                        <div className="proposalCard__tags">
                          <StatusPill tone="neutral">{kindLabel(item.kind)}</StatusPill>
                          <StatusPill tone={statusTone(item.status)}>
                            {proposalStatusLabel(item.status)}
                          </StatusPill>
                        </div>
                        <h3>{item.title}</h3>
                        <p className="proposalCard__by">
                          ????? {item.tally.yesCount.toLocaleString("fa-IR")} � ?????{" "}
                          {item.tally.noCount.toLocaleString("fa-IR")}
                        </p>
                      </div>
                    </header>
                  </article>
                ))}
              </div>
            </SectionCard>
          ) : null}
        </ProductGrid>
      ) : null}
    </AppShell>
  );
}
