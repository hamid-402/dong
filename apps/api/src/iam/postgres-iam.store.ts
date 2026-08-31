import {
  and,
  createDatabase,
  eq,
  invite,
  isNull,
  membership,
  userAccount,
  withTenantContext,
  workspace,
  type AppDatabase,
} from "@dang/db";
import type {
  AuthActor,
  CreateInviteResponse,
  InviteSummary,
  MembershipSummary,
  WorkspaceSummary,
  WorkspaceTemplate,
} from "@dang/contracts";
import type {
  CreateInviteInput,
  CreateWorkspaceInput,
  IamStore,
  UpsertDevActorInput,
} from "./iam.types.js";
import { INVITE_OWNER_ROLES } from "./iam.types.js";
import { hashInviteToken, issueInviteToken } from "./invite-token.js";

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
          const inserted = await tx
            .insert(workspace)
            .values({
              id,
              name: input.name.trim(),
              slug: normalizedSlug,
              template: input.template,
              timezone: "Asia/Tehran",
              displayUnit: "toman",
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
          });

          return mapWorkspace(row);
        },
      );
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        throw new Error("WORKSPACE_SLUG_TAKEN");
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
            joinedAt: membership.joinedAt,
            displayName: userAccount.displayName,
          })
          .from(membership)
          .innerJoin(userAccount, eq(userAccount.id, membership.userId))
          .where(
            and(
              eq(membership.workspaceId, workspaceId),
              isNull(membership.disabledAt),
            ),
          );

        return rows.map((row) => ({
          workspaceId: row.workspaceId,
          userId: row.userId,
          displayName: row.displayName,
          role: row.role,
          joinedAt: row.joinedAt.toISOString(),
        }));
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
          throw new Error("INVITE_FORBIDDEN");
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
}
