import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AgreementSummary,
  AuthActor,
  ContributionSummary,
  CreateAgreementRequest,
  CreatePeriodLockRequest,
  MemberAccountReport,
  OwnershipShareSummary,
  PartnerLoanSummary,
  PeriodLockSummary,
  RecordContributionRequest,
  RecordPartnerLoanRequest,
  RecordWithdrawalRequest,
  ReportExportPayload,
  WithdrawalSummary,
} from "@dang/contracts";
import {
  createAgreementRequestSchema,
  createPeriodLockRequestSchema,
  recordContributionRequestSchema,
  recordPartnerLoanRequestSchema,
  recordWithdrawalRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PartnershipService } from "./partnership.service.js";

@ApiTags("partnership")
@Controller("workspaces/:workspaceId")
export class PartnershipController {
  constructor(@Inject(PartnershipService) private readonly partnership: PartnershipService) {}

  @Post("agreements")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create partnership agreement (Phase 4)" })
  createAgreement(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createAgreementRequestSchema)) body: CreateAgreementRequest,
  ): Promise<AgreementSummary> {
    return this.partnership.createAgreement(actor, workspaceId, body);
  }

  @Get("agreements")
  @UseGuards(AuthGuard)
  listAgreements(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<AgreementSummary[]> {
    return this.partnership.listAgreements(actor, workspaceId);
  }

  @Post("contributions")
  @UseGuards(AuthGuard)
  recordContribution(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(recordContributionRequestSchema))
    body: RecordContributionRequest,
  ): Promise<ContributionSummary> {
    return this.partnership.recordContribution(actor, workspaceId, body);
  }

  @Post("partner-loans")
  @UseGuards(AuthGuard)
  recordLoan(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(recordPartnerLoanRequestSchema))
    body: RecordPartnerLoanRequest,
  ): Promise<PartnerLoanSummary> {
    return this.partnership.recordLoan(actor, workspaceId, body);
  }

  @Post("withdrawals")
  @UseGuards(AuthGuard)
  recordWithdrawal(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(recordWithdrawalRequestSchema))
    body: RecordWithdrawalRequest,
  ): Promise<WithdrawalSummary> {
    return this.partnership.recordWithdrawal(actor, workspaceId, body);
  }

  @Get("agreements/:agreementId/ownership-shares")
  @UseGuards(AuthGuard)
  ownershipShares(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("agreementId") agreementId: string,
  ): Promise<OwnershipShareSummary[]> {
    return this.partnership.ownershipShares(actor, workspaceId, agreementId);
  }

  @Get("reports/members/:memberUserId")
  @UseGuards(AuthGuard)
  memberReport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("memberUserId") memberUserId: string,
  ): Promise<MemberAccountReport> {
    return this.partnership.memberReport(actor, workspaceId, memberUserId);
  }

  @Get("reports/members/:memberUserId/export")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Export member account report as Excel-compatible CSV" })
  exportMemberReport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("memberUserId") memberUserId: string,
  ): Promise<ReportExportPayload> {
    return this.partnership.exportMemberReport(actor, workspaceId, memberUserId);
  }

  @Post("period-locks")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Lock an accounting period (blocks new partnership entries)" })
  createPeriodLock(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPeriodLockRequestSchema))
    body: CreatePeriodLockRequest,
  ): Promise<PeriodLockSummary> {
    return this.partnership.createPeriodLock(actor, workspaceId, body);
  }

  @Get("period-locks")
  @UseGuards(AuthGuard)
  listPeriodLocks(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<PeriodLockSummary[]> {
    return this.partnership.listPeriodLocks(actor, workspaceId);
  }
}
