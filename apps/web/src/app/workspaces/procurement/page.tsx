"use client";

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
import { Amount, Button, TextField } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  HeroBalance,
  PageHeader,
  ProductGrid,
  QuickAction,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "approved" || status === "delivered" || status === "closed" || status === "active") return "ok";
  if (status === "submitted" || status === "open" || status === "partially_delivered" || status === "ordered") return "gold";
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "draft") return "warn";
  return "neutral";
}

export default function ProcurementPage() {
  const router = useRouter();
  const chrome = useAppChrome();
  const [workspaceId, setWorkspaceId] = useState("");
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.listWorkspaces();
        const id = list[0]?.id ?? "";
        setWorkspaceId(id);
        if (id) await refresh(id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "خطا");
      }
    })();
  }, []);

  async function refresh(id: string) {
    const [n, r, b, v, o, d, a] = await Promise.all([
      api.listNeeds(id),
      api.listPurchaseRequests(id),
      api.listBudgets(id),
      api.listVendors(id),
      api.listPurchaseOrders(id),
      api.listDeliveries(id),
      api.listAssets(id),
    ]);
    setNeeds(n);
    setRequests(r);
    setBudgets(b);
    setVendors(v);
    setOrders(o);
    setDeliveries(d);
    setAssets(a);
  }

  const approved = requests.filter((r) => r.status === "approved" || r.status === "ordered");
  const pageError = error ?? chrome.error;
  const openNeeds = needs.filter((n) => n.status !== "fulfilled" && n.status !== "cancelled").length;

  return (
    <AppShell
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="چرخه خرید"
        title="تدارکات و سفارش"
        description={
          workspaceId
            ? `${needs.length} نیاز · ${requests.length} درخواست · ${orders.length} سفارش`
            : "از نیاز تا سفارش، تحویل و تجهیز — همراه بودجه."
        }
        actions={
          <>
            <Link href="/workspaces">مالی</Link>
            <Link href="/workspaces/assets">تجهیزات</Link>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}

      {!workspaceId ? (
        <EmptyHint>
          ابتدا فضای کاری بسازید — <Link href="/workspaces">بازگشت به مالی</Link> یا{" "}
          <Link href="/onboarding">ساخت فضای کاری</Link>
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
              onClick={() => router.push("/workspaces/assets")}
            />
          </div>

          <ProductGrid>
          <SectionCard title="نیاز" badge={needs.length} delayClass="delay1">
            <div id="need-panel" />
            <FormStack>
              <TextField label="عنوان" value={needTitle} onChange={(e) => setNeedTitle(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await api.createNeed(workspaceId, {
                        workspaceId,
                        title: needTitle,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refresh(workspaceId);
                      setError(null);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطا");
                    }
                  })();
                }}
              >
                ثبت نیاز
              </Button>
            </FormStack>
            {needs.length === 0 ? (
              <EmptyHint>هنوز نیازی ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {needs.map((n) => (
                  <DataRow
                    key={n.id}
                    title={n.title}
                    trailing={<StatusPill tone={statusTone(n.status)}>{n.status}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="درخواست خرید" badge={requests.length} delayClass="delay1">
            <div id="pr-panel" />
            <FormStack>
              <TextField label="عنوان" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
              <TextField label="مبلغ (تومان)" value={prToman} onChange={(e) => setPrToman(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const toman = Number(prToman.replaceAll(",", ""));
                      await api.createPurchaseRequest(workspaceId, {
                        workspaceId,
                        title: prTitle,
                        amount: { amountMinor: String(Math.round(toman) * 10), currency: "IRR" },
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refresh(workspaceId);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطا");
                    }
                  })();
                }}
              >
                ثبت درخواست
              </Button>
            </FormStack>
            {requests.length === 0 ? (
              <EmptyHint>درخواست خریدی نیست.</EmptyHint>
            ) : (
              <DataList>
                {requests.map((r) => (
                  <DataRow
                    key={r.id}
                    title={r.title}
                    meta={<Amount irrMinor={r.amount.amountMinor} />}
                    trailing={<StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>}
                    actions={
                      <>
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
            )}
          </SectionCard>

          <SectionCard title="فروشنده و سفارش" delayClass="delay2">
            <FormStack>
              <TextField label="نام فروشنده" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await api.createVendor(workspaceId, {
                        workspaceId,
                        name: vendorName,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refresh(workspaceId);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطا");
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
                          idempotencyKey: crypto.randomUUID(),
                        });
                        await refresh(workspaceId);
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "خطا");
                      }
                    })();
                  }}
                >
                  صدور سفارش از درخواست تأییدشده
                </Button>
              ) : null}
            </FormStack>
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
                    trailing={<StatusPill tone={statusTone(o.status)}>{o.status}</StatusPill>}
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
                                idempotencyKey: crypto.randomUUID(),
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
                    trailing={<StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill>}
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
                              idempotencyKey: crypto.randomUUID(),
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
                    trailing={<StatusPill tone={statusTone(a.status)}>{a.status}</StatusPill>}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="بودجه" badge={budgets.length} delayClass="delay3">
            <FormStack>
              <TextField label="نام" value={budgetName} onChange={(e) => setBudgetName(e.target.value)} />
              <TextField label="سقف (تومان)" value={budgetToman} onChange={(e) => setBudgetToman(e.target.value)} />
              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const toman = Number(budgetToman.replaceAll(",", ""));
                      const today = new Date().toISOString().slice(0, 10);
                      await api.createBudget(workspaceId, {
                        workspaceId,
                        name: budgetName,
                        ceiling: { amountMinor: String(Math.round(toman) * 10), currency: "IRR" },
                        periodStart: today,
                        periodEnd: `${today.slice(0, 4)}-12-29`,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refresh(workspaceId);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطا");
                    }
                  })();
                }}
              >
                ثبت بودجه
              </Button>
            </FormStack>
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
