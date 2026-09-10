"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AssetSummary,
  BudgetSummary,
  DeliverySummary,
  NeedSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  VendorSummary,
} from "@dang/contracts";
import { isReadOnlyRole } from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  HeroBalance,
  ProductGrid,
  QuickAction,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import {
  assetStatusLabel,
  deliveryStatusLabel,
  membershipRoleLabel,
  needStatusLabel,
  purchaseOrderStatusLabel,
  purchaseRequestStatusLabel,
} from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
import type { ComponentProps } from "react";
import styles from "./procurement-view.module.css";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "approved" || status === "delivered" || status === "closed" || status === "active") return "ok";
  if (status === "submitted" || status === "open" || status === "partially_delivered" || status === "ordered") return "gold";
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "draft") return "warn";
  return "neutral";
}

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
  const [needTitle, setNeedTitle] = useState("خرید لپ‌تاپ");
  const [prTitle, setPrTitle] = useState("درخواست خرید لپ‌تاپ");
  const [prToman, setPrToman] = useState("45000000");
  const [budgetName, setBudgetName] = useState("بودجه تیم");
  const [budgetToman, setBudgetToman] = useState("500000000");
  const [vendorName, setVendorName] = useState("فروشگاه دیجی");
  const [readOnly, setReadOnly] = useState(false);
  const [myRole, setMyRole] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");

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
        setError(friendlyErrorMessage(err, "خطا"));
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
  }

  const approved = requests.filter((r) => r.status === "approved" || r.status === "ordered");
  const pageError = error ?? chrome.error;
  const openNeeds = needs.filter((n) => n.status !== "fulfilled" && n.status !== "cancelled").length;
  const workspace = chrome.workspaces.find((item) => item.id === workspaceId);
  const selectedRequest =
    requests.find((request) => request.id === selectedRequestId) ??
    requests[0] ??
    null;

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}
      {workspaceId && workspace ? (
        <OperationsModuleHeader
          ariaLabel="عملیات تدارکات"
          destinations={[
            { key: "procurement", label: "تدارکات", href: wPath(workspace.slug, "procurement"), active: true },
            { key: "proposals", label: "پیشنهاد و رأی", href: wPath(workspace.slug, "proposals"), active: false },
            { key: "assets", label: "تجهیزات", href: wPath(workspace.slug, "assets"), active: false },
            { key: "members", label: "اعضا", href: wPath(workspace.slug, "members"), active: false },
          ]}
          metrics={[
            { label: "نیاز باز", value: String(openNeeds), detail: `${needs.length} نیاز در کل`, tone: openNeeds > 0 ? "attention" : "positive" },
            { label: "درخواست خرید", value: String(requests.length), detail: `${approved.length} آماده سفارش` },
            { label: "سفارش", value: String(orders.length), detail: `${vendors.length} فروشنده` },
            { label: "تحویل", value: String(deliveries.length), detail: `${assets.length} دارایی ایجادشده` },
          ]}
          roleLabel={myRole ? membershipRoleLabel(myRole) : null}
          persistenceLabel={chrome.persistenceLabel}
          pending={loading}
          onRefresh={() => {
            setLoading(true);
            void refresh(workspaceId)
              .catch((reason: unknown) => setError(friendlyErrorMessage(reason, "تازه‌سازی تدارکات ناموفق")))
              .finally(() => setLoading(false));
          }}
        />
      ) : null}
      {readOnly && workspaceId ? (
        <StatusLine>
          نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ثبت نیاز، PR و بودجه فعال نیست.
        </StatusLine>
      ) : null}

      {loading ? (
        <EmptyHint>در حال بارگذاری تدارکات…</EmptyHint>
      ) : !workspaceId ? (
        <EmptyHint>
          ابتدا فضای کاری بسازید — <Link href={hubPathFor("/workspaces")}>بازگشت به مالی</Link> یا{" "}
          <Link href={hubPathFor("/onboarding")}>ساخت فضای کاری</Link>
        </EmptyHint>
      ) : (
        <>
          <div className="heroGrid">
            <HeroBalance
              label="نیازهای باز"
              amount={String(openNeeds || needs.length)}
              subtitle="در صف بررسی یا ثبت"
              actionLabel="ثبت نیاز جدید"
              onAction={() => document.getElementById("need-panel")?.scrollIntoView({ behavior: "smooth" })}
              hint={`${budgets.length} بودجه فعال`}
            />
            <QuickAction
              title="درخواست خرید"
              description="از نیاز تأییدشده، PR بسازید."
              delayClass="delay1"
              icon={<ShellIconSvg name="cart" />}
              onClick={() => document.getElementById("pr-panel")?.scrollIntoView({ behavior: "smooth" })}
            />
            <QuickAction
              title="تجهیزات"
              description="پس از تحویل، دارایی ثبت کنید."
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

          <ProductGrid>
          <SectionCard title="نیاز" badge={needs.length} delayClass="delay1">
            <div id="need-panel" />
            <GuardedForm>
              <TextField label="عنوان" value={needTitle} onChange={(e) => setNeedTitle(e.target.value)} />
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
                      flashSuccess("نیاز ثبت شد");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "خطا"));
                    }
                  })();
                }}
              >
                ثبت نیاز
              </Button>
            </GuardedForm>
            {needs.length === 0 ? (
              <EmptyHint>هنوز نیازی ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {needs.map((n) => (
                  <DataRow
                    key={n.id}
                    title={n.title}
                    trailing={<StatusPill tone={statusTone(n.status)}>{needStatusLabel(n.status)}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="درخواست خرید" badge={requests.length} delayClass="delay1">
            <div id="pr-panel" />
            <GuardedForm>
              <TextField label="عنوان" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
              <TextField label="مبلغ (تومان)" value={prToman} onChange={(e) => setPrToman(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const amount = tomanInputToIrrMinor(prToman);
                      if (!amount) {
                        setError("مبلغ نامعتبر است (فقط تومان / IRR)");
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
                      flashSuccess("درخواست خرید ثبت شد");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "خطا"));
                    }
                  })();
                }}
              >
                ثبت درخواست
              </Button>
            </GuardedForm>
            {requests.length === 0 ? (
              <EmptyHint>درخواست خریدی نیست.</EmptyHint>
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
                          جزئیات
                        </Button>
                        {r.status === "draft" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              void api.submitPurchaseRequest(workspaceId, r.id).then(() => refresh(workspaceId));
                            }}
                          >
                            ارسال
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
                            تأیید
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </DataList>
              {selectedRequest ? (
                <aside className={styles.inspector} aria-label="جزئیات درخواست خرید انتخاب‌شده">
                  <span>PURCHASE INSPECTOR</span>
                  <h3>{selectedRequest.title}</h3>
                  <Amount irrMinor={selectedRequest.amount.amountMinor} />
                  <dl>
                    <div><dt>وضعیت</dt><dd>{purchaseRequestStatusLabel(selectedRequest.status)}</dd></div>
                    <div><dt>فروشنده</dt><dd>{selectedRequest.vendorName ?? "انتخاب نشده"}</dd></div>
                    <div><dt>نیاز مبنا</dt><dd>{selectedRequest.needId ? "متصل به نیاز" : "ثبت مستقیم"}</dd></div>
                    <div><dt>ثبت‌کننده</dt><dd><code>{selectedRequest.createdByUserId.slice(0, 12)}</code></dd></div>
                    <div><dt>تاریخ ثبت</dt><dd>{new Date(selectedRequest.createdAt).toLocaleDateString("fa-IR")}</dd></div>
                  </dl>
                </aside>
              ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="فروشنده و سفارش" delayClass="delay2">
            <GuardedForm>
              <TextField label="نام فروشنده" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
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
                      flashSuccess("فروشنده ثبت شد");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "خطا"));
                    }
                  })();
                }}
              >
                ثبت فروشنده
              </Button>
              {approved.length > 0 && vendors[0] ? (
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
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("سفارش خرید صادر شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "خطا"));
                      }
                    })();
                  }}
                >
                  صدور سفارش از درخواست تأییدشده
                </Button>
              ) : null}
            </GuardedForm>
            {vendors.length === 0 ? (
              <EmptyHint>فروشنده‌ای ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {vendors.map((v) => (
                  <DataRow key={v.id} title={v.name} />
                ))}
              </DataList>
            )}
            {orders.length === 0 ? (
              <EmptyHint>سفارشی ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {orders.map((o) => (
                  <DataRow
                    key={o.id}
                    title={o.title}
                    meta={o.vendorName}
                    trailing={<StatusPill tone={statusTone(o.status)}>{purchaseOrderStatusLabel(o.status)}</StatusPill>}
                    actions={
                      o.status === "open" || o.status === "partially_delivered" ? (
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
                          ثبت تحویل
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="تحویل و تجهیزات" delayClass="delay2">
            {deliveries.length === 0 && assets.length === 0 ? (
              <EmptyHint>هنوز تحویل یا تجهیزی نیست.</EmptyHint>
            ) : (
              <DataList>
                {deliveries.map((d) => (
                  <DataRow
                    key={d.id}
                    title={`سفارش ${d.purchaseOrderId.slice(0, 8)}…`}
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
                              title: "تجهیز تحویلی",
                              idempotencyKey: newClientId(),
                            })
                            .then(() => refresh(workspaceId));
                        }}
                      >
                        تبدیل به تجهیز
                      </Button>
                    }
                  />
                ))}
                {assets.map((a) => (
                  <DataRow
                    key={a.id}
                    title={a.title}
                    meta={a.location ?? "—"}
                    trailing={<StatusPill tone={statusTone(a.status)}>{assetStatusLabel(a.status)}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="بودجه" badge={budgets.length} delayClass="delay3">
            <GuardedForm>
              <TextField label="نام" value={budgetName} onChange={(e) => setBudgetName(e.target.value)} />
              <TextField label="سقف (تومان)" value={budgetToman} onChange={(e) => setBudgetToman(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const ceiling = tomanInputToIrrMinor(budgetToman);
                      if (!ceiling) {
                        setError("سقف بودجه نامعتبر است (فقط تومان / IRR)");
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
                      flashSuccess("بودجه ثبت شد");
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "خطا"));
                    }
                  })();
                }}
              >
                ثبت بودجه
              </Button>
            </GuardedForm>
            {budgets.length === 0 ? (
              <EmptyHint>بودجه‌ای تعریف نشده.</EmptyHint>
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
      )}
    </AppShell>
  );
}
