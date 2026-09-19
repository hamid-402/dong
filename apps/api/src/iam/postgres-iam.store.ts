import {
  and,
  createDatabase,
  eq,
  invite,
  isNull,
  membership,
  personalWorkspace,
  userAccount,
  withTenantContext,
  workspace,
  workspaceJoinRequest,
  workspaceOwnershipTransfer,
  type AppDatabase,
} from "@dang/db";
import type {
  AuthActor,
  CreateInviteResponse,
  InviteSummary,
  JoinRequestSummary,
  MembershipAddedVia,
  MembershipRole,
  MembershipSummary,
  OwnershipTransferSummary,
  WorkspaceSummary,
  WorkspaceTemplate,
} from "@dang/contracts";
import {
  inviteSatisfiesFinanceQuorum,
  isFinanceManagerRole,
  spaceKindForTemplate,
} from "@dang/contracts";
import type {
  AddMemberByUserIdInput,
  ChangeMemberRoleInput,
  CreateInviteInput,
  CreateJoinRequestInput,
  CreateWorkspaceInput,
  DecideJoinRequestInput,
  DisableMemberInput,
  IamStore,
  ProposeOwnershipTransferInput,
  UpdateWorkspaceProfileInput,
  UpsertDevActorInput,
} from "./iam.types.js";
import { INVITE_OWNER_ROLES } from "./iam.types.js";
import { hashInviteToken, issueInviteToken } from "./invite-token.js";
import {
  ASSIGNABLE_MEMBER_ROLES,
  isMembershipManager,
  wouldRemoveLastFinanceManager,
} from "./membership-rules.js";

function asDisplayUnit(value: string): "toman" | "rial" {
  return value === "rial" ? "rial" : "toman";
}

function asTemplate(value: string): WorkspaceTemplate {
  return value as WorkspaceTemplate;
}

function mapWorkspace(row: typeof workspace.$inferSelect): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    template: asTemplate(row.template),
    timezone: row.timezone,
    displayUnit: asDisplayUnit(row.displayUnit),
  };
}

function asAddedVia(value: string | null | undefined): MembershipAddedVia {
  if (
    value === "friend" ||
    value === "join_request" ||
    value === "user_id" ||
    value === "seed"
  ) {
    return value;
  }
  return "invite";
}

function mapMemberSummary(row: {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
  defaultShares: number | null;
  joinedAt: Date;
  disabledAt: Date | null;
  disabledReason: string | null;
  addedVia: string | null;
  addedByUserId: string | null;
  displayName: string;
}): MembershipSummary {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
    defaultShares: row.defaultShares ?? 1,
    joinedAt: row.joinedAt.toISOString(),
    disabledAt: row.disabledAt?.toISOString(),
    disabledReason: row.disabledReason ?? undefined,
    addedVia: asAddedVia(row.addedVia),
    addedByUserId: row.addedByUserId ?? undefined,
  };
}

