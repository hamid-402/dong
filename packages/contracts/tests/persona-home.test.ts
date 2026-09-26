import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  personaHomeActionLabelFa,
  personaHomeSpec,
} from "../src/persona-home.js";

describe("persona-home — role × spaceKind chrome", () => {
  it("returns null for empty role or personal", () => {
    assert.equal(personaHomeSpec(null, "group"), null);
    assert.equal(personaHomeSpec("owner", "personal"), null);
  });

  it("guest home is compact and non-mutating", () => {
    const s = personaHomeSpec("guest", "group");
    assert.ok(s);
    assert.equal(s.canAddExpense, false);
    assert.equal(s.showInviteLink, false);
    assert.equal(s.panels.outingComposer, false);
    assert.equal(s.panels.setupChecklist, false);
    assert.deepEqual(s.secondary, ["settlements", "members", "settings"]);
  });

  it("approver prioritizes approvals when flag on", () => {
    const s = personaHomeSpec("approver", "org", { approvalQueue: true });
    assert.ok(s);
    assert.equal(s.primary, "approvals");
    assert.equal(s.panels.approvalsCard, true);
    assert.equal(s.panels.claimsCard, true);
    assert.equal(s.canAddExpense, false);
  });

  it("buyer prioritizes procurement when module on", () => {
    const s = personaHomeSpec("buyer", "building", {
      procurement: true,
      partners: true,
    });
    assert.ok(s);
    assert.equal(s.primary, "procurement");
    assert.ok(s.relatedLinkKinds.includes("partners"));
  });

  it("finance can add member but not invite link", () => {
    const s = personaHomeSpec("finance", "group", { approvalQueue: true });
    assert.ok(s);
    assert.equal(s.showAddMember, true);
    assert.equal(s.showInviteLink, false);
    assert.equal(s.primary, "approvals");
    assert.ok(s.titleFa.includes("مادرخرج") || s.titleFa.includes("هاب"));
  });

  it("owner gets invite primary and full panels", () => {
    const s = personaHomeSpec("admin", "org", {
      approvalQueue: true,
      orgFinanceLive: true,
    });
    assert.ok(s);
    assert.equal(s.persona, "owner");
    assert.equal(s.primary, "invite");
    assert.equal(s.showInviteLink, true);
    assert.equal(s.panels.companyExpenses, true);
    assert.ok(s.relatedLinkKinds.includes("orgFinance"));
  });

  it("member group keeps expense primary", () => {
    const s = personaHomeSpec("member", "group");
    assert.ok(s);
    assert.equal(s.primary, "expense");
    assert.equal(s.panels.balanceHero, true);
    assert.equal(s.panels.approvalsCard, false);
  });

  it("labels adapt for building subunits", () => {
    assert.equal(personaHomeActionLabelFa("subunits", "building"), "واحدها");
    assert.equal(personaHomeActionLabelFa("subunits", "org"), "بخش‌ها");
    assert.equal(personaHomeActionLabelFa("expenses", "building"), "شارژ و قبوض");
  });
});
