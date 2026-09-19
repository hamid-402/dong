"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AgreedPriceSummary,
  AssetSummary,
  BudgetSummary,
  CatalogItemPrice,
  DeliverySummary,
  NeedSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  VendorSummary,
} from "@dang/contracts";
import { isReadOnlyRole, procurementVerticalSliceSteps } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  HeroBalance,
  ProductGrid,
  QuickAction,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  assetStatusLabel,
  deliveryStatusLabel,
  membershipRoleLabel,
  needStatusLabel,
  purchaseOrderStatusLabel,
  purchaseRequestStatusLabel,
} from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { formatFaDate } from "@/lib/fa-datetime";
import { wPath } from "@/lib/workspace-paths";
import type { ComponentProps } from "react";
import styles from "./procurement-view.module.css";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "approved" || status === "delivered" || status === "closed" || status === "active" || status === "fulfilled" || status === "complete") return "ok";
  if (status === "submitted" || status === "open" || status === "partially_delivered" || status === "ordered") return "gold";
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "draft" || status === "in_repair") return "warn";
  return "neutral";
}

const SLICE_LABELS: Record<(typeof procurementVerticalSliceSteps)[number], string> = {
  create_need: "????",
  create_purchase_request: "???????",
  approve_request: "?????",
  create_purchase_order: "?????",
  record_delivery: "?????",
  convert_to_asset: "?????",
};

