import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { CostCentersController } from "./cost-centers.controller.js";
import { CostCentersService } from "./cost-centers.service.js";
import { COST_CENTER_STORE } from "./cost-centers.types.js";
import { MemoryCostCenterStore } from "./memory-cost-center.store.js";

test("cost center codes are unique per workspace", async () => {
  const store = new MemoryCostCenterStore();
  const created = await store.create("ws-a", "owner", {
    name: "پروژه شمال",
    code: "NORTH",
  });
  assert.equal(created.active, true);
  assert.equal((await store.list("ws-a", "owner")).length, 1);
  assert.equal((await store.list("ws-b", "owner")).length, 0);

  await assert.rejects(
    () =>
      store.create("ws-a", "owner", {
        name: "تکراری",
        code: "NORTH",
      }),
    (error: unknown) =>
      error instanceof Error && error.message === "COST_CENTER_CODE_EXISTS",
  );

  await store.create("ws-b", "owner", {
    name: "همان کد در فضای دیگر",
    code: "NORTH",
  });
});

test("cost center controller and service declare every runtime injection explicitly", () => {
  const controllerDeps = Reflect.getMetadata(
    "self:paramtypes",
    CostCentersController,
  ) as Array<{ index: number; param: unknown }> | undefined;
  const serviceDeps = Reflect.getMetadata(
    "self:paramtypes",
    CostCentersService,
  ) as Array<{ index: number; param: unknown }> | undefined;

  assert.deepEqual(controllerDeps, [{ index: 0, param: CostCentersService }]);
  assert.deepEqual(serviceDeps?.slice().sort((a, b) => a.index - b.index), [
    { index: 0, param: COST_CENTER_STORE },
    { index: 1, param: WorkspaceAccessService },
  ]);
});
