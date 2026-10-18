"use client";

import type { SessionSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";
import { isPlatformConsoleRole } from "@/lib/navigation-v2";
import { useAppChrome } from "@/lib/use-app-chrome";

/**
 * Developer-only identity switcher. Never rendered in production builds and never
 * for ordinary users — only for platform staff while running in development.
 */
export function FinanceDevTools(props: {
  session: SessionSummary | null;
  devSubject: string;
  onDevSubjectChange: (v: string) => void;
  devDisplayName: string;
  onDevDisplayNameChange: (v: string) => void;
  pending: boolean;
  onApply: () => void;
}) {
  const chrome = useAppChrome();
  if (process.env.NODE_ENV === "production") return null;
  if (!isPlatformConsoleRole(chrome.platformRole)) return null;
  return (
    <details className="devtoolsDetails">
      <summary>ابزار توسعه</summary>
      <FormStack>
        <p className="emptyHint" style={{ border: "none", padding: 0 }}>
          تا زمان اتصال ورود یکپارچه، هویت از حافظهٔ مرورگر خوانده می‌شود.
          {props.session?.actor ? (
            <>
              {" "}
              اکنون: {props.session.actor.displayName}
            </>
          ) : null}
        </p>
        <TextField
          label="شناسه ورود"
          value={props.devSubject}
          onChange={(event) => props.onDevSubjectChange(event.target.value)}
        />
        <TextField
          label="نام نمایشی"
          value={props.devDisplayName}
          onChange={(event) => props.onDevDisplayNameChange(event.target.value)}
        />
        <Button type="button" onClick={props.onApply} disabled={props.pending}>
          اعمال هویت و تازه‌سازی
        </Button>
      </FormStack>
    </details>
  );
}
