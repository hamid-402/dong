import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createIncomeSourceRequestSchema,
  createSavingsGoalContributionRequestSchema,
  createSavingsGoalRequestSchema,
  putSpendingAlertsRequestSchema,
  recomputeMonthlyCloseRequestSchema,
  updateIncomeSourceRequestSchema,
  updateSavingsGoalRequestSchema,
  type AuthActor,
  type CreateIncomeSourceRequest,
  type CreateSavingsGoalContributionRequest,
  type CreateSavingsGoalRequest,
  type IncomeSourceSummary,
  type MonthlyCloseSummary,
  type PersonalFinanceOverviewResponse,
  type PutSpendingAlertsRequest,
  type SavingsGoalContributionSummary,
  type SavingsGoalSummary,
  type SpendingAlertSummary,
  type UpdateIncomeSourceRequest,
  type UpdateSavingsGoalRequest,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PersonalFinanceService } from "./personal-finance.service.js";

/** S11-10 surface at `/personal/*` (additive alias of `/me/finance/*` depth routes). */
@ApiTags("personal")
@Controller("personal")
export class PersonalController {
  constructor(
    @Inject(PersonalFinanceService) private readonly finance: PersonalFinanceService,
  ) {}

  @Get("overview")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Personal finance overview with scope (S11-10)" })
  overview(
    @CurrentActor() actor: AuthActor,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("scope") scope?: string,
  ): Promise<PersonalFinanceOverviewResponse> {
    return this.finance.overview(actor, from, to, scope);
  }

  @Get("income-sources")
  @UseGuards(AuthGuard)
  listIncomeSources(@CurrentActor() actor: AuthActor): Promise<IncomeSourceSummary[]> {
    return this.finance.listIncomeSources(actor);
  }

  @Post("income-sources")
  @UseGuards(AuthGuard)
  createIncomeSource(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createIncomeSourceRequestSchema))
    body: CreateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return this.finance.createIncomeSource(actor, body);
  }

  @Patch("income-sources/:sid")
  @UseGuards(AuthGuard)
  updateIncomeSource(
    @CurrentActor() actor: AuthActor,
    @Param("sid") sid: string,
    @Body(new ZodValidationPipe(updateIncomeSourceRequestSchema))
    body: UpdateIncomeSourceRequest,
  ): Promise<IncomeSourceSummary> {
    return this.finance.updateIncomeSource(actor, sid, body);
  }

  @Get("savings-goals")
  @UseGuards(AuthGuard)
  listSavingsGoals(@CurrentActor() actor: AuthActor): Promise<SavingsGoalSummary[]> {
    return this.finance.listSavingsGoals(actor);
  }

  @Post("savings-goals")
  @UseGuards(AuthGuard)
  createSavingsGoal(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createSavingsGoalRequestSchema))
    body: CreateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return this.finance.createSavingsGoal(actor, body);
  }

  @Patch("savings-goals/:gid")
  @UseGuards(AuthGuard)
  updateSavingsGoal(
    @CurrentActor() actor: AuthActor,
    @Param("gid") gid: string,
    @Body(new ZodValidationPipe(updateSavingsGoalRequestSchema))
    body: UpdateSavingsGoalRequest,
  ): Promise<SavingsGoalSummary> {
    return this.finance.updateSavingsGoal(actor, gid, body);
  }

  @Post("savings-goals/:gid/contributions")
  @UseGuards(AuthGuard)
  addGoalContribution(
    @CurrentActor() actor: AuthActor,
    @Param("gid") gid: string,
    @Body(new ZodValidationPipe(createSavingsGoalContributionRequestSchema))
    body: CreateSavingsGoalContributionRequest,
  ): Promise<{
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    return this.finance.addGoalContribution(actor, gid, body);
  }

  @Get("alerts")
  @UseGuards(AuthGuard)
  listAlerts(@CurrentActor() actor: AuthActor): Promise<SpendingAlertSummary[]> {
    return this.finance.listAlerts(actor);
  }

  @Put("alerts")
  @UseGuards(AuthGuard)
  putAlerts(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(putSpendingAlertsRequestSchema))
    body: PutSpendingAlertsRequest,
  ): Promise<SpendingAlertSummary[]> {
    return this.finance.putAlerts(actor, body);
  }

  @Get("monthly-close")
  @UseGuards(AuthGuard)
  getMonthlyClose(
    @CurrentActor() actor: AuthActor,
    @Query("yearMonth") yearMonth?: string,
  ): Promise<MonthlyCloseSummary> {
    return this.finance.getMonthlyClose(actor, yearMonth);
  }

  @Post("monthly-close/recompute")
  @UseGuards(AuthGuard)
  recomputeMonthlyClose(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(recomputeMonthlyCloseRequestSchema))
    body: { yearMonth: string },
  ): Promise<MonthlyCloseSummary> {
    return this.finance.recomputeMonthlyClose(actor, body.yearMonth);
  }
}
