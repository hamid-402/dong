"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@dang/ui";
import { EmptyStateBlock } from "@/components/ui-blocks";

type Props = {
  code: "404" | "403" | "error";
  title: string;
  description: string;
  action?: ReactNode;
  detail?: string | null;
  reset?: () => void;
};

/**
 * Shared RTL product chrome for App Router error / not-found / forbidden.
 * No fake health badges — only copy + real navigation.
 */
export function RouteErrorState({
  code,
  title,
  description,
  action,
  detail,
  reset,
}: Props) {
  return (
    <main id="main" className="routeErrorState" data-error-code={code}>
      <p className="routeErrorState__code" aria-hidden>
        {code}
      </p>
      <EmptyStateBlock
        title={title}
        sticker={code === "403" ? "lock" : code === "404" ? "compass" : "shield"}
        description={
          <>
            <span>{description}</span>
            {detail ? (
              <>
                <br />
                <span className="routeErrorState__detail">شناسه: {detail}</span>
              </>
            ) : null}
          </>
        }
        action={
          <div className="routeErrorState__actions">
            {action ?? (
              <Link href="/spaces" className="routeErrorState__link">
                بازگشت به فضاها
              </Link>
            )}
            {reset ? (
              <Button type="button" variant="ghost" onClick={reset}>
                تلاش دوباره
              </Button>
            ) : null}
          </div>
        }
      />
    </main>
  );
}
