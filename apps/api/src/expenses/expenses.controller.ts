import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateExpenseDraftInput,
  ExpenseListQuery,
  ExpenseSplitLine,
  ExpenseSummary,
  PreviewExpenseSplitInput,
  ExpenseCsvImportRequest,
  ReverseExpenseRequestInput,
  ReviseExpenseRequestInput,
} from "@dang/contracts";
import {
  allocateExpenseSplit,
  createExpenseDraftSchema,
  previewExpenseSplitSchema,
  expenseCsvImportSchema,
  expenseListQuerySchema,
  reverseExpenseRequestSchema,
  reviseExpenseRequestSchema,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ExpensesService } from "./expenses.service.js";

@ApiTags("expenses")
@Controller("workspaces/:workspaceId/expenses")
export class ExpensesController {
  constructor(@Inject(ExpensesService) private readonly expenses: ExpensesService) {}

  @Post("preview-split")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Preview expense split without persisting (same allocator as create)",
  })
  previewSplit(
    @CurrentActor() _actor: AuthActor,
    @Param("workspaceId") _workspaceId: string,
    @Body(new ZodValidationPipe(previewExpenseSplitSchema))
    body: PreviewExpenseSplitInput,
  ): { splits: ExpenseSplitLine[] } {
    try {
      return {
        splits: allocateExpenseSplit({
          total: body.total,
          splitMethod: body.splitMethod,
          participantUserIds: body.participantUserIds,
          splitLines: body.splitLines,
          items: body.items,
          tip: body.tip,
          tax: body.tax,
          discount: body.discount,
        }),
      };
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "SPLIT_ERROR";
      throw new BadRequestException({
        title: "Invalid split",
        detail: code,
      });
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Create an expense draft (ledger posting via submit/post)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createExpenseDraftSchema))
    body: CreateExpenseDraftInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ExpenseSummary> {
    return this.expenses.createDraft(
      actor,
      workspaceId,
      {
        ...body,
        workspaceId: body.workspaceId ?? workspaceId,
      },
      reply,
    );
  }

  @Post("import-csv")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Import generic CSV rows as expense drafts" })
  importCsv(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(expenseCsvImportSchema)) body: ExpenseCsvImportRequest,
  ) {
    return this.expenses.importCsv(actor, workspaceId, body);
  }

  @Post(":expenseId/submit")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Submit a draft expense for posting" })
  submit(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ExpenseSummary> {
    return this.expenses.submit(actor, workspaceId, expenseId, reply);
  }

  @Post(":expenseId/post")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Post expense to ledger (company requires approver role)",
  })
  post(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
  ): Promise<ExpenseSummary> {
    return this.expenses.post(actor, workspaceId, expenseId);
  }

  @Post(":expenseId/promote-company")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Approve reimbursement: private → company" })
  promoteCompany(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
  ): Promise<ExpenseSummary> {
    return this.expenses.promotePrivateToCompany(actor, workspaceId, expenseId);
  }

  @Post(":expenseId/approve")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Approve an expense awaiting policy approval" })
  approve(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
  ): Promise<ExpenseSummary> {
    return this.expenses.approve(actor, workspaceId, expenseId);
  }

  @Post(":expenseId/reverse")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Reverse a mistaken expense (soft void) — posts reversing journal when posted",
  })
  reverse(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Body(new ZodValidationPipe(reverseExpenseRequestSchema))
    _body: ReverseExpenseRequestInput,
  ): Promise<ExpenseSummary> {
    return this.expenses.reverse(actor, workspaceId, expenseId);
  }

  @Post(":expenseId/revise")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Reverse then recreate expense in one request (corrected replacement)",
  })
  revise(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Body(new ZodValidationPipe(reviseExpenseRequestSchema))
    body: ReviseExpenseRequestInput,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<{ reversed: ExpenseSummary; created: ExpenseSummary }> {
    return this.expenses.revise(
      actor,
      workspaceId,
      expenseId,
      {
        ...body,
        workspaceId: body.workspaceId ?? workspaceId,
      },
      reply,
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "List expenses in a workspace (optional visibility/status/date filters)",
  })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(expenseListQuerySchema)) query: ExpenseListQuery,
  ): Promise<ExpenseSummary[]> {
    return this.expenses.list(actor, workspaceId, query);
  }
}
