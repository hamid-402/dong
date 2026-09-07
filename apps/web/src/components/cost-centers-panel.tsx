"use client";

import { useEffect, useState, useTransition } from "react";
import type { CostCenterSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";

export function CostCentersPanel({
  workspaceId,
  readOnly = false,
}: {
  workspaceId: string;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<CostCenterSummary[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    setRows(await api.listCostCenters(workspaceId));
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(friendlyErrorMessage(reason, "بارگذاری مراکز هزینه ناموفق")),
    );
  }, [workspaceId]);

  function create() {
    if (!name.trim() || !code.trim()) {
      setError("نام و کد مرکز هزینه لازم است");
      return;
    }
    startTransition(() => {
      void api
        .createCostCenter(workspaceId, {
          name: name.trim(),
          code: code.trim(),
        })
        .then(async () => {
          setName("");
          setCode("");
          await refresh();
          setError(null);
        })
        .catch((reason: unknown) =>
          setError(friendlyErrorMessage(reason, "ساخت مرکز هزینه ناموفق")),
        );
    });
  }

  return (
    <SectionCard title="مراکز هزینه" badge={rows.length} delayClass="delay3">
      {error ? <p className="liveError">{error}</p> : null}
      {readOnly ? (
        <EmptyHint>نقش شما فقط مشاهده دارد — ساخت مرکز هزینه فعال نیست.</EmptyHint>
      ) : (
        <FormStack density="compact">
          <TextField
            label="نام مرکز"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="کد"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button type="button" onClick={create} disabled={pending}>
            ساخت مرکز هزینه
          </Button>
        </FormStack>
      )}
      {rows.length === 0 ? (
        <EmptyHint>مرکز هزینه‌ای ثبت نشده.</EmptyHint>
      ) : (
        <DataList>
          {rows.map((row) => (
            <DataRow
              key={row.id}
              title={row.name}
              meta={`${row.code} · ${row.active ? "فعال" : "غیرفعال"}`}
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
