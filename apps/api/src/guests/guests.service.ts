import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type {
  AuthActor,
  ClaimGuestPlaceholderRequest,
  ClaimGuestPlaceholderResponse,
  CreateGuestPlaceholderRequest,
  GuestPlaceholderSummary,
} from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import {
  GUEST_PLACEHOLDER_STORE,
  hashClaimToken,
  mintClaimToken,
  type GuestPlaceholderStore,
} from "./guest-placeholder.store.js";

@Injectable()
export class GuestsService {
  constructor(
    @Inject(GUEST_PLACEHOLDER_STORE)
    private readonly guests: GuestPlaceholderStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Optional() @Inject(AUDIT_STORE) private readonly audit?: AuditStore,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateGuestPlaceholderRequest,
  ): Promise<GuestPlaceholderSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    const token = mintClaimToken();
    try {
      return await this.guests.create(
        workspaceId,
        actor.userId,
        body,
        token,
        hashClaimToken(token),
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "GUEST_NAME") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Invalid guest name",
          status: 400,
          detail: "displayName must be 1-80 characters",
        });
      }
      throw error;
    }
  }

  async list(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<GuestPlaceholderSummary[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    return this.guests.list(workspaceId);
  }

  async claim(
    actor: AuthActor,
    body: ClaimGuestPlaceholderRequest,
  ): Promise<ClaimGuestPlaceholderResponse> {
    const token = body.claimToken?.trim();
    if (!token) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "claimToken required",
        status: 400,
      });
    }
    const record = await this.guests.getByClaimTokenHash(hashClaimToken(token));
    if (!record) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Guest claim not found",
        status: 404,
      });
    }
    if (record.claimedUserId) {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "Guest already claimed",
        status: 409,
      });
    }

    // Ensure membership exists (member role) without elevating.
    const members =
      (await this.iam.listMembers(record.workspaceId, actor.userId)) ??
      (await this.iam.listMembers(record.workspaceId, record.createdByUserId)) ??
      [];
    const already = members.some((m) => m.userId === actor.userId);
    if (!already) {
      try {
        await this.iam.addMemberByUserId({
          workspaceId: record.workspaceId,
          actorUserId: record.createdByUserId,
          userId: actor.userId,
          role: "member",
          defaultShares: 1,
          addedVia: "invite",
        });
      } catch (error: unknown) {
        if (!(error instanceof Error && error.message === "MEMBER_ALREADY_EXISTS")) {
          throw error;
        }
      }
    }

    const placeholder = await this.guests.markClaimed(
      record.workspaceId,
      record.id,
      actor.userId,
    );

    const remappedExpenseCount =
      (await this.expenses.remapUserId?.(
        record.workspaceId,
        record.id,
        actor.userId,
      )) ?? 0;
    const remappedLedgerLineCount =
      (await this.ledger.remapUserId?.(
        record.workspaceId,
        record.id,
        actor.userId,
      )) ?? 0;

    await this.audit?.append({
      workspaceId: record.workspaceId,
      actorUserId: actor.userId,
      action: "guest.claim",
      targetType: "guest_placeholder",
      targetId: record.id,
      result: "success",
      metadata: {
        remappedExpenseCount,
        remappedLedgerLineCount,
        idempotencyKey: body.idempotencyKey,
      },
    });

    return { placeholder, remappedExpenseCount, remappedLedgerLineCount };
  }
}
