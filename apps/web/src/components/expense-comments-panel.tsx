"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { CommentSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useLiveInvalidation } from "@/lib/live-invalidation";

export function ExpenseCommentsPanel({
  workspaceId,
  expenseId,
  readOnly = false,
}: {
  workspaceId: string;
  expenseId: string;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<CommentSummary[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    return api
      .listComments(workspaceId, "expense", expenseId)
      .then(setItems)
      .catch((err: unknown) =>
        setError(friendlyErrorMessage(err, "بارگذاری نظرات ناموفق")),
      );
  }, [workspaceId, expenseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useLiveInvalidation([`comments:expense:${expenseId}`], () => {
    void reload();
  });

  function onSubmit() {
    const text = body.trim();
    if (!text) return;
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          await api.createComment(workspaceId, {
            workspaceId,
            targetType: "expense",
            targetId: expenseId,
            body: text,
          });
          setBody("");
          await reload();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت نظر ناموفق"));
        }
      })();
    });
  }

  return (
    <div className="expenseComments">
      <h4>نظرات</h4>
      {items.length === 0 ? <p className="emptyHint">هنوز نظری نیست.</p> : null}
      <ul className="expenseComments__list">
        {items.map((c) => (
          <li key={c.id}>
            <span className="emptyHint">{c.createdAt.slice(0, 16)}</span>
            <p>{c.body}</p>
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <>
          <TextField
            label="نظر جدید"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="button" disabled={pending || !body.trim()} onClick={onSubmit}>
            ارسال
          </Button>
        </>
      ) : null}
      {error ? <p className="liveError">{error}</p> : null}
    </div>
  );
}