export class PostgresIamStore implements IamStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresIamStore {
    const { db } = createDatabase(connectionString);
    return new PostgresIamStore(db);
  }

  async upsertDevActor(input: UpsertDevActorInput): Promise<AuthActor> {
    const existing = await this.db
      .select()
      .from(userAccount)
      .where(eq(userAccount.externalSubject, input.externalSubject))
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(userAccount)
        .set({
          displayName: input.displayName,
          updatedAt: new Date(),
        })
        .where(eq(userAccount.id, existing[0].id));

      return {
        userId: existing[0].id,
        externalSubject: existing[0].externalSubject,
        displayName: input.displayName,
        authMode: "dev",
      };
    }

    const inserted = await this.db
      .insert(userAccount)
      .values({
        id: input.userId,
        externalSubject: input.externalSubject,
        displayName: input.displayName,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      throw new Error("USER_INSERT_FAILED");
    }

    return {
      userId: row.id,
      externalSubject: row.externalSubject,
      displayName: row.displayName,
      authMode: "dev",
    };
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
    return withTenantContext(this.db, { userId }, async (tx) => {
        const rows = await tx
          .select({
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            template: workspace.template,
            timezone: workspace.timezone,
            displayUnit: workspace.displayUnit,
          })
          .from(workspace)
          .innerJoin(membership, eq(membership.workspaceId, workspace.id))
          .where(
            and(eq(membership.userId, userId), isNull(membership.disabledAt)),
          );

        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          template: asTemplate(row.template),
          timezone: row.timezone,
          displayUnit: asDisplayUnit(row.displayUnit),
        }));
      },
    );
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const id = crypto.randomUUID();
    const normalizedSlug = input.slug.trim().toLowerCase();

    try {
      return await withTenantContext(
        this.db,
        { workspaceId: id, userId: input.actorUserId },
        async (tx) => {
          if (input.template === "personal") {
            const mapped = await tx
              .select()
              .from(personalWorkspace)
              .where(eq(personalWorkspace.userId, input.actorUserId))
              .limit(1);
            if (mapped[0]) {
              throw new Error("PERSONAL_WORKSPACE_EXISTS");
            }
          }

          const inserted = await tx
            .insert(workspace)
            .values({
              id,
              name: input.name.trim(),
              slug: normalizedSlug,
              template: input.template,
              timezone: "Asia/Tehran",
              displayUnit: "rial",
              createdBy: input.actorUserId,
            })
            .returning();

          const row = inserted[0];
          if (!row) {
            throw new Error("WORKSPACE_INSERT_FAILED");
          }

          await tx.insert(membership).values({
            workspaceId: id,
            userId: input.actorUserId,
            role: "owner",
            addedVia: "seed",
            addedByUserId: input.actorUserId,
          });

          if (input.template === "personal") {
            await tx.insert(personalWorkspace).values({
              userId: input.actorUserId,
              workspaceId: id,
            });
          }

          return mapWorkspace(row);
        },
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "PERSONAL_WORKSPACE_EXISTS") {
        throw error;
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        if (input.template === "personal") {
          const again = await this.findMappedPersonalWorkspace(input.actorUserId);
          if (again) {
            throw new Error("PERSONAL_WORKSPACE_EXISTS");
          }
        }
        throw new Error("WORKSPACE_SLUG_TAKEN");
      }
      throw error;
    }
  }

  async updateWorkspaceProfile(
    input: UpdateWorkspaceProfileInput,
  ): Promise<WorkspaceSummary | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const memberships = await tx
          .select({ role: membership.role })
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        const role = memberships[0]?.role;
        if (role !== "owner" && role !== "admin") {
          throw new Error("WORKSPACE_UPDATE_FORBIDDEN");
        }

        const rows = await tx
          .update(workspace)
          .set({
            name: input.name,
            timezone: input.timezone,
            displayUnit: input.displayUnit,
            updatedAt: new Date(),
          })
          .where(eq(workspace.id, input.workspaceId))
          .returning();
        return rows[0] ? mapWorkspace(rows[0]) : undefined;
      },
    );
  }

  async ensurePersonalWorkspace(userId: string): Promise<WorkspaceSummary> {
    const mapped = await this.findMappedPersonalWorkspace(userId);
    if (mapped) return mapped;

    const legacy = (await this.listWorkspacesForUser(userId)).find(
      (w) => w.template === "personal",
    );
    if (legacy) {
      await this.tryRegisterPersonalWorkspace(userId, legacy.id);
      const after = await this.findMappedPersonalWorkspace(userId);
      return after ?? legacy;
    }

    const slug = `me-${userId.replaceAll("-", "").slice(0, 12)}-${Date.now().toString(36).slice(-4)}`;
    try {
      return await this.createWorkspace({
        actorUserId: userId,
        name: "دفتر من",
        slug,
        template: "personal",
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message === "WORKSPACE_SLUG_TAKEN" ||
          error.message === "PERSONAL_WORKSPACE_EXISTS")
      ) {
        const again = await this.findMappedPersonalWorkspace(userId);
        if (again) return again;
        const fallback = (await this.listWorkspacesForUser(userId)).find(
          (w) => w.template === "personal",
        );
        if (fallback) return fallback;
      }
      throw error;
    }
  }

  private async findMappedPersonalWorkspace(
    userId: string,
  ): Promise<WorkspaceSummary | undefined> {
    const rows = await this.db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        template: workspace.template,
        timezone: workspace.timezone,
        displayUnit: workspace.displayUnit,
      })
      .from(personalWorkspace)
      .innerJoin(workspace, eq(workspace.id, personalWorkspace.workspaceId))
      .where(eq(personalWorkspace.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      template: asTemplate(row.template),
      timezone: row.timezone,
      displayUnit: asDisplayUnit(row.displayUnit),
    };
  }

  private async tryRegisterPersonalWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    try {
      await this.db.insert(personalWorkspace).values({ userId, workspaceId });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return;
      }
      throw error;
    }
  }

  async getWorkspaceForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceSummary | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId },
      async (tx) => {
        const member = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, userId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!member[0]) return undefined;

        const rows = await tx
          .select()
          .from(workspace)
          .where(eq(workspace.id, workspaceId))
          .limit(1);
        const row = rows[0];
        return row ? mapWorkspace(row) : undefined;
      },
    );
  }

  async listMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MembershipSummary[] | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const actorMembership = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorMembership[0]) return undefined;

        const rows = await tx
          .select({
            workspaceId: membership.workspaceId,
            userId: membership.userId,
            role: membership.role,
            defaultShares: membership.defaultShares,
            joinedAt: membership.joinedAt,
            disabledAt: membership.disabledAt,
            disabledReason: membership.disabledReason,
            addedVia: membership.addedVia,
            addedByUserId: membership.addedByUserId,
            displayName: userAccount.displayName,
          })
          .from(membership)
          .innerJoin(userAccount, eq(userAccount.id, membership.userId))
          .where(eq(membership.workspaceId, workspaceId));

        return rows.map((row) => mapMemberSummary(row));
      },
    );
  }

  async getWorkspaceBySlug(slug: string): Promise<WorkspaceSummary | undefined> {
    const normalized = slug.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(workspace)
      .where(eq(workspace.slug, normalized))
      .limit(1);
    return rows[0] ? mapWorkspace(rows[0]) : undefined;
  }

  async setMemberDefaultShares(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
    defaultShares: number,
  ): Promise<MembershipSummary | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const actorMembership = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        const actor = actorMembership[0];
        if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
          return undefined;
        }

        const updated = await tx
          .update(membership)
          .set({ defaultShares })
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, targetUserId),
              isNull(membership.disabledAt),
            ),
          )
          .returning();
        const row = updated[0];
        if (!row) return undefined;
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, targetUserId))
          .limit(1);
        const user = users[0];
        if (!user) return undefined;
        return mapMemberSummary({
          workspaceId,
          userId: targetUserId,
          role: row.role,
          defaultShares: row.defaultShares,
          joinedAt: row.joinedAt,
          disabledAt: row.disabledAt,
          disabledReason: row.disabledReason,
          addedVia: row.addedVia,
          addedByUserId: row.addedByUserId,
          displayName: user.displayName,
        });
      },
    );
  }

  async addMemberByUserId(input: AddMemberByUserIdInput): Promise<MembershipSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        const actor = actorRows[0];
        if (!actor || !isMembershipManager(actor.role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }
        if (input.role === "owner" || !ASSIGNABLE_MEMBER_ROLES.includes(input.role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }

        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, input.userId))
          .limit(1);
        if (!users[0]) throw new Error("CANNOT_CREATE_USER_ACCOUNT");

        const existing = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.userId),
            ),
          )
          .limit(1);
        if (existing[0] && !existing[0].disabledAt) {
          throw new Error("MEMBER_ALREADY_EXISTS");
        }

        const wsRows = await tx
          .select()
          .from(workspace)
          .where(eq(workspace.id, input.workspaceId))
          .limit(1);
        const ws = wsRows[0];
        if (!ws) throw new Error("MEMBERSHIP_FORBIDDEN");

        const memberRows = await tx
          .select({ role: membership.role, disabledAt: membership.disabledAt })
          .from(membership)
          .where(eq(membership.workspaceId, input.workspaceId));
        const active = memberRows.filter((m) => !m.disabledAt);
        const financeCount = active.filter((m) => isFinanceManagerRole(m.role)).length;
        const quorum = inviteSatisfiesFinanceQuorum({
          spaceKind: spaceKindForTemplate(asTemplate(ws.template)),
          currentMemberCount: active.length,
          currentFinanceManagerCount: financeCount,
          inviteRole: input.role,
        });
        if (!quorum.ok) throw new Error("FINANCE_QUORUM_REQUIRED");

        let row: typeof membership.$inferSelect;
        if (existing[0]) {
          const updated = await tx
            .update(membership)
            .set({
              role: input.role,
              defaultShares: input.defaultShares ?? 1,
              disabledAt: null,
              disabledByUserId: null,
              disabledReason: null,
              addedVia: input.addedVia,
              addedByUserId: input.actorUserId,
            })
            .where(
              and(
                eq(membership.workspaceId, input.workspaceId),
                eq(membership.userId, input.userId),
              ),
            )
            .returning();
          row = updated[0]!;
        } else {
          const inserted = await tx
            .insert(membership)
            .values({
              workspaceId: input.workspaceId,
              userId: input.userId,
              role: input.role,
              defaultShares: input.defaultShares ?? 1,
              addedVia: input.addedVia,
              addedByUserId: input.actorUserId,
            })
            .returning();
          row = inserted[0]!;
        }

        return mapMemberSummary({
          workspaceId: row.workspaceId,
          userId: row.userId,
          role: row.role,
          defaultShares: row.defaultShares,
          joinedAt: row.joinedAt,
          disabledAt: row.disabledAt,
          disabledReason: row.disabledReason,
          addedVia: row.addedVia,
          addedByUserId: row.addedByUserId,
          displayName: users[0].displayName,
        });
      },
    );
  }

  async changeMemberRole(input: ChangeMemberRoleInput): Promise<MembershipSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0] || !isMembershipManager(actorRows[0].role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }
        if (input.role === "owner") throw new Error("MEMBERSHIP_FORBIDDEN");
        if (input.role !== undefined && !ASSIGNABLE_MEMBER_ROLES.includes(input.role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }

        const all = await tx
          .select()
          .from(membership)
          .where(eq(membership.workspaceId, input.workspaceId));
        const target = all.find((m) => m.userId === input.targetUserId);
        if (!target || target.disabledAt) throw new Error("MEMBER_NOT_FOUND");

        const memberLikes = all.map((m) => ({
          userId: m.userId,
          role: m.role,
          disabledAt: m.disabledAt?.toISOString() ?? null,
        }));
        if (
          input.role !== undefined &&
          wouldRemoveLastFinanceManager(memberLikes, input.targetUserId, {
            nextRole: input.role,
          })
        ) {
          throw new Error("LAST_FINANCE_MANAGER");
        }
        // Owner handoff is two-step transfer only (even when other finance managers exist).
        if (target.role === "owner" && input.role !== undefined) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }

        const updated = await tx
          .update(membership)
          .set({
            role: input.role ?? target.role,
            defaultShares: input.defaultShares ?? target.defaultShares,
          })
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.targetUserId),
            ),
          )
          .returning();
        const row = updated[0];
        if (!row) throw new Error("MEMBER_NOT_FOUND");
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, input.targetUserId))
          .limit(1);
        if (!users[0]) throw new Error("MEMBER_NOT_FOUND");
        return mapMemberSummary({
          workspaceId: row.workspaceId,
          userId: row.userId,
          role: row.role,
          defaultShares: row.defaultShares,
          joinedAt: row.joinedAt,
          disabledAt: row.disabledAt,
          disabledReason: row.disabledReason,
          addedVia: row.addedVia,
          addedByUserId: row.addedByUserId,
          displayName: users[0].displayName,
        });
      },
    );
  }

  async disableMember(input: DisableMemberInput): Promise<MembershipSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0] || !isMembershipManager(actorRows[0].role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }
        if (input.targetUserId === input.actorUserId) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }

        const all = await tx
          .select()
          .from(membership)
          .where(eq(membership.workspaceId, input.workspaceId));
        const target = all.find((m) => m.userId === input.targetUserId);
        if (!target || target.disabledAt) throw new Error("MEMBER_NOT_FOUND");
        if (target.role === "owner") throw new Error("MEMBERSHIP_FORBIDDEN");

        if (
          wouldRemoveLastFinanceManager(
            all.map((m) => ({
              userId: m.userId,
              role: m.role,
              disabledAt: m.disabledAt?.toISOString() ?? null,
            })),
            input.targetUserId,
            { disabling: true },
          )
        ) {
          throw new Error("LAST_FINANCE_MANAGER");
        }

        const updated = await tx
          .update(membership)
          .set({
            disabledAt: new Date(),
            disabledByUserId: input.actorUserId,
            disabledReason: input.reason,
          })
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.targetUserId),
            ),
          )
          .returning();
        const row = updated[0];
        if (!row) throw new Error("MEMBER_NOT_FOUND");
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, input.targetUserId))
          .limit(1);
        if (!users[0]) throw new Error("MEMBER_NOT_FOUND");
        return mapMemberSummary({
          workspaceId: row.workspaceId,
          userId: row.userId,
          role: row.role,
          defaultShares: row.defaultShares,
          joinedAt: row.joinedAt,
          disabledAt: row.disabledAt,
          disabledReason: row.disabledReason,
          addedVia: row.addedVia,
          addedByUserId: row.addedByUserId,
          displayName: users[0].displayName,
        });
      },
    );
  }

  async enableMember(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<MembershipSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0] || !isMembershipManager(actorRows[0].role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }

        const targetRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, targetUserId),
            ),
          )
          .limit(1);
        const target = targetRows[0];
        if (!target || !target.disabledAt) throw new Error("MEMBER_NOT_FOUND");

        const updated = await tx
          .update(membership)
          .set({
            disabledAt: null,
            disabledByUserId: null,
            disabledReason: null,
          })
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, targetUserId),
            ),
          )
          .returning();
        const row = updated[0];
        if (!row) throw new Error("MEMBER_NOT_FOUND");
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, targetUserId))
          .limit(1);
        if (!users[0]) throw new Error("MEMBER_NOT_FOUND");
        return mapMemberSummary({
          workspaceId: row.workspaceId,
          userId: row.userId,
          role: row.role,
          defaultShares: row.defaultShares,
          joinedAt: row.joinedAt,
          disabledAt: row.disabledAt,
          disabledReason: row.disabledReason,
          addedVia: row.addedVia,
          addedByUserId: row.addedByUserId,
          displayName: users[0].displayName,
        });
      },
    );
  }

  private mapJoinRequest(
    row: typeof workspaceJoinRequest.$inferSelect,
    displayName: string,
  ): JoinRequestSummary {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      displayName,
      message: row.message ?? undefined,
      status: row.status as JoinRequestSummary["status"],
      requestedAt: row.requestedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString(),
      decidedByUserId: row.decidedByUserId ?? undefined,
      grantedRole: (row.grantedRole as MembershipRole | null) ?? undefined,
    };
  }

  async listJoinRequests(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JoinRequestSummary[] | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0] || !isMembershipManager(actorRows[0].role)) {
          return undefined;
        }

        const rows = await tx
          .select({
            request: workspaceJoinRequest,
            displayName: userAccount.displayName,
          })
          .from(workspaceJoinRequest)
          .innerJoin(userAccount, eq(userAccount.id, workspaceJoinRequest.userId))
          .where(eq(workspaceJoinRequest.workspaceId, workspaceId));

        return rows.map((r) => this.mapJoinRequest(r.request, r.displayName));
      },
    );
  }

  async createJoinRequest(input: CreateJoinRequestInput): Promise<JoinRequestSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.userId },
      async (tx) => {
        const ws = await tx
          .select()
          .from(workspace)
          .where(eq(workspace.id, input.workspaceId))
          .limit(1);
        if (!ws[0]) throw new Error("WORKSPACE_NOT_FOUND");

        const existing = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.userId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (existing[0]) throw new Error("MEMBER_ALREADY_EXISTS");

        try {
          const inserted = await tx
            .insert(workspaceJoinRequest)
            .values({
              workspaceId: input.workspaceId,
              userId: input.userId,
              message: input.message?.trim() || null,
              status: "pending",
            })
            .returning();
          const row = inserted[0];
          if (!row) throw new Error("JOIN_REQUEST_INSERT_FAILED");
          const users = await tx
            .select()
            .from(userAccount)
            .where(eq(userAccount.id, input.userId))
            .limit(1);
          return this.mapJoinRequest(row, users[0]?.displayName ?? input.userId);
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "23505"
          ) {
            throw new Error("JOIN_REQUEST_PENDING");
          }
          throw error;
        }
      },
    );
  }

  async approveJoinRequest(input: DecideJoinRequestInput): Promise<JoinRequestSummary> {
    const role = input.role ?? "member";
    await this.addMemberByUserId({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      userId: (
        await withTenantContext(
          this.db,
          { workspaceId: input.workspaceId, userId: input.actorUserId },
          async (tx) => {
            const rows = await tx
              .select()
              .from(workspaceJoinRequest)
              .where(eq(workspaceJoinRequest.id, input.requestId))
              .limit(1);
            const row = rows[0];
            if (!row || row.workspaceId !== input.workspaceId || row.status !== "pending") {
              throw new Error("JOIN_REQUEST_NOT_FOUND");
            }
            return row.userId;
          },
        )
      ),
      role,
      addedVia: "join_request",
    });

    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const updated = await tx
          .update(workspaceJoinRequest)
          .set({
            status: "approved",
            decidedAt: new Date(),
            decidedByUserId: input.actorUserId,
            grantedRole: role,
          })
          .where(eq(workspaceJoinRequest.id, input.requestId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("JOIN_REQUEST_NOT_FOUND");
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, row.userId))
          .limit(1);
        return this.mapJoinRequest(row, users[0]?.displayName ?? row.userId);
      },
    );
  }

  async rejectJoinRequest(input: DecideJoinRequestInput): Promise<JoinRequestSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0] || !isMembershipManager(actorRows[0].role)) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }

        const rows = await tx
          .select()
          .from(workspaceJoinRequest)
          .where(eq(workspaceJoinRequest.id, input.requestId))
          .limit(1);
        const current = rows[0];
        if (
          !current ||
          current.workspaceId !== input.workspaceId ||
          current.status !== "pending"
        ) {
          throw new Error("JOIN_REQUEST_NOT_FOUND");
        }

        const updated = await tx
          .update(workspaceJoinRequest)
          .set({
            status: "rejected",
            decidedAt: new Date(),
            decidedByUserId: input.actorUserId,
          })
          .where(eq(workspaceJoinRequest.id, input.requestId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("JOIN_REQUEST_NOT_FOUND");
        const users = await tx
          .select()
          .from(userAccount)
          .where(eq(userAccount.id, row.userId))
          .limit(1);
        return this.mapJoinRequest(row, users[0]?.displayName ?? row.userId);
      },
    );
  }

  async withdrawJoinRequest(
    requestId: string,
    userId: string,
  ): Promise<JoinRequestSummary> {
    return withTenantContext(this.db, { userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(workspaceJoinRequest)
        .where(eq(workspaceJoinRequest.id, requestId))
        .limit(1);
      const current = rows[0];
      if (!current || current.userId !== userId || current.status !== "pending") {
        throw new Error("JOIN_REQUEST_NOT_FOUND");
      }
      const updated = await tx
        .update(workspaceJoinRequest)
        .set({
          status: "withdrawn",
          decidedAt: new Date(),
        })
        .where(eq(workspaceJoinRequest.id, requestId))
        .returning();
      const row = updated[0];
      if (!row) throw new Error("JOIN_REQUEST_NOT_FOUND");
      const users = await tx
        .select()
        .from(userAccount)
        .where(eq(userAccount.id, row.userId))
        .limit(1);
      return this.mapJoinRequest(row, users[0]?.displayName ?? row.userId);
    });
  }

  async proposeOwnershipTransfer(
    input: ProposeOwnershipTransferInput,
  ): Promise<OwnershipTransferSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.fromUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.fromUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0] || actorRows[0].role !== "owner") {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }
        if (input.toUserId === input.fromUserId) {
          throw new Error("MEMBERSHIP_FORBIDDEN");
        }
        const targetRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.toUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!targetRows[0]) throw new Error("MEMBER_NOT_FOUND");

        const hours = input.expiresInHours ?? 72;
        try {
          const inserted = await tx
            .insert(workspaceOwnershipTransfer)
            .values({
              workspaceId: input.workspaceId,
              fromUserId: input.fromUserId,
              toUserId: input.toUserId,
              status: "pending",
              expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
            })
            .returning();
          const row = inserted[0];
          if (!row) throw new Error("OWNERSHIP_TRANSFER_INSERT_FAILED");
          return {
            id: row.id,
            workspaceId: row.workspaceId,
            fromUserId: row.fromUserId,
            toUserId: row.toUserId,
            status: row.status as OwnershipTransferSummary["status"],
            createdAt: row.createdAt.toISOString(),
            decidedAt: row.decidedAt?.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
          };
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "23505"
          ) {
            throw new Error("OWNERSHIP_TRANSFER_PENDING");
          }
          throw error;
        }
      },
    );
  }

  async listOwnershipTransfers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary[] | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const actorRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorRows[0]) return undefined;

        const now = new Date();
        const rows = await tx
          .select()
          .from(workspaceOwnershipTransfer)
          .where(
            and(
              eq(workspaceOwnershipTransfer.workspaceId, workspaceId),
              eq(workspaceOwnershipTransfer.status, "pending"),
            ),
          );

        const pending: OwnershipTransferSummary[] = [];
        for (const row of rows) {
          if (row.expiresAt.getTime() < now.getTime()) {
            await tx
              .update(workspaceOwnershipTransfer)
              .set({ status: "expired", decidedAt: now })
              .where(eq(workspaceOwnershipTransfer.id, row.id));
            continue;
          }
          pending.push({
            id: row.id,
            workspaceId: row.workspaceId,
            fromUserId: row.fromUserId,
            toUserId: row.toUserId,
            status: row.status as OwnershipTransferSummary["status"],
            createdAt: row.createdAt.toISOString(),
            decidedAt: row.decidedAt?.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
          });
        }
        return pending;
      },
    );
  }

  async acceptOwnershipTransfer(
    workspaceId: string,
    transferId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(workspaceOwnershipTransfer)
          .where(eq(workspaceOwnershipTransfer.id, transferId))
          .limit(1);
        const current = rows[0];
        if (!current || current.workspaceId !== workspaceId || current.status !== "pending") {
          throw new Error("OWNERSHIP_TRANSFER_NOT_FOUND");
        }
        if (current.toUserId !== actorUserId) throw new Error("MEMBERSHIP_FORBIDDEN");
        if (current.expiresAt.getTime() < Date.now()) {
          await tx
            .update(workspaceOwnershipTransfer)
            .set({ status: "expired", decidedAt: new Date() })
            .where(eq(workspaceOwnershipTransfer.id, transferId));
          throw new Error("OWNERSHIP_TRANSFER_EXPIRED");
        }

        const fromRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, current.fromUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        const toRows = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, current.toUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!fromRows[0] || !toRows[0] || fromRows[0].role !== "owner") {
          throw new Error("MEMBER_NOT_FOUND");
        }

        await tx
          .update(membership)
          .set({ role: "admin" })
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, current.fromUserId),
            ),
          );
        await tx
          .update(membership)
          .set({ role: "owner" })
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, current.toUserId),
            ),
          );

        const updated = await tx
          .update(workspaceOwnershipTransfer)
          .set({ status: "accepted", decidedAt: new Date() })
          .where(eq(workspaceOwnershipTransfer.id, transferId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("OWNERSHIP_TRANSFER_NOT_FOUND");
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          fromUserId: row.fromUserId,
          toUserId: row.toUserId,
          status: row.status as OwnershipTransferSummary["status"],
          createdAt: row.createdAt.toISOString(),
          decidedAt: row.decidedAt?.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        };
      },
    );
  }

  async cancelOwnershipTransfer(
    workspaceId: string,
    transferId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(workspaceOwnershipTransfer)
          .where(eq(workspaceOwnershipTransfer.id, transferId))
          .limit(1);
        const current = rows[0];
        if (!current || current.workspaceId !== workspaceId || current.status !== "pending") {
          throw new Error("OWNERSHIP_TRANSFER_NOT_FOUND");
        }
        if (current.fromUserId !== actorUserId) throw new Error("MEMBERSHIP_FORBIDDEN");

        const updated = await tx
          .update(workspaceOwnershipTransfer)
          .set({ status: "cancelled", decidedAt: new Date() })
          .where(eq(workspaceOwnershipTransfer.id, transferId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("OWNERSHIP_TRANSFER_NOT_FOUND");
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          fromUserId: row.fromUserId,
          toUserId: row.toUserId,
          status: row.status as OwnershipTransferSummary["status"],
          createdAt: row.createdAt.toISOString(),
          decidedAt: row.decidedAt?.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        };
      },
    );
  }

  async createInvite(input: CreateInviteInput): Promise<CreateInviteResponse> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.actorUserId },
      async (tx) => {
        const actorMembership = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              eq(membership.userId, input.actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        const role = actorMembership[0]?.role;
        if (!role || !INVITE_OWNER_ROLES.includes(role)) {
          if (role && isMembershipManager(role)) {
            throw new Error("CANNOT_CREATE_USER_ACCOUNT");
          }
          throw new Error("INVITE_FORBIDDEN");
        }

        const wsRows = await tx
          .select()
          .from(workspace)
          .where(eq(workspace.id, input.workspaceId))
          .limit(1);
        const ws = wsRows[0];
        if (!ws) throw new Error("INVITE_FORBIDDEN");

        const memberRows = await tx
          .select({ role: membership.role })
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, input.workspaceId),
              isNull(membership.disabledAt),
            ),
          );
        const financeCount = memberRows.filter((m) =>
          isFinanceManagerRole(m.role),
        ).length;
        const quorum = inviteSatisfiesFinanceQuorum({
          spaceKind: spaceKindForTemplate(asTemplate(ws.template)),
          currentMemberCount: memberRows.length,
          currentFinanceManagerCount: financeCount,
          inviteRole: input.role,
        });
        if (!quorum.ok) {
          throw new Error("FINANCE_QUORUM_REQUIRED");
        }

        const hours = input.expiresInHours ?? 72;
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
        const rawToken = `${input.workspaceId}.${issueInviteToken()}`;
        const inserted = await tx
          .insert(invite)
          .values({
            workspaceId: input.workspaceId,
            tokenHash: hashInviteToken(rawToken),
            role: input.role,
            invitedSubject: input.invitedSubject?.trim() || null,
            invitedByUserId: input.actorUserId,
            expiresAt,
          })
          .returning();

        const row = inserted[0];
        if (!row) throw new Error("INVITE_INSERT_FAILED");

        const summary: InviteSummary = {
          id: row.id,
          workspaceId: row.workspaceId,
          role: row.role,
          invitedSubject: row.invitedSubject ?? undefined,
          invitedByUserId: row.invitedByUserId,
          expiresAt: row.expiresAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString(),
          createdAt: row.createdAt.toISOString(),
        };

        return {
          ...summary,
          token: rawToken,
          acceptPath: `/invite?token=${encodeURIComponent(rawToken)}`,
        };
      },
    );
  }

  async listInvites(
    workspaceId: string,
    actorUserId: string,
  ): Promise<InviteSummary[] | undefined> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const actorMembership = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actorUserId),
              isNull(membership.disabledAt),
            ),
          )
          .limit(1);
        if (!actorMembership[0]) return undefined;

        const rows = await tx
          .select()
          .from(invite)
          .where(eq(invite.workspaceId, workspaceId));

        return rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          role: row.role,
          invitedSubject: row.invitedSubject ?? undefined,
          invitedByUserId: row.invitedByUserId,
          expiresAt: row.expiresAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString(),
          createdAt: row.createdAt.toISOString(),
        }));
      },
    );
  }

  async acceptInvite(token: string, actor: AuthActor): Promise<WorkspaceSummary> {
    const workspaceId = token.split(".")[0];
    if (!workspaceId) {
      throw new Error("INVITE_INVALID");
    }

    return withTenantContext(
      this.db,
      { workspaceId, userId: actor.userId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(invite)
          .where(eq(invite.tokenHash, hashInviteToken(token)))
          .limit(1);
        const matched = rows[0];
        if (!matched || matched.workspaceId !== workspaceId) {
          throw new Error("INVITE_INVALID");
        }
        if (matched.acceptedAt) {
          throw new Error("INVITE_ALREADY_USED");
        }
        if (matched.expiresAt.getTime() < Date.now()) {
          throw new Error("INVITE_EXPIRED");
        }

        const existing = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              eq(membership.userId, actor.userId),
            ),
          )
          .limit(1);

        if (!existing[0]) {
          await tx.insert(membership).values({
            workspaceId,
            userId: actor.userId,
            role: matched.role,
            addedVia: "invite",
            addedByUserId: matched.invitedByUserId,
          });
        }

        await tx
          .update(invite)
          .set({
            acceptedAt: new Date(),
            acceptedByUserId: actor.userId,
          })
          .where(eq(invite.id, matched.id));

        const workspaces = await tx
          .select()
          .from(workspace)
          .where(eq(workspace.id, workspaceId))
          .limit(1);
        const row = workspaces[0];
        if (!row) throw new Error("INVITE_INVALID");
        return mapWorkspace(row);
      },
    );
  }

  async listActiveRolesForUser(userId: string): Promise<MembershipRole[]> {
    const rows = await this.db
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.userId, userId), isNull(membership.disabledAt)));
    return rows.map((r) => r.role);
  }
}
