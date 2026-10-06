"use client";

import Link from "next/link";
import type { SpaceKind } from "@dang/contracts";
import {
  personaHomeActionLabelFa,
  type PersonaHomeActionKind,
  type PersonaHomeSpec,
} from "@dang/contracts";
import { wPath } from "@/lib/workspace-paths";

export type PersonaHomeHrefs = {
  expenses: string;
  settlements: string;
  members: string;
  invite: string;
  addMember: string;
  approvals: string;
  statements: string;
  procurement: string;
  assets: string;
  subunits: string;
  partners: string;
  settings: string;
  overview: string;
  orgFinance: string;
  ledger: string;
  invoices: string;
  expense: string;
};

export function buildPersonaHomeHrefs(slug: string): PersonaHomeHrefs {
  const members = wPath(slug, "members");
  return {
    expense: wPath(slug, "record"),
    expenses: wPath(slug, "expenses"),
    settlements: wPath(slug, "settlements"),
    members,
    invite: `${members}#invite-create-panel`,
    addMember: `${members}#member-add-panel`,
    approvals: wPath(slug, "approvals"),
    statements: wPath(slug, "statements"),
    procurement: wPath(slug, "procurement"),
    assets: wPath(slug, "assets"),
    subunits: wPath(slug, "subunits"),
    partners: wPath(slug, "partners"),
    settings: `${wPath(slug, "settings")}#danger`,
    overview: wPath(slug),
    orgFinance: wPath(slug, "orgFinance"),
    ledger: wPath(slug, "ledger"),
    invoices: wPath(slug, "invoices"),
  };
}

function hrefFor(
  kind: PersonaHomeActionKind,
  hrefs: PersonaHomeHrefs,
): string {
  return hrefs[kind];
}

/**
 * Frame primary + secondary CTAs from personaHomeSpec.
 */
export function PersonaHomeFrameActions({
  spec,
  hrefs,
  spaceKind,
}: {
  spec: PersonaHomeSpec;
  hrefs: PersonaHomeHrefs;
  spaceKind: SpaceKind;
}) {
  const primaryHref = hrefFor(spec.primary, hrefs);
  const primaryLabel = personaHomeActionLabelFa(spec.primary, spaceKind);
  return {
    primaryAction: <Link href={primaryHref}>{primaryLabel}</Link>,
    secondaryActions: (
      <>
        {spec.secondary.map((kind) => (
          <Link key={kind} href={hrefFor(kind, hrefs)}>
            {personaHomeActionLabelFa(kind, spaceKind)}
          </Link>
        ))}
      </>
    ),
  };
}

/**
 * Quiet related-links strip — only persona-allowed destinations.
 */
export function PersonaHomeRelatedLinks({
  spec,
  hrefs,
  spaceKind,
}: {
  spec: PersonaHomeSpec;
  hrefs: PersonaHomeHrefs;
  spaceKind: SpaceKind;
}) {
  if (!spec.panels.relatedLinks || spec.relatedLinkKinds.length === 0) {
    return null;
  }
  return (
    <p className="liveHint" style={{ margin: 0 }}>
      {spec.relatedLinkKinds.map((kind, i) => (
        <span key={kind}>
          {i > 0 ? " · " : null}
          <Link href={hrefFor(kind, hrefs)}>
            {personaHomeActionLabelFa(kind, spaceKind)}
          </Link>
        </span>
      ))}
    </p>
  );
}
