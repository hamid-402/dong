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
  MembershipSummary,
  UpdateWorkspaceRequest,
  WorkspaceSummary,
} from "@dang/contracts";
import { workspaceTemplateCatalog } from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEMPLATE_IDS = new Set(workspaceTemplateCatalog.map((item) => item.id));

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
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

    try {
      const workspace = await this.iam.createWorkspace({
        actorUserId: actor.userId,
        name,
        slug,
        template,
      });
      await this.audit.append({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        action: "workspace.create",
        targetType: "workspace",
        targetId: workspace.id,
        result: "success",
        metadata: { slug: workspace.slug, template: workspace.template },
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
}
