import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AccessGrant, AuthActor } from "@dang/contracts";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { PermissionsService } from "./permissions.service.js";

const grantsBodySchema = z
  .object({
    grants: z.array(
      z
        .object({
          action: z.string().min(1).max(120),
          effect: z.enum(["allow", "deny"]),
        })
        .strict(),
    ),
  })
  .strict();

const dryRunBodySchema = z
  .object({
    userId: z.string().uuid(),
    action: z.string().min(1).max(120),
    amountMinor: z.string().regex(/^\d+$/).optional(),
  })
  .strict();

const deputyBodySchema = z
  .object({
    userId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().max(500).default(""),
    approvalCapMinor: z.string().regex(/^\d+$/).optional(),
  })
  .strict();

@ApiTags("permissions")
@Controller("workspaces/:workspaceId")
@UseGuards(AuthGuard)
export class PermissionsController {
  constructor(@Inject(PermissionsService) private readonly permissions: PermissionsService) {}

  @Get("permissions")
  getAll(@Param("workspaceId") workspaceId: string, @CurrentActor() actor: AuthActor) {
    return this.permissions.getWorkspacePermissions(workspaceId, actor);
  }

  @Get("policy-audit")
  @ApiTags("policy-audit")
  @ApiOperation({
    summary: "Export active built-in ABAC Policy DSL entries for the actor role",
  })
  policyAudit(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.getPolicyAudit(workspaceId, actor);
  }

  @Put("permissions/roles/:role")
  putRole(
    @Param("workspaceId") workspaceId: string,
    @Param("role") role: string,
    @Body(new ZodValidationPipe(grantsBodySchema)) body: { grants: AccessGrant[] },
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.putRoleGrants(workspaceId, role, body.grants, actor);
  }

  @Put("permissions/members/:userId")
  putMember(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(grantsBodySchema)) body: { grants: AccessGrant[] },
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.putMemberOverrides(workspaceId, userId, body.grants, actor);
  }

  @Post("permissions/dry-run")
  @ApiOperation({ summary: "Evaluate access for user+action without mutating state" })
  dryRun(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(dryRunBodySchema))
    body: { userId: string; action: string; amountMinor?: string },
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.dryRun(workspaceId, actor, body);
  }

  @Get("permissions/effective/:userId")
  effective(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.effectiveForUser(workspaceId, userId, actor);
  }

  @Get("deputy-windows")
  listWindows(@Param("workspaceId") workspaceId: string, @CurrentActor() actor: AuthActor) {
    return this.permissions.listDeputyWindows(workspaceId, actor);
  }

  @Post("deputy-windows")
  createWindow(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(deputyBodySchema))
    body: {
      userId: string;
      startsAt: string;
      endsAt: string;
      reason: string;
      approvalCapMinor?: string;
    },
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.createDeputyWindow(workspaceId, body, actor);
  }

  @Post("deputy-windows/:windowId/revoke")
  revokeWindow(
    @Param("workspaceId") workspaceId: string,
    @Param("windowId") windowId: string,
    @CurrentActor() actor: AuthActor,
  ) {
    return this.permissions.revokeDeputyWindow(workspaceId, windowId, actor);
  }
}