export function ProcurementView() {
  const router = useRouter();
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState<NeedSummary[]>([]);
  const [requests, setRequests] = useState<PurchaseRequestSummary[]>([]);
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [needTitle, setNeedTitle] = useState("???? ??????");
  const [prTitle, setPrTitle] = useState("??????? ???? ??????");
  const [prToman, setPrToman] = useState("45000000");
  const [budgetName, setBudgetName] = useState("????? ???");
  const [budgetToman, setBudgetToman] = useState("500000000");
  const [vendorName, setVendorName] = useState("??????? ????");
  const [readOnly, setReadOnly] = useState(false);
  const [myRole, setMyRole] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [partnerPrices, setPartnerPrices] = useState<AgreedPriceSummary[]>([]);
  const [catalogPrices, setCatalogPrices] = useState<CatalogItemPrice[]>([]);
  const [partnerPriceId, setPartnerPriceId] = useState("");
  const [catalogPriceId, setCatalogPriceId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");

  const poExpenseLive = chrome.capabilities?.providers?.poExpenseLink === "po_expense_v1";
  const partnerPricesLive =
    chrome.capabilities?.providers?.partnerPrices === "partner_prices_v1";

  function GuardedForm(props: ComponentProps<typeof FormStack>) {
    if (readOnly) return null;
    return <FormStack {...props} />;
  }

  useEffect(() => {
    if (!chrome.ready) return;
    if (!chrome.workspaceId) {
      setWorkspaceId("");
      setLoading(false);
      return;
    }
    setWorkspaceId(chrome.workspaceId);
    setLoading(true);
    void refresh(chrome.workspaceId)
      .then(() => setError(null))
      .catch((err: unknown) => {
        setError(friendlyErrorMessage(err, "???"));
      })
      .finally(() => setLoading(false));
  }, [chrome.workspaceId, chrome.ready]);

  async function refresh(id: string) {
    const [n, r, b, v, o, d, a, members] = await Promise.all([
      api.listNeeds(id),
      api.listPurchaseRequests(id),
      api.listBudgets(id),
      api.listVendors(id),
      api.listPurchaseOrders(id),
      api.listDeliveries(id),
      api.listAssets(id),
      api.listMembers(id),
    ]);
    setNeeds(n);
    setRequests(r);
    setBudgets(b);
    setVendors(v);
    setOrders(o);
    setDeliveries(d);
    setAssets(a);
    const role = members.find((m) => m.userId === chrome.actor?.userId)?.role ?? "";
    setMyRole(role);
    setReadOnly(isReadOnlyRole(role));

    if (partnerPricesLive) {
      try {
        const agreements = await api.listAgreements(id);
        if (agreements[0]) {
          const prices = await api.listAgreedPrices(id, agreements[0].id);
          setPartnerPrices(prices);
        } else {
          setPartnerPrices([]);
        }
      } catch {
        setPartnerPrices([]);
      }
    } else {
      setPartnerPrices([]);
    }

    try {
      const catalogPage = await api.listCatalogItems(id, { activeOnly: true, limit: 20 });
      const item = catalogPage.items[0];
      if (item) {
        setCatalogItemId(item.id);
        const prices = await api.listCatalogPrices(id, item.id);
        setCatalogPrices(prices);
      } else {
        setCatalogItemId("");
        setCatalogPrices([]);
      }
    } catch {
      setCatalogItemId("");
      setCatalogPrices([]);
    }
  }

  const approved = requests.filter((r) => r.status === "approved" || r.status === "ordered");
  const pageError = error ?? chrome.error;
  const openNeeds = needs.filter((n) => n.status !== "fulfilled" && n.status !== "cancelled").length;
  const workspace = chrome.workspaces.find((item) => item.id === workspaceId);
  const selectedRequest =
    requests.find((request) => request.id === selectedRequestId) ??
    requests[0] ??
    null;

  const sliceDone: Record<(typeof procurementVerticalSliceSteps)[number], boolean> = {
    create_need: needs.length > 0,
    create_purchase_request: requests.length > 0,
    approve_request: requests.some((r) => r.status === "approved" || r.status === "ordered"),
    create_purchase_order: orders.length > 0,
    record_delivery: deliveries.length > 0,
    convert_to_asset: assets.length > 0,
  };

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.procurement}
        description="????? ??????? ????? ????? ? ????? ?? API ???? ???."
        primaryAction={
          workspaceId ? (
            <a href="#need-panel">??? ????</a>
          ) : (
            <Link href="/spaces/new?kind=org">{NAV_LABELS.createSpace}</Link>
          )
        }
        secondaryActions={
          workspace ? (
            <Link href={wPath(workspace.slug, "assets")}>{NAV_LABELS.assets}</Link>
          ) : undefined
        }
        state={!chrome.ready || loading ? "loading" : !workspaceId ? "empty" : "ready"}
        loadingLabel="?? ??? ???????? ???????�"
        empty={
          <EmptyStateBlock
            title="????? ?????? ????"
            description="??????? ???? ?????? ???????/???????? ??? � ??? ??? ??????."
            action={<Link href="/home">{NAV_LABELS.home}</Link>}
          />
        }
      >
        <FlashMessages error={pageError} successMessage={successMessage} />
        {readOnly && workspaceId ? (
          <StatusLine>
            ??? {membershipRoleLabel(myRole)} ??? ?????? ???? � ??? ????? PR ? ????? ???? ????.
          </StatusLine>
        ) : null}

        {workspaceId ? (
        <>
          <div className="heroGrid">
            <HeroBalance
              label="??????? ???"
              amount={String(openNeeds || needs.length)}
              subtitle="?? ?? ????? ?? ???"
              actionLabel="??? ???? ????"
              onAction={() => document.getElementById("need-panel")?.scrollIntoView({ behavior: "smooth" })}
              hint={`${budgets.length} ????? ????`}
            />
            <QuickAction
              title="??????? ????"
              description="?? ???? ????????? PR ??????."
              delayClass="delay1"
              icon={<ShellIconSvg name="cart" />}
              onClick={() => document.getElementById("pr-panel")?.scrollIntoView({ behavior: "smooth" })}
            />
            <QuickAction
              title="???????"
              description="?? ?? ?????? ?????? ??? ????."
              delayClass="delay2"
              icon={<ShellIconSvg name="box" />}
              onClick={() =>
                router.push(
                  workspace
                    ? wPath(workspace.slug, "assets")
                    : hubPathFor("/workspaces/assets"),
                )
              }
            />
          </div>

          <SectionCard title="?????? ???????" delayClass="delay1">
            <DataList>
              {procurementVerticalSliceSteps.map((step) => (
                <DataRow
                  key={step}
                  title={SLICE_LABELS[step]}
                  trailing={
                    <StatusPill tone={sliceDone[step] ? "ok" : "neutral"}>
                      {sliceDone[step] ? "?????????" : "??????????"}
                    </StatusPill>
                  }
                />
              ))}
            </DataList>
          </SectionCard>

          <ProductGrid>
          <SectionCard title="????" badge={needs.length} delayClass="delay1">
            <div id="need-panel" />
            <GuardedForm>
              <TextField label="?????" value={needTitle} onChange={(e) => setNeedTitle(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await api.createNeed(workspaceId, {
                        workspaceId,
                        title: needTitle,
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("???? ??? ??");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???"));
                    }
                  })();
                }}
              >
                ??? ????
              </Button>
            </GuardedForm>
            {needs.length === 0 ? (
              <EmptyHint>???? ????? ??? ????.</EmptyHint>
            ) : (
              <DataList>
                {needs.map((n) => (
                  <DataRow
                    key={n.id}
                    title={n.title}
                    trailing={<StatusPill tone={statusTone(n.status)}>{needStatusLabel(n.status)}</StatusPill>}
                    actions={
                      !readOnly && n.status === "open" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api
                                .fulfillNeed(workspaceId, n.id)
                                .then(() => refresh(workspaceId))
                                .then(() => flashSuccess("???? ??????? ??"))
                                .catch((err: unknown) => setError(friendlyErrorMessage(err, "???")));
                            }}
                          >
                            ???????
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api
                                .cancelNeed(workspaceId, n.id)
                                .then(() => refresh(workspaceId))
                                .then(() => flashSuccess("???? ??? ??"))
                                .catch((err: unknown) => setError(friendlyErrorMessage(err, "???")));
                            }}
                          >
                            ???
                          </Button>
                        </>
                      ) : null
                    }
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="??????? ????" badge={requests.length} delayClass="delay1">
            <div id="pr-panel" />
            <GuardedForm>
              <TextField label="?????" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
              <TextField label="???? (?????)" value={prToman} onChange={(e) => setPrToman(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const amount = tomanInputToIrrMinor(prToman);
                      if (!amount) {
                        setError("???? ??????? ??? (??? ????? / IRR)");
                        return;
                      }
                      await api.createPurchaseRequest(workspaceId, {
                        workspaceId,
                        title: prTitle,
                        amount,
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("??????? ???? ??? ??");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???"));
                    }
                  })();
                }}
              >
                ??? ???????
              </Button>
            </GuardedForm>
            {requests.length === 0 ? (
              <EmptyHint>??????? ????? ????.</EmptyHint>
            ) : (
              <div className={styles.masterDetail}>
              <DataList>
                {requests.map((r) => (
                  <DataRow
                    key={r.id}
                    title={r.title}
                    meta={<Amount irrMinor={r.amount.amountMinor} />}
                    trailing={<StatusPill tone={statusTone(r.status)}>{purchaseRequestStatusLabel(r.status)}</StatusPill>}
                    actions={
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-pressed={selectedRequest?.id === r.id}
                          onClick={() => setSelectedRequestId(r.id)}
                        >
                          ??????
                        </Button>
                        {r.status === "draft" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api.submitPurchaseRequest(workspaceId, r.id).then(() => refresh(workspaceId));
                            }}
                          >
                            ?????
                          </Button>
                        ) : null}
                        {r.status === "submitted" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api
                                .approvePurchaseRequest(workspaceId, {
                                  workspaceId,
                                  purchaseRequestId: r.id,
                                  decision: "approved",
                                })
                                .then(() => refresh(workspaceId));
                            }}
                          >
                            ?????
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </DataList>
              {selectedRequest ? (
                <aside className={styles.inspector} aria-label="?????? ??????? ???? ??????????">
                  <span>PURCHASE INSPECTOR</span>
                  <h3>{selectedRequest.title}</h3>
                  <Amount irrMinor={selectedRequest.amount.amountMinor} />
                  <dl>
                    <div><dt>?????</dt><dd>{purchaseRequestStatusLabel(selectedRequest.status)}</dd></div>
                    <div><dt>???????</dt><dd>{selectedRequest.vendorName ?? "?????? ????"}</dd></div>
                    <div><dt>???? ????</dt><dd>{selectedRequest.needId ? "???? ?? ????" : "??? ??????"}</dd></div>
                    <div><dt>?????????</dt><dd><code>{selectedRequest.createdByUserId.slice(0, 12)}</code></dd></div>
                    <div><dt>????? ???</dt><dd>{formatFaDate(selectedRequest.createdAt)}</dd></div>
                  </dl>
                </aside>
              ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="??????? ? ?????" delayClass="delay2">
            <GuardedForm>
              <TextField label="??? ???????" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await api.createVendor(workspaceId, {
                        workspaceId,
                        name: vendorName,
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("??????? ??? ??");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???"));
                    }
                  })();
                }}
              >
                ??? ???????
              </Button>
              {approved.length > 0 && vendors[0] ? (
                <>
                  {partnerPricesLive && partnerPrices.length > 0 ? (
                    <SelectField
                      label="???? ?????? ???? (???????)"
                      value={partnerPriceId}
                      onChange={(e) => {
                        setPartnerPriceId(e.target.value);
                        if (e.target.value) setCatalogPriceId("");
                      }}
                    >
                      <option value="">???? ???? ??????</option>
                      {partnerPrices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} � v{p.version}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                  {catalogPrices.length > 0 ? (
                    <SelectField
                      label="???? ??????? (???????)"
                      value={catalogPriceId}
                      onChange={(e) => {
                        setCatalogPriceId(e.target.value);
                        if (e.target.value) setPartnerPriceId("");
                      }}
                    >
                      <option value="">???? ???? ???????</option>
                      {catalogPrices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {Number(p.priceMinor) / 10} ????? � ?? {p.effectiveFrom}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        try {
                          const pr = approved.find((r) => r.status === "approved") ?? approved[0];
                          if (!pr || !vendors[0]) return;
                          await api.createPurchaseOrder(workspaceId, {
                            workspaceId,
                            purchaseRequestId: pr.id,
                            vendorId: vendors[0].id,
                            idempotencyKey: newClientId(),
                            ...(partnerPriceId ? { partnerPriceId } : {}),
                            ...(catalogPriceId && catalogItemId
                              ? { catalogPriceId, catalogItemId }
                              : {}),
                          });
                          await refresh(workspaceId);
                          setError(null);
                          flashSuccess("????? ???? ???? ??");
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "???"));
                        }
                      })();
                    }}
                  >
                    ???? ????? ?? ??????? ????????
                  </Button>
                </>
              ) : null}
            </GuardedForm>
            {vendors.length === 0 ? (
              <EmptyHint>?????????? ??? ????.</EmptyHint>
            ) : (
              <DataList>
                {vendors.map((v) => (
                  <DataRow key={v.id} title={v.name} />
                ))}
              </DataList>
            )}
            {orders.length === 0 ? (
              <EmptyHint>?????? ??? ????.</EmptyHint>
            ) : (
              <DataList>
                {orders.map((o) => (
                  <DataRow
                    key={o.id}
                    title={o.title}
                    meta={
                      o.expenseId
                        ? `${o.vendorName} � ????? ????`
                        : o.partnerPriceId || o.catalogPriceId
                          ? `${o.vendorName} � ???? ???????`
                          : o.vendorName
                    }
                    trailing={<StatusPill tone={statusTone(o.status)}>{purchaseOrderStatusLabel(o.status)}</StatusPill>}
                    actions={
                      <>
                        {o.status === "open" || o.status === "partially_delivered" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api
                                .recordDelivery(workspaceId, {
                                  workspaceId,
                                  purchaseOrderId: o.id,
                                  expectedQuantity: 1,
                                  receivedQuantity: 1,
                                  idempotencyKey: newClientId(),
                                })
                                .then(() => refresh(workspaceId));
                            }}
                          >
                            ??? ?????
                          </Button>
                        ) : null}
                        {!readOnly && (o.status === "open" || o.status === "partially_delivered") ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api
                                .cancelPurchaseOrder(workspaceId, o.id)
                                .then(() => refresh(workspaceId))
                                .then(() => flashSuccess("????? ??? ??"))
                                .catch((err: unknown) => setError(friendlyErrorMessage(err, "???")));
                            }}
                          >
                            ??? ?????
                          </Button>
                        ) : null}
                        {!readOnly && poExpenseLive && !o.expenseId && o.status !== "cancelled" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api
                                .linkPurchaseOrderExpense(workspaceId, o.id, {
                                  workspaceId,
                                  idempotencyKey: newClientId(),
                                })
                                .then(() => refresh(workspaceId))
                                .then(() => flashSuccess("????? ???????? ???? ??"))
                                .catch((err: unknown) => setError(friendlyErrorMessage(err, "???")));
                            }}
                          >
                            ????? ?? ?????
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="????? ? ???????" delayClass="delay2">
            {deliveries.length === 0 && assets.length === 0 ? (
              <EmptyHint>???? ????? ?? ?????? ????.</EmptyHint>
            ) : (
              <DataList>
                {deliveries.map((d) => (
                  <DataRow
                    key={d.id}
                    title={`????? ${d.purchaseOrderId.slice(0, 8)}�`}
                    meta={`${d.receivedQuantity}/${d.expectedQuantity}`}
                    trailing={<StatusPill tone={statusTone(d.status)}>{deliveryStatusLabel(d.status)}</StatusPill>}
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          void api
                            .createAssetFromDelivery(workspaceId, {
                              workspaceId,
                              deliveryId: d.id,
                              title: "????? ??????",
                              idempotencyKey: newClientId(),
                            })
                            .then(() => refresh(workspaceId));
                        }}
                      >
                        ????? ?? ?????
                      </Button>
                    }
                  />
                ))}
                {assets.map((a) => (
                  <DataRow
                    key={a.id}
                    title={a.title}
                    meta={a.location ?? "�"}
                    trailing={<StatusPill tone={statusTone(a.status)}>{assetStatusLabel(a.status)}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="?????" badge={budgets.length} delayClass="delay3">
            <GuardedForm>
              <TextField label="???" value={budgetName} onChange={(e) => setBudgetName(e.target.value)} />
              <TextField label="??? (?????)" value={budgetToman} onChange={(e) => setBudgetToman(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const ceiling = tomanInputToIrrMinor(budgetToman);
                      if (!ceiling) {
                        setError("??? ????? ??????? ??? (??? ????? / IRR)");
                        return;
                      }
                      const today = new Date().toISOString().slice(0, 10);
                      await api.createBudget(workspaceId, {
                        workspaceId,
                        name: budgetName,
                        ceiling,
                        periodStart: today,
                        periodEnd: `${today.slice(0, 4)}-12-29`,
                        idempotencyKey: newClientId(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                      flashSuccess("????? ??? ??");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???"));
                    }
                  })();
                }}
              >
                ??? ?????
              </Button>
            </GuardedForm>
            {budgets.length === 0 ? (
              <EmptyHint>???????? ????? ????.</EmptyHint>
            ) : (
              <DataList>
                {budgets.map((b) => (
                  <DataRow
                    key={b.id}
                    title={b.name}
                    trailing={<Amount irrMinor={b.ceiling.amountMinor} />}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>
        </ProductGrid>
        </>
        ) : null}
      </WorkspacePageFrame>
    </AppShell>
  );
}
