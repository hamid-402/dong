import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { ReportsController } from "./reports.controller.js";

const actor: AuthActor = {
  userId: "member-1",
  externalSubject: "member-1",
  displayName: "Member",
  authMode: "dev",
};

test("category parent must belong to the same workspace", async () => {
  let createCalled = false;
  const controller = new ReportsController(
    {
      listCategories: async () => [
        {
          id: "local-parent",
          workspaceId: "workspace-1",
          name: "محلی",
          slug: "local",
          createdAt: "2026-09-07T12:00:00.000Z",
        },
      ],
      createCategory: async () => {
        createCalled = true;
      },
    } as never,
    {
      listMembers: async () => [{ userId: actor.userId, role: "member" }],
    } as never,
    {} as never,
  );

  await assert.rejects(
    controller.createCategory(actor, "workspace-1", {
      name: "فرزند",
      parentId: "foreign-parent",
    }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.getResponse() !== null,
  );
  assert.equal(createCalled, false);
});

test("category accepts an existing parent from the workspace", async () => {
  const controller = new ReportsController(
    {
      listCategories: async () => [
        {
          id: "local-parent",
          workspaceId: "workspace-1",
          name: "محلی",
          slug: "local",
          createdAt: "2026-09-07T12:00:00.000Z",
        },
      ],
      createCategory: async (
        workspaceId: string,
        _actorUserId: string,
        input: { name: string; parentId?: string },
      ) => ({
        id: "child-1",
        workspaceId,
        name: input.name,
        slug: "child",
        parentId: input.parentId,
        createdAt: "2026-09-07T12:01:00.000Z",
      }),
    } as never,
    {
      listMembers: async () => [{ userId: actor.userId, role: "member" }],
    } as never,
    {} as never,
  );

  const created = await controller.createCategory(actor, "workspace-1", {
    name: "فرزند",
    parentId: "local-parent",
  });

  assert.equal(created.parentId, "local-parent");
});
