"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { WorkspaceSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { GroupEmailVerificationNotice } from "@/components/group-email-verification-notice";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { FormStack } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { createWorkspaceWithUniqueSlug, type GroupSlugTemplate } from "@/lib/group-slug";
import { newClientId } from "@/lib/id";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

export function GroupCreatedNext({ workspace }: { workspace: WorkspaceSummary }) {
  const inviteHref = `${wPath(workspace.slug, "members")}#invite-create-panel`;
  return (
    <section className="flowNext" aria-label="گروه ساخته شد">
      <p className="flowSentence" role="status">
        گروه «{workspace.name}» ساخته شد. شناسهٔ عمومی را برای دعوت بفرستید.
      </p>
      <GroupPublicIdCard slug={workspace.slug} name={workspace.name} />
      <Link className="dang-btn dang-btn--primary dang-btn--md" href={inviteHref}>
        دعوت
      </Link>
    </section>
  );
}

/**
 * Name first. The public id is minted on the server path and shown only after create.
 */
export function CreateGroupForm({
  onCreated,
  showNotice = true,
}: {
  onCreated: (workspace: WorkspaceSummary) => void;
  showNotice?: boolean;
}) {
  const chrome = useAppChrome();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [template, setTemplate] = useState<GroupSlugTemplate>("friends_family");
  const [shares, setShares] = useState("1");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("نام گروه را وارد کنید");
      document.getElementById("create-group-name")?.focus();
      return;
    }
    setNameError(null);
    setFormError(null);
    const ownerDefaultShares = Math.max(1, Math.min(100, Number(shares) || 1));
    setPending(true);
    try {
      const created = await createWorkspaceWithUniqueSlug(
        { name: trimmed, template, ownerDefaultShares },
        (body) => api.createWorkspace(body, newClientId()),
      );
      chrome.selectWorkspace(created.id);
      chrome.refreshChrome();
      onCreated(created);
    } catch (err: unknown) {
      setFormError(friendlyErrorMessage(err, "ساخت گروه ناموفق"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="create-group" noValidate onSubmit={(event) => void onSubmit(event)}>
      {showNotice ? <GroupEmailVerificationNotice active /> : null}
      <FormStack>
        <TextField
          id="create-group-name"
          label="نام گروه"
          value={name}
          onChange={(event) => {
            setNameError(null);
            setName(event.target.value);
          }}
          placeholder="مثلاً سفر شمال"
          hint="شناسهٔ عمومی بعد از ساخت نشان داده می‌شود"
          error={nameError ?? undefined}
          required
        />
        <details className="reportDetails">
          <summary>نوع گروه</summary>
          <div className="reportDetails__body">
            <label className="dang-field">
              <span className="dang-label">نوع</span>
              <select
                className="dang-control"
                value={template}
                onChange={(event) => setTemplate(event.target.value as GroupSlugTemplate)}
              >
                <option value="friends_family">دوستان</option>
                <option value="household">خانواده</option>
              </select>
            </label>
            <TextField
              label="سهم پیش‌فرض شما"
              value={shares}
              onChange={(event) => setShares(event.target.value)}
              hint="مثلاً ۲ برای والدین — بعداً برای اعضا قابل ویرایش است"
            />
          </div>
        </details>
        {formError ? (
          <p className="dang-field__error" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "در حال ساخت…" : "ساخت گروه"}
        </Button>
      </FormStack>
    </form>
  );
}
