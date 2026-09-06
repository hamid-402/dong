"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { AssetSummary, MembershipSummary } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { assetStatusLabel, deliveryStatusLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";

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

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="چرخه تجهیزات"
        title="دارایی‌ها"
        description="تبدیل تحویل خرید به دارایی، واگذاری و وضعیت نگهداری."
        actions={
          <>
            <Link href={hubPathFor("/workspaces/procurement")}>خرید</Link>
            <Link href={hubPathFor("/workspaces")}>مالی</Link>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

      {loading ? (
        <EmptyHint>در حال بارگذاری تجهیزات…</EmptyHint>
      ) : null}
      {!loading && !workspaceId ? (
        <EmptyHint>
          ابتدا فضای کاری بسازید — <Link href={hubPathFor("/onboarding")}>ساخت فضای کاری</Link>
        </EmptyHint>
      ) : null}
      {!loading && workspaceId ? (
        <ProductGrid>
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
                          idempotencyKey: crypto.randomUUID(),
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

          <SectionCard title="فهرست دارایی‌ها" badge={assets.length} delayClass="delay2">
            {assets.length === 0 ? (
              <EmptyHint>دارایی ثبت نشده.</EmptyHint>
            ) : (
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
                  />
                ))}
              </DataList>
            )}
          </SectionCard>
        </ProductGrid>
      ) : null}
    </AppShell>
  );
}
