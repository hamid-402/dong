"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { AssetSummary, MembershipSummary } from "@dang/contracts";
import { isReadOnlyRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { assetStatusLabel, deliveryStatusLabel, membershipRoleLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
import styles from "./assets-view.module.css";

function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "gold" {
  if (status === "active" || status === "in_use") return "ok";
  if (status === "maintenance" || status === "reserved") return "warn";
  if (status === "retired" || status === "lost") return "danger";
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
  const activeAssets = assets.filter((asset) => asset.status === "active");
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
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}
      {workspaceId && workspace ? (
        <OperationsModuleHeader
          ariaLabel="عملیات تجهیزات"
          destinations={[
            { key: "procurement", label: "تدارکات", href: wPath(workspace.slug, "procurement"), active: false },
            { key: "proposals", label: "پیشنهاد و رأی", href: wPath(workspace.slug, "proposals"), active: false },
            { key: "assets", label: "تجهیزات", href: wPath(workspace.slug, "assets"), active: true },
            { key: "members", label: "اعضا", href: wPath(workspace.slug, "members"), active: false },
          ]}
          metrics={[
            { label: "کل دارایی", value: String(assets.length), detail: "ثبت‌شده در API" },
            { label: "فعال یا در استفاده", value: String(activeAssets.length), detail: "قابل بهره‌برداری", tone: "positive" },
            { label: "نیازمند رسیدگی", value: String(assets.filter((asset) => asset.status === "damaged").length), detail: "دارایی آسیب‌دیده", tone: assets.some((asset) => asset.status === "damaged") ? "attention" : "positive" },
            { label: "تحویل قابل تبدیل", value: String(deliveries.length), detail: `${members.length} عضو` },
          ]}
          roleLabel={myRole ? membershipRoleLabel(myRole) : null}
          persistenceLabel={chrome.persistenceLabel}
          pending={pending || loading}
          onRefresh={() => {
            setLoading(true);
            void refresh(workspaceId)
              .catch((reason: unknown) => setError(friendlyErrorMessage(reason, "تازه‌سازی دارایی‌ها ناموفق")))
              .finally(() => setLoading(false));
          }}
        />
      ) : null}

      {loading ? (
        <EmptyHint loading>در حال بارگذاری تجهیزات…</EmptyHint>
      ) : null}
      {!loading && !workspaceId ? (
        <EmptyHint>
          ابتدا فضای کاری بسازید — <Link href={hubPathFor("/onboarding")}>ساخت فضای کاری</Link>
        </EmptyHint>
      ) : null}
      {!loading && workspaceId ? (
        <ProductGrid>
          {readOnly ? (
            <StatusLine>
              نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ثبت دارایی فعال نیست.
            </StatusLine>
          ) : (
          <SectionCard title="ثبت دارایی از تحویل" delayClass="delay1">
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
                  <span>ASSET INSPECTOR</span>
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
                    <div><dt>تاریخ ثبت</dt><dd>{new Date(selectedAsset.createdAt).toLocaleDateString("fa-IR")}</dd></div>
                  </dl>
                  {selectedAsset.acquisitionCost ? (
                    <p>بهای تحصیل <Amount irrMinor={selectedAsset.acquisitionCost.amountMinor} /></p>
                  ) : null}
                </aside>
              ) : null}
              </div>
            )}
          </SectionCard>
        </ProductGrid>
      ) : null}
    </AppShell>
  );
}
