import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  updateWorkspaceExpensePolicyRequestSchema,
  type AuthActor,
  type UpdateWorkspaceExpensePolicyRequestInput,
  type WorkspaceExpensePolicySummary,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ExpensePolicyService } from "./expense-policy.service.js";

@Controller("workspaces/:workspaceId/expense-policy")
@UseGuards(AuthGuard)
export class ExpensePolicyController {
  constructor(
    @Inject(ExpensePolicyService) private readonly policy: ExpensePolicyService,
  ) {}

  @Get()
  get(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceExpensePolicySummary> {
    return this.policy.get(actor, workspaceId);
  }

  @Put()
  put(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(updateWorkspaceExpensePolicyRequestSchema))
    body: UpdateWorkspaceExpensePolicyRequestInput,
  ): Promise<WorkspaceExpensePolicySummary> {
    return this.policy.put(actor, workspaceId, body);
  }
}
