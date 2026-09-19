import { Body, Controller, Get, Inject, Param, Put, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateExpenseTagRequest,
  ExpenseTagSummary,
  SetExpenseTagsRequest,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ExpenseTagsService } from "./expense-tags.service.js";

@ApiTags("expense-tags")
@Controller("workspaces/:workspaceId")
export class ExpenseTagsController {
  constructor(@Inject(ExpenseTagsService) private readonly tags: ExpenseTagsService) {}

  @Get("expense-tags")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List workspace expense tags" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ExpenseTagSummary[]> {
    return this.tags.list(actor, workspaceId);
  }

  @Post("expense-tags")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create an expense tag" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateExpenseTagRequest,
  ): Promise<ExpenseTagSummary> {
    return this.tags.create(actor, workspaceId, body);
  }

  @Put("expenses/:expenseId/tags")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Replace tags on an expense" })
  setTags(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("expenseId") expenseId: string,
    @Body() body: SetExpenseTagsRequest,
  ): Promise<{ tagIds: string[] }> {
    return this.tags.setExpenseTags(actor, workspaceId, expenseId, body);
  }
}
