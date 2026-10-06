import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateWorkspaceRequest,
  LeaveWorkspaceRequest,
  MembershipRole,
  MembershipSummary,
  SoftDeleteWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceDirectoryResponse,
  WorkspaceJoinPreview,
  WorkspaceSummary,
} from "@dang/contracts";
import {
  DIRECTORY_METRICS_WORKSPACE_CAP,
  readProductFeatureFlags,
  spaceKindForTemplate,
  spaceKindOffered,
  toDirectoryEntry,
  workspaceTemplateCatalog,
} from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import {
  SETTLEMENT_STORE,
  type SettlementStore,
} from "../settlements/settlement.types.js";
import { enrichDirectoryEntriesWithMetrics } from "./directory-metrics.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEMPLATE_IDS = new Set(workspaceTemplateCatalog.map((item) => item.id));

function problem(
  status: number,
  code: string,
  title: string,
  detail?: string,
): Record<string, unknown> {
  return {
    type: `https://dang.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    detail,
    code,
  };
}

function mapLifecycleError(error: unknown): never {
  if (!(error instanceof Error)) throw error;
  switch (error.message) {
    case "OWNER_MUST_TRANSFER":
      throw new ConflictException(
        problem(
          409,
          "OWNER_MUST_TRANSFER",
          "Owner must transfer ownership before leaving",
          "مالک باید اول مالکیت را منتقل کند، بعد می‌تواند خارج شود.",
        ),
      );
    case "PERSONAL_WORKSPACE_PROTECTED":
      throw new ForbiddenException(
        problem(
          403,
          "PERSONAL_WORKSPACE_PROTECTED",
          "Personal workspace cannot be left, archived, or deleted",
          "دفتر شخصی قابل ترک، بایگانی یا حذف نیست.",
        ),
      );
    case "WORKSPACE_LIFECYCLE_FORBIDDEN":
      throw new ForbiddenException(
        problem(
          403,
          "WORKSPACE_LIFECYCLE_FORBIDDEN",
          "Only the owner can archive or delete this workspace",
          "فقط مالک می‌تواند فضا را بایگانی یا حذف کند.",
        ),
      );
    case "WORKSPACE_ARCHIVED":
      throw new ConflictException(
        problem(
          409,
          "WORKSPACE_ARCHIVED",
          "Workspace is archived",
          "این فضا بایگانی شده — اول بازگردانی کنید.",
        ),
      );
    case "WORKSPACE_SLUG_MISMATCH":
      throw new BadRequestException(
        problem(
          400,
          "WORKSPACE_SLUG_MISMATCH",
          "Confirm slug does not match",
          "شناسهٔ تأیید با شناسهٔ فضا یکی نیست.",
        ),
      );
    case "LAST_FINANCE_MANAGER":
      throw new ConflictException(
        problem(
          409,
          "LAST_FINANCE_MANAGER",
          "Cannot remove last finance manager",
          "آخرین مدیر مالی نمی‌تواند خارج شود — اول نقش را منتقل کنید.",
        ),
      );
    case "MEMBER_NOT_FOUND":
      throw new NotFoundException(
        problem(404, "MEMBER_NOT_FOUND", "Membership not found"),
      );
    case "WORKSPACE_NOT_FOUND":
      throw new NotFoundException(
        problem(404, "WORKSPACE_NOT_FOUND", "Workspace not found"),
      );
    default:
      throw error;
  }
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
  ) {}

  async create(actor: AuthActor, body: CreateWorkspaceRequest): Promise<WorkspaceSummary> {
    const name = body.name?.trim() ?? "";
    const slug = body.slug?.trim().toLowerCase() ?? "";
    const template = body.template;

    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid workspace name",
        status: 400,
        detail: "Name must be between 2 and 80 characters.",
      });
    }
    if (!SLUG_PATTERN.test(slug) || slug.length > 48) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid workspace slug",
        status: 400,
        detail: "Slug must be lowercase kebab-case, max 48 characters.",
      });
    }
    if (!TEMPLATE_IDS.has(template)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid workspace template",
        status: 400,
      });
    }
    if (
      !spaceKindOffered(
        spaceKindForTemplate(template),
        readProductFeatureFlags(process.env),
      )
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/space-kind-disabled",
        title: "Space kind is not enabled",
        status: 403,
        detail:
          spaceKindForTemplate(template) === "building"
            ? "ENABLE_BUILDING_SPACES is off."
            : "ENABLE_ORG_SPACES is off.",
      });
    }

    try {
      const workspace = await this.iam.createWorkspace({
        actorUserId: actor.userId,
        name,
        slug,
        template,
      });
      if (
        body.ownerDefaultShares != null &&
        body.ownerDefaultShares >= 1 &&
        body.ownerDefaultShares <= 100
      ) {
        await this.iam.setMemberDefaultShares(
          workspace.id,
          actor.userId,
          actor.userId,
          body.ownerDefaultShares,
        );
      }
      await this.audit.append({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        action: "workspace.create",
        targetType: "workspace",
        targetId: workspace.id,
        result: "success",
        metadata: {
          slug: workspace.slug,
          template: workspace.template,
          ownerDefaultShares: body.ownerDefaultShares ?? null,
        },
      });
      return workspace;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "WORKSPACE_SLUG_TAKEN") {
        throw new ConflictException({
          type: "https://dang.local/problems/conflict",
          title: "Workspace slug already exists",
          status: 409,
        });
      }
      throw error;
    }
  }

  listForActor(actor: AuthActor): Promise<WorkspaceSummary[]> {
    return this.iam.listWorkspacesForUser(actor.userId);
  }

  /**
   * Lightweight directory for switcher / finder — one round-trip with myRole.
   * Metrics only when `includeMetrics` and membership count ≤ cap (no fake zeros).
   */
  async directoryForActor(
    actor: AuthActor,
    options: { includeMetrics?: boolean } = {},
  ): Promise<WorkspaceDirectoryResponse> {
    const workspaces = await this.iam.listWorkspacesForUser(actor.userId);
    let entries = workspaces
      .filter((ws): ws is WorkspaceSummary & { myRole: MembershipRole } =>
        Boolean(ws.myRole),
      )
      .map((ws) => toDirectoryEntry(ws))
      .sort((a, b) => {
        if (a.spaceKind !== b.spaceKind) {
          const order = ["personal", "group", "building", "org"] as const;
          return order.indexOf(a.spaceKind) - order.indexOf(b.spaceKind);
        }
        return a.name.localeCompare(b.name, "fa");
      });

    const includeMetrics = Boolean(options.includeMetrics);
    if (!includeMetrics) {
      return {
        generatedAt: new Date().toISOString(),
        entries,
        metricsIncluded: false,
        metricsOmittedReason: "not_requested",
      };
    }

    if (entries.length > DIRECTORY_METRICS_WORKSPACE_CAP) {
      return {
        generatedAt: new Date().toISOString(),
        entries,
        metricsIncluded: false,
        metricsOmittedReason: "too_many_workspaces",
      };
    }

    const enriched = await enrichDirectoryEntriesWithMetrics({
      entries,
      actorUserId: actor.userId,
      ledger: this.ledger,
      settlements: this.settlements,
    });
    entries = enriched.entries;
    const allOk = enriched.enrichedCount === entries.length;
    return {
      generatedAt: new Date().toISOString(),
      entries,
      metricsIncluded: enriched.enrichedCount > 0,
      metricsOmittedReason: allOk ? undefined : "partial_failures",
    };
  }

  async previewBySlug(slugRaw: string): Promise<WorkspaceJoinPreview> {
    const slug = slugRaw.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || slug.length > 48) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "شناسه گروه نامعتبر است",
        status: 400,
        detail: "شناسه باید حروف انگلیسی کوچک و خط تیره باشد (مثل friends-trip).",
        code: "INVALID_GROUP_ID",
      });
    }
    const workspace = await this.iam.getWorkspaceBySlug(slug);
    if (!workspace) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "گروهی با این شناسه پیدا نشد",
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
      });
    }
    return {
      slug: workspace.slug,
      name: workspace.name,
      template: workspace.template,
      spaceKind: spaceKindForTemplate(workspace.template),
    };
  }

  async getForActor(actor: AuthActor, workspaceId: string): Promise<WorkspaceSummary> {
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!workspace) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Workspace not found",
        status: 404,
      });
    }
    return workspace;
  }

  async updateProfile(
    actor: AuthActor,
    workspaceId: string,
    body: UpdateWorkspaceRequest,
  ): Promise<WorkspaceSummary> {
    const current = await this.getForActor(actor, workspaceId);
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    const role = members?.find((member) => member.userId === actor.userId)?.role;
    if (role !== "owner" && role !== "admin") {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Workspace settings require owner or admin",
        status: 403,
      });
    }

    const name = body.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid workspace name",
        status: 400,
      });
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format();
    } catch {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid workspace timezone",
        status: 400,
      });
    }

    try {
      const updated = await this.iam.updateWorkspaceProfile({
        workspaceId,
        actorUserId: actor.userId,
        name,
        timezone: body.timezone,
        displayUnit: body.displayUnit,
      });
      if (!updated) {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "Workspace not found",
          status: 404,
        });
      }
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.profile.update",
        targetType: "workspace",
        targetId: workspaceId,
        result: "success",
        metadata: {
          nameChanged: current.name !== updated.name,
          timezoneChanged: current.timezone !== updated.timezone,
          displayUnitChanged: current.displayUnit !== updated.displayUnit,
        },
      });
      return updated;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "WORKSPACE_UPDATE_FORBIDDEN") {
        throw new ForbiddenException({
          type: "https://dang.local/problems/forbidden",
          title: "Workspace settings require owner or admin",
          status: 403,
        });
      }
      if (error instanceof Error && error.message === "WORKSPACE_ARCHIVED") {
        mapLifecycleError(error);
      }
      throw error;
    }
  }

  async listMembers(actor: AuthActor, workspaceId: string): Promise<MembershipSummary[]> {
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    return members;
  }

  async leave(
    actor: AuthActor,
    workspaceId: string,
    body: LeaveWorkspaceRequest = {},
  ): Promise<MembershipSummary> {
    await this.getForActor(actor, workspaceId);
    try {
      const left = await this.iam.leaveMembership({
        workspaceId,
        userId: actor.userId,
        reason: body.reason,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.membership.leave",
        targetType: "membership",
        targetId: actor.userId,
        result: "success",
        metadata: { reason: body.reason ?? null },
      });
      return left;
    } catch (error: unknown) {
      mapLifecycleError(error);
    }
  }

  async archive(actor: AuthActor, workspaceId: string): Promise<WorkspaceSummary> {
    await this.getForActor(actor, workspaceId);
    try {
      const archived = await this.iam.archiveWorkspace(workspaceId, actor.userId);
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.archive",
        targetType: "workspace",
        targetId: workspaceId,
        result: "success",
        metadata: { archivedAt: archived.archivedAt ?? null },
      });
      return archived;
    } catch (error: unknown) {
      mapLifecycleError(error);
    }
  }

  async unarchive(actor: AuthActor, workspaceId: string): Promise<WorkspaceSummary> {
    await this.getForActor(actor, workspaceId);
    try {
      const restored = await this.iam.unarchiveWorkspace(workspaceId, actor.userId);
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.unarchive",
        targetType: "workspace",
        targetId: workspaceId,
        result: "success",
      });
      return restored;
    } catch (error: unknown) {
      mapLifecycleError(error);
    }
  }

  async softDelete(
    actor: AuthActor,
    workspaceId: string,
    body: SoftDeleteWorkspaceRequest,
  ): Promise<WorkspaceSummary> {
    await this.getForActor(actor, workspaceId);
    try {
      const deleted = await this.iam.softDeleteWorkspace(
        workspaceId,
        actor.userId,
        body.confirmSlug,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.soft_delete",
        targetType: "workspace",
        targetId: workspaceId,
        result: "success",
        metadata: { deletedAt: deleted.deletedAt ?? null },
      });
      return deleted;
    } catch (error: unknown) {
      mapLifecycleError(error);
    }
  }
}
