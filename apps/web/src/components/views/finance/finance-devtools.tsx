"use client";

import type { SessionSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";

export function FinanceDevTools(props: {
  session: SessionSummary | null;
  devSubject: string;
  onDevSubjectChange: (v: string) => void;
  devDisplayName: string;
  onDevDisplayNameChange: (v: string) => void;
  pending: boolean;
  onApply: () => void;
}) {
  return (
    <details className="devtoolsDetails">
      <summary>تنظیمات توسعه‌دهنده</summary>
      <FormStack>
        <p className="emptyHint" style={{ border: "none", padding: 0 }}>
          تا OIDC، هویت از localStorage می‌آید.
          {props.session?.actor ? (
            <>
              {" "}
              الان: {props.session.actor.displayName} ({props.session.mode})
            </>
          ) : null}
        </p>
        <TextField
          label="Subject"
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
