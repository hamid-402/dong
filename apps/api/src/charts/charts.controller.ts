import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, ChartSeriesResponse, KindChartsAggregateResponse } from "@dang/contracts";
import {
  chartBudgetBurnQuerySchema,
  chartKindAggregateQuerySchema,
  chartMonthsQuerySchema,
  chartRangeQuerySchema,
  reportViewKindSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ChartsService } from "./charts.service.js";

@ApiTags("charts")
@Controller()
@UseGuards(AuthGuard)
export class ChartsController {
  constructor(@Inject(ChartsService) private readonly charts: ChartsService) {}

  @Get("workspaces/:workspaceId/charts/expense-trend")
  @ApiOperation({ summary: "Workspace expense trend by month (S11-11)" })
  expenseTrend(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(chartMonthsQuerySchema))
    query: { months?: number },
  ): Promise<ChartSeriesResponse> {
    return this.charts.expenseTrend(actor, workspaceId, query.months);
  }

  @Get("workspaces/:workspaceId/charts/member-share")
  @ApiOperation({ summary: "Member share mix in range (S11-11)" })
  memberShare(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(chartRangeQuerySchema))
    query: { from?: string; to?: string },
  ): Promise<ChartSeriesResponse> {
    return this.charts.memberShare(actor, workspaceId, query.from, query.to);
  }

  @Get("workspaces/:workspaceId/charts/category-mix")
  @ApiOperation({ summary: "Category mix in range (S11-11)" })
  categoryMix(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(chartRangeQuerySchema))
    query: { from?: string; to?: string },
  ): Promise<ChartSeriesResponse> {
    return this.charts.categoryMix(actor, workspaceId, query.from, query.to);
  }

  @Get("workspaces/:workspaceId/charts/balance-over-time")
  @ApiOperation({ summary: "Outstanding balance over time (S11-11)" })
  balanceOverTime(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(chartRangeQuerySchema))
    query: { from?: string; to?: string },
  ): Promise<ChartSeriesResponse> {
    return this.charts.balanceOverTime(actor, workspaceId, query.from, query.to);
  }

  @Get("personal/charts/income-vs-expense")
  @ApiOperation({ summary: "Personal income vs expense (S11-11)" })
  incomeVsExpense(
    @CurrentActor() actor: AuthActor,
    @Query(new ZodValidationPipe(chartMonthsQuerySchema))
    query: { months?: number },
  ): Promise<ChartSeriesResponse> {
    return this.charts.incomeVsExpense(actor, query.months);
  }

  @Get("personal/charts/budget-burn")
  @ApiOperation({ summary: "Personal budget burn for a month (S11-11)" })
  budgetBurn(
    @CurrentActor() actor: AuthActor,
    @Query(new ZodValidationPipe(chartBudgetBurnQuerySchema))
    query: { yearMonth?: string },
  ): Promise<ChartSeriesResponse> {
    return this.charts.budgetBurn(actor, query.yearMonth);
  }

  @Get("personal/charts/goal-progress")
  @ApiOperation({ summary: "Savings goal progress (S11-11)" })
  goalProgress(@CurrentActor() actor: AuthActor): Promise<ChartSeriesResponse> {
    return this.charts.goalProgress(actor);
  }

  @Get("me/charts/kind/:kind")
  @ApiOperation({ summary: "Cross-workspace chart aggregate for a space kind (G07)" })
  kindAggregate(
    @CurrentActor() actor: AuthActor,
    @Param("kind") kindRaw: string,
    @Query(new ZodValidationPipe(chartKindAggregateQuerySchema))
    query: { months?: number },
  ): Promise<KindChartsAggregateResponse> {
    const parsed = reportViewKindSchema.safeParse(kindRaw);
    if (!parsed.success) {
      throw new BadRequestException({ detail: "kind نامعتبر است" });
    }
    return this.charts.kindAggregate(actor, parsed.data, query.months);
  }
}
