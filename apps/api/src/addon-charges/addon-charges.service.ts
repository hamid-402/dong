import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreatePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";
import {
  isFinanceManagerRole,
  readProductFeatureFlags,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  ADDON_CHARGE_STORE,
  type AddonChargeStore,
} from "./addon-charges.types.js";

@Injectable()
export class AddonChargesService {
  constructor(
    @Inject(ADDON_CHARGE_STORE)
    private readonly charges: AddonChargeStore,
    @Inject(WorkspaceAccessService)
    private readonly access: WorkspaceAccessService,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    input: CreatePersonalAddonChargeRequest,
  ): Promise<PersonalAddonChargeSummary> {
    this.assertEnabled();
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    await this.access.requireMember(workspaceId, input.targetMemberUserId);

    try {
      return await this.charges.create(workspaceId, actor.userId, input);
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async list(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<PersonalAddonChargeSummary[]> {
    this.assertEnabled();
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const charges = await this.charges.list(workspaceId, actor.userId);
    return isFinanceManagerRole(role)
      ? charges
      : charges.filter(
          (charge) => charge.targetMemberUserId === actor.userId,
        );
  }

  async confirm(
    actor: AuthActor,
    workspaceId: string,
    chargeId: string,
  ): Promise<PersonalAddonChargeSummary> {
    this.assertEnabled();
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    const charge = await this.requireCharge(workspaceId, chargeId, actor.userId);

    const requiresTargetAck =
      charge.createdByUserId !== charge.targetMemberUserId;
    if (
      (requiresTargetAck && actor.userId !== charge.targetMemberUserId) ||
      (!requiresTargetAck &&
        actor.userId !== charge.targetMemberUserId &&
        !isFinanceManagerRole(role))
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/addon-charge-ack-required",
        title: "Target member acknowledgement required",
        status: 403,
        detail:
          "A charge created for another member must be confirmed by that target member.",
      });
    }

    try {
      return await this.charges.transition(
        workspaceId,
        chargeId,
        actor.userId,
        "confirmed",
      );
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async dispute(
    actor: AuthActor,
    workspaceId: string,
    chargeId: string,
    note?: string,
  ): Promise<PersonalAddonChargeSummary> {
    this.assertEnabled();
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    const charge = await this.requireCharge(workspaceId, chargeId, actor.userId);
    if (charge.targetMemberUserId !== actor.userId) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Only the target member can dispute this charge",
        status: 403,
      });
    }

    try {
      return await this.charges.transition(
        workspaceId,
        chargeId,
        actor.userId,
        "disputed",
        note,
      );
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  private async requireCharge(
    workspaceId: string,
    chargeId: string,
    actorUserId: string,
  ): Promise<PersonalAddonChargeSummary> {
    const charge = await this.charges.get(
      workspaceId,
      chargeId,
      actorUserId,
    );
    if (!charge) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Add-on charge not found",
        status: 404,
      });
    }
    return charge;
  }

  private assertEnabled(): void {
    if (!readProductFeatureFlags(process.env).addonAck) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Personal add-on acknowledgement is disabled",
        status: 403,
        detail: "Set ENABLE_ADDON_ACK=1 to enable this feature.",
      });
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error) {
      if (error.message === "ADDON_CHARGE_NOT_FOUND") {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "Add-on charge not found",
          status: 404,
        });
      }
      if (error.message === "ADDON_CHARGE_STATUS") {
        throw new BadRequestException({
          type: "https://dang.local/problems/invalid-transition",
          title: "Add-on charge cannot transition from its current status",
          status: 400,
        });
      }
    }
    throw error;
  }
}
