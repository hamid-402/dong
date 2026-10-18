"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import {
  SplitComposer,
  emptySplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import { FormStack } from "@/components/ui-blocks";
import { PersonalSpacesAccordion } from "@/components/shell/personal-spaces-accordion";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { newClientId } from "@/lib/id";
import { useAppChrome } from "@/lib/use-app-chrome";

const UNIT_LABEL = "تومان";

/** Kind-only personal home blocks: quick private expense + other spaces. */
export function PersonalHomeExtras({
  workspaceId,
  onPosted,
  onError,
  onSuccess,
}: {
  workspaceId: string;
  onPosted?: () => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}) {
  const chrome = useAppChrome();
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [title, setTitle] = useState("");
  const [toman, setToman] = useState("");
  const [split, setSplit] = useState<SplitComposerValue>(emptySplitComposer("private"));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const actorId = chrome.actor?.userId;
        const [memberList, cats, me] = await Promise.all([
          api.listMembers(workspaceId),
          api.listCategories(workspaceId).catch(() => []),
          actorId ? Promise.resolve(null) : api.me(),
        ]);
        if (cancelled) return;
        const userId = actorId ?? me!.actor.userId;
        setMembers(memberList);
        setCategories(cats);
        setCurrentUserId(userId);
        setSplit((prev) => ({
          ...prev,
          visibility: "private",
          participantUserIds: [userId],
        }));
      } catch (err) {
        if (!cancelled) {
          onError?.(friendlyErrorMessage(err, "بارگذاری فرم خرج شخصی ناموفق"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, chrome.actor?.userId, onError]);

  function onCreateExpense() {
    const name = title.trim();
    const total = tomanInputToIrrMinor(toman);
    if (!name) {
      onError?.("عنوان لازم است");
      return;
    }
    if (!total) {
      onError?.("مبلغ نامعتبر است (فقط تومان)");
      return;
    }
    if (!currentUserId) {
      onError?.("شناسه کاربر آماده نیست");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createExpenseDraft(workspaceId, {
            workspaceId,
            title: name,
            total,
            paidByUserId: currentUserId,
            splitMethod: "equal",
            participantUserIds: [currentUserId],
            splitLines: undefined,
            occurredOn: todayIsoLocal(),
            visibility: "private",
            categoryId: categoryId || undefined,
            idempotencyKey: newClientId(),
          });
          await api.submitExpense(workspaceId, created.id);
          await api.postExpense(workspaceId, created.id);
          setTitle("");
          setToman("");
          onSuccess?.("خرج شخصی ثبت و در دفتر اعمال شد");
          onPosted?.();
        } catch (err) {
          onError?.(friendlyErrorMessage(err, "ثبت خرج ناموفق"));
        }
      })();
    });
  }

  return (
    <>
      <section id="personal-expense" aria-labelledby="personal-quick-expense">
        <h2 id="personal-quick-expense" style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
          ثبت سریع خرج
        </h2>
        <FormStack>
          <TextField
            label="عنوان"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label={`مبلغ (${UNIT_LABEL})`}
            value={toman}
            onChange={(e) => setToman(e.target.value)}
          />
          {categories.length > 0 ? (
            <label className="field">
              <span>دسته</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">بدون دسته</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <SplitComposer
            members={members}
            totalToman={toman}
            value={split}
            onChange={setSplit}
            personalOnly
            currentUserId={currentUserId}
          />
          <Button type="button" onClick={onCreateExpense} disabled={pending}>
            ثبت خرج خصوصی
          </Button>
        </FormStack>
      </section>
      <div id="spaces">
        <PersonalSpacesAccordion focus="share" hidePersonal />
      </div>
    </>
  );
}
