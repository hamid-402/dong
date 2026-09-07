import { Body, Controller, ForbiddenException, Get, Headers, Injectable, Module, Param, Post, Put, UseGuards } from "@nestjs/common";
import { createDatabase, eq, membership, sql, userAccount, userNotificationPref, withTenantContext, workspacePlan, type AppDatabase } from "@dang/db";
import { readProductFeatureFlags, updateNotificationPreferenceSchema, updateWorkspacePlanSchema, type AuthActor, type NotificationPreferenceSummary, type WorkspacePlanSummary } from "@dang/contracts";
import { AuthModule } from "../auth/auth.module.js";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { MailerService } from "../auth/mailer.service.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { IamModule } from "../iam/iam.module.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";

@Injectable()
class WaveFSettingsService {
  private readonly db?: AppDatabase;
  private readonly prefs = new Map<string, NotificationPreferenceSummary>();
  private readonly plans = new Map<string, WorkspacePlanSummary>();
  constructor(private access:WorkspaceAccessService,private mailer:MailerService){if(process.env.DATABASE_URL)this.db=createDatabase(process.env.DATABASE_URL).db;}
  async getPref(userId:string):Promise<NotificationPreferenceSummary>{
    if(!this.db)return this.prefs.get(userId)??{emailDigest:"off"};
    return this.db.transaction(async tx=>{await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);const rows=await tx.select().from(userNotificationPref).where(eq(userNotificationPref.userId,userId)).limit(1);return rows[0]?{emailDigest:rows[0].emailDigest as "off"|"weekly"|"monthly",updatedAt:rows[0].updatedAt.toISOString()}:{emailDigest:"off"};});
  }
  async putPref(userId:string,emailDigest:"off"|"weekly"|"monthly"){
    if(!readProductFeatureFlags(process.env).weeklyDigest)throw new ForbiddenException({detail:"Set ENABLE_WEEKLY_DIGEST=1"});
    if(!this.db){const row={emailDigest,updatedAt:new Date().toISOString()};this.prefs.set(userId,row);return row;}
    return this.db.transaction(async tx=>{await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);const rows=await tx.insert(userNotificationPref).values({userId,emailDigest}).onConflictDoUpdate({target:userNotificationPref.userId,set:{emailDigest,updatedAt:new Date()}}).returning();return{emailDigest:rows[0]!.emailDigest as "off"|"weekly"|"monthly",updatedAt:rows[0]!.updatedAt.toISOString()};});
  }
  async getPlan(actor:AuthActor,w:string):Promise<WorkspacePlanSummary>{
    await this.access.requireMember(w,actor.userId);
    if(!this.db)return this.plans.get(w)??{workspaceId:w,plan:"free",seatsLimit:null,features:[]};
    return withTenantContext(this.db,{workspaceId:w,userId:actor.userId},async tx=>{const rows=await tx.select().from(workspacePlan).where(eq(workspacePlan.workspaceId,w)).limit(1);const r=rows[0];return r?{workspaceId:w,plan:r.plan as "free"|"pro"|"business",seatsLimit:r.seatsLimit,features:r.featuresJson?JSON.parse(r.featuresJson) as string[]:[],updatedAt:r.updatedAt.toISOString()}:{workspaceId:w,plan:"free",seatsLimit:null,features:[]};});
  }
  async putPlan(actor:AuthActor,w:string,input:{plan:"free"|"pro"|"business";seatsLimit?:number|null;features?:string[]}){
    const flags=readProductFeatureFlags(process.env);const role=await this.access.requireMemberRole(w,actor.userId);
    if(!flags.planAdmin&&!(flags.workspacePlans&&role==="owner"))throw new ForbiddenException({detail:"Workspace plan administration is disabled"});
    const row={workspaceId:w,plan:input.plan,seatsLimit:input.seatsLimit??null,features:input.features??[],updatedAt:new Date().toISOString()};
    if(!this.db){this.plans.set(w,row);return row;}
    return withTenantContext(this.db,{workspaceId:w,userId:actor.userId},async tx=>{const rows=await tx.insert(workspacePlan).values({workspaceId:w,plan:input.plan,seatsLimit:row.seatsLimit,featuresJson:JSON.stringify(row.features)}).onConflictDoUpdate({target:workspacePlan.workspaceId,set:{plan:input.plan,seatsLimit:row.seatsLimit,featuresJson:JSON.stringify(row.features),updatedAt:new Date()}}).returning();return{...row,updatedAt:rows[0]!.updatedAt.toISOString()};});
  }
  async weeklyTick(){
    if(!readProductFeatureFlags(process.env).weeklyDigest)throw new ForbiddenException({detail:"Set ENABLE_WEEKLY_DIGEST=1"});
    if(!this.db)return{eligible:0,sent:0,detail:"Postgres is required for digest recipient discovery"};
    return this.db.transaction(async tx=>{await tx.execute(sql`select set_config('app.internal_job','1',true)`);const prefs=await tx.select().from(userNotificationPref).where(eq(userNotificationPref.emailDigest,"weekly"));let sent=0;for(const pref of prefs){await tx.execute(sql`select set_config('app.user_id',${pref.userId},true)`);const users=await tx.select().from(userAccount).where(eq(userAccount.id,pref.userId)).limit(1);const user=users[0];if(!user?.email)continue;const spaces=await tx.select().from(membership).where(eq(membership.userId,pref.userId));const result=this.mailer.send({to:user.email,subject:"خلاصه هفتگی دنگ",text:`تعداد فضاهای کاری فعال شما: ${spaces.filter(space=>!space.disabledAt).length}`});if(result.delivered)sent+=1;}return{eligible:prefs.length,sent};});
  }
}
@Controller()
class WaveFSettingsController{
  constructor(private service:WaveFSettingsService){}
  @Get("me/notification-prefs") @UseGuards(AuthGuard) getPref(@CurrentActor()a:AuthActor){return this.service.getPref(a.userId);}
  @Put("me/notification-prefs") @UseGuards(AuthGuard) putPref(@CurrentActor()a:AuthActor,@Body(new ZodValidationPipe(updateNotificationPreferenceSchema))b:{emailDigest:"off"|"weekly"|"monthly"}){return this.service.putPref(a.userId,b.emailDigest);}
  @Get("workspaces/:workspaceId/plan") @UseGuards(AuthGuard) getPlan(@CurrentActor()a:AuthActor,@Param("workspaceId")w:string){return this.service.getPlan(a,w);}
  @Put("workspaces/:workspaceId/plan") @UseGuards(AuthGuard) putPlan(@CurrentActor()a:AuthActor,@Param("workspaceId")w:string,@Body(new ZodValidationPipe(updateWorkspacePlanSchema))b:{plan:"free"|"pro"|"business";seatsLimit?:number|null;features?:string[]}){return this.service.putPlan(a,w,b);}
  @Post("system/digest/weekly-tick") tick(@Headers("x-dang-internal-job")token?:string){if(!process.env.DANG_INTERNAL_JOB_TOKEN||token!==process.env.DANG_INTERNAL_JOB_TOKEN)throw new ForbiddenException();return this.service.weeklyTick();}
}
@Module({imports:[AuthModule,IamModule],controllers:[WaveFSettingsController],providers:[WaveFSettingsService]})
export class WaveFSettingsModule{}
