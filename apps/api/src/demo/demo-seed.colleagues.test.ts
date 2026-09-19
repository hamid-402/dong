import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, GoneException } from "@nestjs/common";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";
import { MemoryBillingStore } from "../billing/memory-billing.store.js";
import { MemoryCatalogStore } from "../catalog/memory-catalog.store.js";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import { MemoryProcurementStore } from "../procurement/procurement.store.js";
import { MemorySocialStore } from "../social/memory-social.store.js";
import {
  COLLEAGUES_PURGE_CONFIRM,
  COLLEAGUES_SEED_CONFIRM,
  DemoSeedService,
} from "./demo-seed.service.js";

function buildService() {
  const iam = new MemoryIamStore();
  const expenses = new MemoryExpenseStore();
  const ledger = new MemoryLedgerStore();
  const procurement = new MemoryProcurementStore();
  const billing = new MemoryBillingStore(expenses);
  const audit = new MemoryAuditStore();
  const catalog = new MemoryCatalogStore();
  const social = new MemorySocialStore();
  const service = new DemoSeedService(
    iam,
    expenses,
    ledger,
    procurement,
    billing,
    audit,
    catalog,
    social,
  );
  return { service, iam, expenses, catalog, social, billing };
}

test("S11-14 colleagues seed creates real workspace catalog expense invoices friendships", async () => {
  const prevAllow = process.env.ALLOW_DEV_AUTH;
  const prevNode = process.env.NODE_ENV;
  process.env.ALLOW_DEV_AUTH = "1";
  process.env.NODE_ENV = "development";
  try {
    const { service, iam, expenses, catalog, social, billing } = buildService();
    const actor = await iam.upsertDevActor({
      externalSubject: "owner-kazemi",
      displayName: "کاظمی",
    });

    await assert.rejects(
      () => service.seedColleagues(actor, { confirm: "WRONG" }),
      BadRequestException,
    );

    const result = await service.seedColleagues(actor, {
      confirm: COLLEAGUES_SEED_CONFIRM,
    });

    assert.equal(result.label, "دمو");
    assert.equal(result.reused, false);
    assert.match(result.workspace.name, /دمو/);
    assert.match(result.workspace.slug, /^demo-colleagues-/);
    assert.equal(result.members.length, 5);
    assert.ok(result.catalogItemIds.noon);
    assert.ok(result.catalogItemIds.cheese);
    assert.ok(result.catalogItemIds.soda);
    assert.ok(result.catalogItemIds.yogurt);
    assert.equal(result.expense.total.amountMinor, "4000000");
    assert.equal(result.expense.paidByUserId, actor.userId);
    assert.equal(result.expense.splitMethod, "itemized");
    assert.ok(result.invoices.length >= 1);
    assert.equal(result.friendshipsCreated, 4);

    const members = await iam.listMembers(result.workspace.id, actor.userId);
    assert.equal((members ?? []).length, 5);

    const catalogPage = await catalog.listItems(
      { ownerKind: "workspace", workspaceId: result.workspace.id },
      { activeOnly: true },
    );
    assert.equal(catalogPage.items.length, 4);
    assert.ok(catalogPage.items.every((i) => i.description === "دمو"));

    const listed = await expenses.listForWorkspace(result.workspace.id, actor.userId);
    assert.ok(listed.some((e) => e.id === result.expense.id));

    const periods = await billing.listPeriods(result.workspace.id, actor.userId);
    assert.equal(periods.length, 1);
    const invoices = await billing.listInvoices(
      result.workspace.id,
      periods[0]!.id,
      actor.userId,
    );
    assert.ok(invoices.length >= 1);

    const friends = await social.listFriendshipsForUser(actor.userId, "accepted");
    assert.equal(friends.length, 4);
    assert.ok(friends.every((f) => f.note === "دمو"));

    const reused = await service.seedColleagues(actor, {
      confirm: COLLEAGUES_SEED_CONFIRM,
    });
    assert.equal(reused.reused, true);
    assert.equal(reused.workspace.id, result.workspace.id);

    const purged = await service.purgeColleagues(actor, {
      confirm: COLLEAGUES_PURGE_CONFIRM,
    });
    assert.equal(purged.label, "دمو");
    assert.ok(purged.purgedWorkspaceIds.includes(result.workspace.id));
    assert.ok(purged.deactivatedCatalogItems >= 4);
    assert.ok(purged.reversedExpenses >= 1);

    const after = await iam.listWorkspacesForUser(actor.userId);
    const purgedWs = after.find((w) => w.id === result.workspace.id);
    assert.ok(purgedWs?.name.includes("پاک‌شده"));
  } finally {
    if (prevAllow === undefined) delete process.env.ALLOW_DEV_AUTH;
    else process.env.ALLOW_DEV_AUTH = prevAllow;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
});

test("S11-14 colleagues seed rejects in production even with confirm", async () => {
  const prevAllow = process.env.ALLOW_DEV_AUTH;
  const prevNode = process.env.NODE_ENV;
  process.env.ALLOW_DEV_AUTH = "1";
  process.env.NODE_ENV = "production";
  try {
    const { service, iam } = buildService();
    const actor = await iam.upsertDevActor({
      externalSubject: "prod-block",
      displayName: "prod",
    });
    await assert.rejects(
      () =>
        service.seedColleagues(actor, { confirm: COLLEAGUES_SEED_CONFIRM }),
      GoneException,
    );
  } finally {
    if (prevAllow === undefined) delete process.env.ALLOW_DEV_AUTH;
    else process.env.ALLOW_DEV_AUTH = prevAllow;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
});
