"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { OutingSummary } from "@dang/contracts";
import { isReadOnlyRole, type MembershipRole } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { EmptyHint, FormStack } from "@/components/ui-blocks";
import { SpaceHomeOutingCard } from "@/components/views/space-home/space-home-outing-card";
import { spaceHomeStyles } from "@/components/views/space-home/space-home-layout";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { newClientId } from "@/lib/id";
import { membershipRoleLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import { useLiveInvalidation } from "@/lib/live-invalidation";

/** Group-only outing list + composer for the unified space home. */
export function GroupOutingHomePanel({
  workspaceId,
  slug,
  myRole,
  onError,
  onSuccess,
}: {
  workspaceId: string;
  slug: string;
  myRole?: MembershipRole | null;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const [outings, setOutings] = useState<OutingSummary[]>([]);
  const [outingTitle, setOutingTitle] = useState("");
  const [outingBudgetToman, setOutingBudgetToman] = useState("");
  const [outingEndsOn, setOutingEndsOn] = useState("");
  const [pending, startTransition] = useTransition();
  const expensesHref = wPath(slug, "expenses");
  const readOnly = isReadOnlyRole(myRole);

  function refresh() {
    void api
      .listOutings(workspaceId)
      .then(setOutings)
      .catch(() => setOutings([]));
  }

  useEffect(() => {
    refresh();
  }, [workspaceId]);

  useLiveInvalidation(["expenses"], () => {
    refresh();
  });

  function onCreateOuting() {
    const title = outingTitle.trim();
    if (!title) {
      onError?.("عنوان گردش را وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const budgetMinor =
            outingBudgetToman.trim() === ""
              ? undefined
              : String(Math.round(Number(outingBudgetToman.replaceAll(",", "")) * 10));
          if (outingBudgetToman.trim() && (!budgetMinor || !/^\d+$/.test(budgetMinor))) {
            onError?.("سقف بودجه تومان نامعتبر است");
            return;
          }
          const created = await api.createOuting(workspaceId, {
            title,
            occurredOn: todayIsoLocal(),
            startsOn: todayIsoLocal(),
            endsOn: outingEndsOn.trim() || undefined,
            budgetCapMinor: budgetMinor,
            idempotencyKey: newClientId(),
          });
          setOutingTitle("");
          setOutingBudgetToman("");
          setOutingEndsOn("");
          onSuccess?.(`گردش «${created.title}» ساخته شد`);
          refresh();
        } catch (err) {
          onError?.(friendlyErrorMessage(err, "ساخت گردش ناموفق"));
        }
      })();
    });
  }

  return (
    <>
      <SpaceHomeOutingCard outings={outings} expensesHref={expensesHref} />
      <details className={spaceHomeStyles.collapsedExtra} id="outing-composer">
        <summary>
          گردش چندخرجی
          {outings.length > 0
            ? ` (${outings.length.toLocaleString("fa-IR")})`
            : ""}
        </summary>
        <div>
          {readOnly ? (
            <EmptyHint>
              نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ساخت گردش فعال نیست.
            </EmptyHint>
          ) : (
            <FormStack density="compact">
              <TextField
                label="عنوان گردش"
                value={outingTitle}
                onChange={(e) => setOutingTitle(e.target.value)}
                hint="مثلاً بیرون‌رفتن جمعه = بستنی + ناهار"
              />
              <TextField
                label="سقف بودجه (تومان، اختیاری)"
                value={outingBudgetToman}
                onChange={(e) => setOutingBudgetToman(e.target.value)}
              />
              <TextField
                label="پایان بازه (YYYY-MM-DD، اختیاری)"
                value={outingEndsOn}
                onChange={(e) => setOutingEndsOn(e.target.value)}
              />
              <Button type="button" onClick={onCreateOuting} disabled={pending}>
                ساخت گردش
              </Button>
              {outings.length > 0 ? (
                <ul>
                  {outings.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`${expensesHref}?outing=${encodeURIComponent(row.id)}#quick-expense`}
                      >
                        {row.title} ({row.expenseIds.length})
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </FormStack>
          )}
        </div>
      </details>
    </>
  );
}
