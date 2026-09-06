import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateOutingRequest,
  OutingSummary,
} from "@dang/contracts";
import {
  createOutingRequestSchema,
  updateMemberDefaultSharesRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { OUTING_STORE, type OutingStore } from "./outing.store.js";

@ApiTags("outings")
@Controller("workspaces/:workspaceId/outings")
export class OutingsController {
  constructor(
    @Inject(OUTING_STORE) private readonly outings: OutingStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a multi-expense outing (e.g. Friday night out)" })
  async create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createOutingRequestSchema)) body: CreateOutingRequest,
  ): Promise<OutingSummary> {
    await this.requireMember(workspaceId, actor.userId);
    if (!body.title?.trim()) {
      throw new BadRequestException({ detail: "عنوان گردش لازم است" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.occurredOn ?? "")) {
      throw new BadRequestException({ detail: "تاریخ نامعتبر است" });
    }
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({ detail: "idempotencyKey لازم است" });
    }
    return this.outings.create(workspaceId, actor.userId, body);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List outings in a workspace" })
  async list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<OutingSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.outings.list(workspaceId, actor.userId);
  }

  @Get(":outingId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Get one outing with linked expenses aggregate" })
  async getOne(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("outingId") outingId: string,
  ): Promise<OutingSummary> {
    await this.requireMember(workspaceId, actor.userId);
    const row = await this.outings.get(workspaceId, outingId, actor.userId);
    if (!row) throw new NotFoundException({ detail: "گردش پیدا نشد" });
    return row;
  }

  private async requireMember(workspaceId: string, userId: string) {
    const members = await this.iam.listMembers(workspaceId, userId);
    if (!members) {
      throw new NotFoundException({ detail: "عضویت یافت نشد" });
    }
  }
}

/** Additive: update default shares for family/household splits. */
@ApiTags("members")
@Controller("workspaces/:workspaceId/members")
export class MemberSharesController {
  constructor(@Inject(IAM_STORE) private readonly iam: IamStore) {}

  @Patch(":userId/default-shares")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Set default share weight for a member (family template)" })
  async setDefaultShares(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(updateMemberDefaultSharesRequestSchema))
    body: { defaultShares: number },
  ) {
    const shares = Number(body.defaultShares);
    if (!Number.isInteger(shares) || shares <= 0 || shares > 100) {
      throw new BadRequestException({ detail: "سهم پیش‌فرض باید عدد صحیح ۱ تا ۱۰۰ باشد" });
    }
    const updated = await this.iam.setMemberDefaultShares(
      workspaceId,
      actor.userId,
      userId,
      shares,
    );
    if (!updated) {
      throw new NotFoundException({ detail: "به‌روزرسانی سهم ممکن نیست" });
    }
    return updated;
  }
}
