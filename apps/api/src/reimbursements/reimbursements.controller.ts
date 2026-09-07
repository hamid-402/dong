import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { createReimbursementSchema, reimbursementDecisionSchema, type AuthActor, type CreateReimbursementRequest } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ReimbursementsService } from "./reimbursements.service.js";

@Controller("workspaces/:workspaceId/reimbursements")
@UseGuards(AuthGuard)
export class ReimbursementsController {
  constructor(private readonly service: ReimbursementsService) {}
  @Get() list(@CurrentActor() actor: AuthActor, @Param("workspaceId") workspaceId: string) { return this.service.list(actor, workspaceId); }
  @Post() create(@CurrentActor() actor: AuthActor, @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createReimbursementSchema)) body: CreateReimbursementRequest) {
    return this.service.create(actor, workspaceId, body);
  }
  @Post(":id/submit") submit(@CurrentActor() a: AuthActor, @Param("workspaceId") w: string, @Param("id") id: string) { return this.service.transition(a,w,id,"submit"); }
  @Post(":id/approve") approve(@CurrentActor() a: AuthActor, @Param("workspaceId") w: string, @Param("id") id: string,
    @Body(new ZodValidationPipe(reimbursementDecisionSchema)) b: {note?: string}) { return this.service.transition(a,w,id,"approve",b.note); }
  @Post(":id/reject") reject(@CurrentActor() a: AuthActor, @Param("workspaceId") w: string, @Param("id") id: string,
    @Body(new ZodValidationPipe(reimbursementDecisionSchema)) b: {note?: string}) { return this.service.transition(a,w,id,"reject",b.note); }
  @Post(":id/mark-paid") paid(@CurrentActor() a: AuthActor, @Param("workspaceId") w: string, @Param("id") id: string) { return this.service.transition(a,w,id,"paid"); }
  @Post(":id/cancel") cancel(@CurrentActor() a: AuthActor, @Param("workspaceId") w: string, @Param("id") id: string) { return this.service.transition(a,w,id,"cancel"); }
}
