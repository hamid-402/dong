"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@dang/ui";

/**
 * Shareable public group id (workspace slug) — not the internal UUID.
 * Recipients use /join?id=… or paste the id on the join page.
 */
export function GroupPublicIdCard({
  slug,
  name,
  compact = false,
}: {
  slug: string;
  name?: string;
  compact?: boolean;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const joinPath = `/join/${encodeURIComponent(slug)}`;
  const absoluteJoin =
    typeof window !== "undefined"
      ? `${window.location.origin}${joinPath}`
      : joinPath;

  async function copy(text: string, okMessage: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setHint(okMessage);
    } catch {
      setHint("کپی پشتیبانی نشد — دستی انتخاب کنید");
    }
    window.setTimeout(() => setHint(null), 2800);
  }

  if (compact) {
    return (
      <div className="groupPublicId groupPublicId--compact">
        <span className="groupPublicId__label">شناسه گروه</span>
        <code className="groupPublicId__code" dir="ltr" title={slug}>
          {slug}
        </code>
        <button
          type="button"
          className="textButton"
          onClick={() => void copy(slug, "شناسه کپی شد")}
        >
          کپی
        </button>
        <Link href={joinPath} className="textButton">
          لینک عضویت
        </Link>
        {hint ? <span className="groupPublicId__hint">{hint}</span> : null}
      </div>
    );
  }

  return (
    <section className="groupPublicId" aria-label="شناسه عمومی گروه">
      <header className="groupPublicId__head">
        <h2 className="groupPublicId__title">شناسه گروه</h2>
        <p className="groupPublicId__lead">
          {name ? (
            <>
              «<bdi>{name}</bdi>» ·{" "}
            </>
          ) : null}
          این شناسه را به دوستان بدهید تا با صفحهٔ پیوستن درخواست عضویت بفرستند — لازم نیست
          دعوت بسازید.
        </p>
      </header>
      <div className="groupPublicId__row">
        <code className="groupPublicId__code" dir="ltr">
          {slug}
        </code>
        <div className="groupPublicId__actions">
          <Button type="button" onClick={() => void copy(slug, "شناسه کپی شد")}>
            کپی شناسه
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void copy(absoluteJoin, "لینک عضویت کپی شد")}
          >
            کپی لینک عضویت
          </Button>
          <Link href={joinPath} className="textButton">
            باز کردن صفحهٔ پیوستن
          </Link>
        </div>
      </div>
      {hint ? <p className="groupPublicId__hint">{hint}</p> : null}
    </section>
  );
}
