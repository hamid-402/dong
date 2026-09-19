"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  AssetDepreciationReportRow,
  AssetSummary,
  MembershipSummary,
} from "@dang/contracts";
import { isReadOnlyRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
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
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { NAV_LABELS } from "@/lib/nav-labels";
import { assetStatusLabel, deliveryStatusLabel, membershipRoleLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { formatFaDate } from "@/lib/fa-datetime";
import { wPath } from "@/lib/workspace-paths";
import styles from "./assets-view.module.css";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "active" || status === "in_use") return "ok";
  if (status === "maintenance" || status === "reserved" || status === "in_repair") return "warn";
  if (status === "retired" || status === "lost" || status === "damaged") return "danger";
  return "neutral";
}

export function AssetsView() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [deliveries, setDeliveries] = useState<Array<{ id: string; label: string }>>([]);
  const [title, setTitle] = useState("لپ‌تاپ پروژه");
  const [deliveryId, setDeliveryId] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [pending, startTransition] = useTransition();
  const [depRows, setDepRows] = useState<AssetDepreciationReportRow[] | null>(null);

  const depreciationLive =
    chrome.capabilities?.providers?.assetDepreciation === "depreciation_v1";

  async function refresh(id: string) {
    const [a, m, d] = await Promise.all([
      api.listAssets(id),
      api.listMembers(id),
      api.listDeliveries(id),
    ]);
    setAssets(a);
    setMembers(m);
    setDeliveries(
      d.map((item) => ({
        id: item.id,
        label: `${deliveryStatusLabel(item.status)} · ${item.receivedQuantity}/${item.expectedQuantity}`,
      })),
    );
    if (!deliveryId && d[0]) setDeliveryId(d[0].id);
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

  const pageError = error ?? chrome.error;
  const myRole = members.find((m) => m.userId === chrome.actor?.userId)?.role;
  const readOnly = isReadOnlyRole(myRole);
  const workspace = chrome.workspaces.find((item) => item.id === workspaceId);
  const selectedAsset =
    assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const memberLabel = (userId: string | undefined) =>
    members.find((member) => member.userId === userId)?.displayName ?? "—";

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.assets}
        description="دارایی‌های ثبت‌شده از تحویل خرید — فقط دادهٔ API همین فضا."
        primaryAction={
          workspaceId ? (
            <a href="#asset-create-panel">ثبت دارایی</a>
          ) : (
            <Link href="/spaces/new">{NAV_LABELS.createSpace}</Link>
          )
        }
        secondaryActions={
          workspace ? (
            <Link href={wPath(workspace.slug, "procurement")}>{NAV_LABELS.procurement}</Link>
          ) : undefined
        }
        state={!chrome.ready || loading ? "loading" : !workspaceId ? "empty" : "ready"}
        loadingLabel="در حال بارگذاری تجهیزات…"
        empty={
          <EmptyStateBlock
            title="فضایی انتخاب نشده"
            description="بعد از ساخت فضا و تحویل خرید، دارایی را از همین صفحه ثبت کنید."
            action={<Link href="/home">{NAV_LABELS.home}</Link>}
          />
        }
      >
        <FlashMessages error={pageError} successMessage={successMessage} />
        {workspaceId ? (
        <ProductGrid>
          {readOnly ? (
            <StatusLine>
              نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ثبت دارایی فعال نیست.
            </StatusLine>
          ) : (
          <SectionCard title="ثبت دارایی از تحویل" delayClass="delay1">
            <div id="asset-create-panel" />
            <FormStack>
              <TextField label="عنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
              <SelectField
                label="تحویل"
                value={deliveryId}
                onChange={(e) => setDeliveryId(e.target.value)}
              >
                <option value="">انتخاب تحویل</option>
                {deliveries.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </SelectField>
              <Button
                disabled={pending || !workspaceId || !deliveryId}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        const owner = members[0]?.userId;
                        if (!owner) throw new Error("عضوی برای مالک یافت نشد");
                        await api.createAssetFromDelivery(workspaceId, {
                          workspaceId,
                          deliveryId,
                          title,
                          ownerUserId: owner,
                          custodianUserId: owner,
                          idempotencyKey: newClientId(),
                        });
                        await refresh(workspaceId);
                        setError(null);
                        flashSuccess("دارایی ثبت شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "خطا"));
                      }
                    })();
                  });
                }}
              >
                ایجاد دارایی
              </Button>
            </FormStack>
            {deliveries.length === 0 ? (
              <EmptyHint>هنوز تحویلی نیست. از مسیر خرید، سفارش و تحویل را ثبت کنید.</EmptyHint>
            ) : null}
          </SectionCard>
          )}

          <SectionCard title="فهرست دارایی‌ها" badge={assets.length} delayClass="delay2">
            {assets.length === 0 ? (
              <EmptyHint>دارایی ثبت نشده.</EmptyHint>
            ) : (
              <div className={styles.masterDetail}>
              <DataList>
                {assets.map((asset) => (
                  <DataRow
                    key={asset.id}
                    title={asset.title}
                    meta={asset.location ?? undefined}
                    trailing={
                      <>
                        <StatusPill tone={statusTone(asset.status)}>
                          {assetStatusLabel(asset.status)}
                        </StatusPill>
                        {asset.acquisitionCost ? (
                          <Amount irrMinor={asset.acquisitionCost.amountMinor} />
                        ) : (
                          <span>—</span>
                        )}
                      </>
                    }
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        aria-pressed={selectedAsset?.id === asset.id}
                        onClick={() => setSelectedAssetId(asset.id)}
                      >
                        جزئیات
                      </Button>
                    }
                  />
                ))}
              </DataList>
              {selectedAsset ? (
                <aside className={styles.inspector} aria-label="جزئیات دارایی انتخاب‌شده">
                  <span>جزئیات دارایی</span>
                  <h3>{selectedAsset.title}</h3>
                  <StatusPill tone={statusTone(selectedAsset.status)}>
                    {assetStatusLabel(selectedAsset.status)}
                  </StatusPill>
                  <dl>
                    <div><dt>مالک</dt><dd>{memberLabel(selectedAsset.ownerUserId)}</dd></div>
                    <div><dt>امانت‌دار</dt><dd>{memberLabel(selectedAsset.custodianUserId)}</dd></div>
                    <div><dt>مکان</dt><dd>{selectedAsset.location ?? "ثبت نشده"}</dd></div>
                    <div><dt>شماره سریال</dt><dd>{selectedAsset.serialNumber ?? "ثبت نشده"}</dd></div>
                    <div><dt>منشأ تحویل</dt><dd>{selectedAsset.deliveryId ? "تحویل خرید" : "ثبت مستقیم"}</dd></div>
                    <div><dt>تاریخ ثبت</dt><dd>{formatFaDate(selectedAsset.createdAt)}</dd></div>
                    {selectedAsset.accumulatedDepreciationMinor != null ? (
                      <div>
                        <dt>استهلاک انباشته</dt>
                        <dd>
                          <Amount irrMinor={selectedAsset.accumulatedDepreciationMinor} />
                        </dd>
                      </div>
                    ) : null}
                    {selectedAsset.lastDepreciatedOn ? (
                      <div>
                        <dt>آخرین استهلاک</dt>
                        <dd>{selectedAsset.lastDepreciatedOn}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {selectedAsset.acquisitionCost ? (
                    <p>بهای تحصیل <Amount irrMinor={selectedAsset.acquisitionCost.amountMinor} /></p>
                  ) : null}
                  {!readOnly ? (
                    <div className="productHeaderActions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                      {selectedAsset.status === "active" || selectedAsset.status === "damaged" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            startTransition(() => {
                              void (async () => {
                                try {
                                  await api.markRepair(workspaceId, {
                                    workspaceId,
                                    assetId: selectedAsset.id,
                                  });
                                  await refresh(workspaceId);
                                  flashSuccess("دارایی به تعمیر رفت");
                                } catch (err: unknown) {
                                  setError(friendlyErrorMessage(err, "خطا"));
                                }
                              })();
                            });
                          }}
                        >
                          ارسال به تعمیر
                        </Button>
                      ) : null}
                      {selectedAsset.status === "in_repair" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            startTransition(() => {
                              void (async () => {
                                try {
                                  await api.resumeActive(workspaceId, {
                                    workspaceId,
                                    assetId: selectedAsset.id,
                                  });
                                  await refresh(workspaceId);
                                  flashSuccess("دارایی فعال شد");
                                } catch (err: unknown) {
                                  setError(friendlyErrorMessage(err, "خطا"));
                                }
                              })();
                            });
                          }}
                        >
                          بازگشت به فعال
                        </Button>
                      ) : null}
                      {selectedAsset.status !== "retired" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            startTransition(() => {
                              void (async () => {
                                try {
                                  await api.retire(workspaceId, {
                                    workspaceId,
                                    assetId: selectedAsset.id,
                                  });
                                  await refresh(workspaceId);
                                  flashSuccess("دارایی از رده خارج شد");
                                } catch (err: unknown) {
                                  setError(friendlyErrorMessage(err, "خطا"));
                                }
                              })();
                            });
                          }}
                        >
                          از رده خارج
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </aside>
              ) : null}
              </div>
            )}
          </SectionCard>

          {depreciationLive ? (
            <SectionCard title="گزارش استهلاک" badge={depRows?.length ?? 0} delayClass="delay3">
              <FormStack>
                <Button
                  type="button"
                  disabled={pending || !workspaceId}
                  onClick={() => {
                    startTransition(() => {
                      void (async () => {
                        try {
                          const rows = await api.depreciationReport(workspaceId);
                          setDepRows(rows);
                          setError(null);
                          flashSuccess("گزارش استهلاک بارگذاری شد");
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "خطا"));
                        }
                      })();
                    });
                  }}
                >
                  بارگذاری گزارش
                </Button>
              </FormStack>
              {depRows == null ? (
                <EmptyHint>برای دیدن ارزش دفتری، گزارش را از API بارگذاری کنید.</EmptyHint>
              ) : depRows.length === 0 ? (
                <EmptyHint>دارایی قابل استهلاک ثبت نشده.</EmptyHint>
              ) : (
                <DataList>
                  {depRows.map((row) => (
                    <DataRow
                      key={row.assetId}
                      title={row.title}
                      meta={
                        row.lastDepreciatedOn
                          ? `آخرین: ${row.lastDepreciatedOn}`
                          : `عمر مفید ${row.usefulLifeMonths} ماه`
                      }
                      trailing={<Amount irrMinor={row.bookValueMinor} />}
                    />
                  ))}
                </DataList>
              )}
            </SectionCard>
          ) : (
            <SectionCard title="گزارش استهلاک" delayClass="delay3">
              <StatusLine>
                استهلاک وقتی providers.assetDepreciation برابر depreciation_v1 باشد فعال
                می‌شود — الان خاموش است؛ ارزش دفتری نمایشی نشان داده نمی‌شود.
              </StatusLine>
            </SectionCard>
          )}
        </ProductGrid>
        ) : null}
      </WorkspacePageFrame>
    </AppShell>
  );
}
