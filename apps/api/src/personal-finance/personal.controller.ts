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
  createMoneyIntentRequestSchema,
  createSavingsGoalContributionRequestSchema,
  createSavingsGoalRequestSchema,
  depositPersonalSavingsFundRequestSchema,
  ensurePersonalSavingsFundRequestSchema,
  putSpendingAlertsRequestSchema,
  recomputeMonthlyCloseRequestSchema,
  updateIncomeSourceRequestSchema,
  updateMoneyIntentRequestSchema,
  updateSavingsGoalRequestSchema,
  type AuthActor,
  type CreateIncomeSourceRequest,
  type CreateMoneyIntentRequest,
  type CreateSavingsGoalContributionRequest,
  type CreateSavingsGoalRequest,
  type DepositPersonalSavingsFundRequest,
  type EnsurePersonalSavingsFundRequest,
  type IncomeSourceSummary,
  type MoneyIntentSummary,
  type MonthlyCloseSummary,
  type PersonalFinanceOverviewResponse,
  type PersonalSavingsFundSummary,
  type PutSpendingAlertsRequest,
  type SavingsGoalContributionSummary,
  type SavingsGoalSummary,
  type SpendingAlertSummary,
  type UpdateIncomeSourceRequest,
  type UpdateMoneyIntentRequest,
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


  @Get("money-intents")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List configurable money intents/rules (alias)" })
  listMoneyIntents(@CurrentActor() actor: AuthActor): Promise<MoneyIntentSummary[]> {
    return this.finance.listMoneyIntents(actor);
  }

  @Post("money-intents")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create money intent (alias)" })
  createMoneyIntent(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createMoneyIntentRequestSchema))
    body: CreateMoneyIntentRequest,
  ): Promise<MoneyIntentSummary> {
    return this.finance.createMoneyIntent(actor, body);
  }

  @Patch("money-intents/:iid")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Update money intent (alias)" })
  updateMoneyIntent(
    @CurrentActor() actor: AuthActor,
    @Param("iid") iid: string,
    @Body(new ZodValidationPipe(updateMoneyIntentRequestSchema))
    body: UpdateMoneyIntentRequest,
  ): Promise<MoneyIntentSummary> {
    return this.finance.updateMoneyIntent(actor, iid, body);
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

  @Get("savings-fund")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Personal savings fund — live balance from goal contributions",
  })
  getSavingsFund(
    @CurrentActor() actor: AuthActor,
  ): Promise<PersonalSavingsFundSummary> {
    return this.finance.getSavingsFundSummary(actor);
  }

  @Post("savings-fund/ensure-default")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Ensure default «صندوق پس‌انداز» goal exists (idempotent)",
  })
  ensureSavingsFund(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(ensurePersonalSavingsFundRequestSchema))
    body: EnsurePersonalSavingsFundRequest,
  ): Promise<{ created: boolean; fund: PersonalSavingsFundSummary }> {
    return this.finance.ensureDefaultSavingsFund(actor, body);
  }

  @Post("savings-fund/deposit")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Deposit into personal savings fund (creates default box if needed)",
  })
  depositSavingsFund(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(depositPersonalSavingsFundRequestSchema))
    body: DepositPersonalSavingsFundRequest,
  ): Promise<{
    fund: PersonalSavingsFundSummary;
    goal: SavingsGoalSummary;
    contribution: SavingsGoalContributionSummary;
  }> {
    return this.finance.depositToSavingsFund(actor, body);
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
