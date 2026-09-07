import { Injectable, Module } from "@nestjs/common";
import { and, approvalWorkflowStep, createDatabase, eq, withTenantContext, type AppDatabase } from "@dang/db";
import { readProductFeatureFlags, type ApprovalWorkflowStepSummary } from "@dang/contracts";
import { IamModule } from "../iam/iam.module.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { Inject } from "@nestjs/common";

const map=(r:typeof approvalWorkflowStep.$inferSelect):ApprovalWorkflowStepSummary=>({id:r.id,workspaceId:r.workspaceId,expenseId:r.expenseId,stepNo:r.stepNo,approverUserId:r.approverUserId,status:r.status as ApprovalWorkflowStepSummary["status"],decidedAt:r.decidedAt?.toISOString(),note:r.note??undefined,createdAt:r.createdAt.toISOString()});
@Injectable()
export class ApprovalStepsService{
  private db?:AppDatabase;private rows:ApprovalWorkflowStepSummary[]=[];
  constructor(@Inject(IAM_STORE)private iam:IamStore){if(process.env.DATABASE_URL)this.db=createDatabase(process.env.DATABASE_URL).db;}
  async createFirst(workspaceId:string,expenseId:string,actorUserId:string){
    if(!readProductFeatureFlags(process.env).approvalSteps)return null;
    const members=await this.iam.listMembers(workspaceId,actorUserId)??[];
    const approver=members.filter(m=>["owner","admin","finance","approver"].includes(m.role)).sort((a,b)=>a.userId.localeCompare(b.userId))[0];
    if(!approver)return null;
    if(!this.db){const old=this.rows.find(r=>r.expenseId===expenseId&&r.stepNo===1);if(old)return old;const row={id:crypto.randomUUID(),workspaceId,expenseId,stepNo:1,approverUserId:approver.userId,status:"pending" as const,createdAt:new Date().toISOString()};this.rows.push(row);return row;}
    return withTenantContext(this.db,{workspaceId,userId:actorUserId},async tx=>{await tx.insert(approvalWorkflowStep).values({workspaceId,expenseId,stepNo:1,approverUserId:approver.userId}).onConflictDoNothing();const r=await tx.select().from(approvalWorkflowStep).where(and(eq(approvalWorkflowStep.expenseId,expenseId),eq(approvalWorkflowStep.stepNo,1))).limit(1);return r[0]?map(r[0]):null;});
  }
  async approve(workspaceId:string,expenseId:string,actorUserId:string){
    if(!readProductFeatureFlags(process.env).approvalSteps)return;
    if(!this.db){const row=this.rows.find(r=>r.expenseId===expenseId&&r.status==="pending");if(row&&row.approverUserId===actorUserId){row.status="approved";row.decidedAt=new Date().toISOString();}return;}
    await withTenantContext(this.db,{workspaceId,userId:actorUserId},tx=>tx.update(approvalWorkflowStep).set({status:"approved",decidedAt:new Date()}).where(and(eq(approvalWorkflowStep.workspaceId,workspaceId),eq(approvalWorkflowStep.expenseId,expenseId),eq(approvalWorkflowStep.approverUserId,actorUserId),eq(approvalWorkflowStep.status,"pending"))));
  }
  async pending(workspaceId:string,actorUserId:string){
    if(!readProductFeatureFlags(process.env).approvalSteps)return[];
    if(!this.db)return this.rows.filter(r=>r.workspaceId===workspaceId&&r.status==="pending"&&r.approverUserId===actorUserId);
    return withTenantContext(this.db,{workspaceId,userId:actorUserId},async tx=>(await tx.select().from(approvalWorkflowStep).where(and(eq(approvalWorkflowStep.workspaceId,workspaceId),eq(approvalWorkflowStep.status,"pending"),eq(approvalWorkflowStep.approverUserId,actorUserId)))).map(map));
  }
}
@Module({imports:[IamModule],providers:[ApprovalStepsService],exports:[ApprovalStepsService]})
export class ApprovalStepsModule{}
