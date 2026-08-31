import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateExpenseDraftRequest,
  ExpenseSummary,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ExpensesService } from "./expenses.service.js";

@ApiTags("expenses")
@Controller("workspaces/:workspaceId/expenses")
export class ExpensesController {
  constructor(@Inject(ExpensesService) private readonly expenses: ExpensesService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Create an expense draft (no ledger posting yet — Phase 2)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateExpenseDraftRequest,
  ): Promise<ExpenseSummary> {
    return this.expenses.createDraft(actor, workspaceId, body);
  }

  @Post(":expenseId/submit")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Submit a draft expense for posting" })
  submit(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
  ): Promise<ExpenseSummary> {
    return this.expenses.submit(actor, workspaceId, expenseId);
  }

  @Post(":expenseId/post")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Stub-post expense (status→posted; no journal rows yet)",
  })
  post(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
  ): Promise<ExpenseSummary> {
    return this.expenses.post(actor, workspaceId, expenseId);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List expenses in a workspace" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ExpenseSummary[]> {
    return this.expenses.list(actor, workspaceId);
  }
}
