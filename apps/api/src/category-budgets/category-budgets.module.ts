import { Body, Controller, ForbiddenException, Get, Inject, Injectable, Module, Param, Post, UseGuards } from "@nestjs/common";
import { and, categoryBudget, createDatabase, eq, expense, gte, lt, withTenantContext, type AppDatabase } from "@dang/db";
import { createCategoryBudgetSchema, readProductFeatureFlags, type AuthActor, type CategoryBudgetUsage, type CreateCategoryBudgetRequest } from "@dang/contracts";
import { AuthModule } from "../auth/auth.module.js";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { IamModule } from "../iam/iam.module.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";

const STORE = Symbol("CATEGORY_BUDGET_STORE");
type Store = { list(w:string,u:string):Promise<CategoryBudgetUsage[]>; create(w:string,u:string,b:CreateCategoryBudgetRequest):Promise<CategoryBudgetUsage> };
class PostgresStore implements Store {
  constructor(private db: AppDatabase) {}
  async list(w:string,u:string) { return withTenantContext(this.db,{workspaceId:w,userId:u},async tx => {
    const rows=await tx.select().from(categoryBudget).where(eq(categoryBudget.workspaceId,w));
    return Promise.all(rows.map(async r => {
      const start=`${r.yearMonth}-01`; const d=new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth()+1); const end=d.toISOString().slice(0,10);
      const costs=await tx.select().from(expense).where(and(eq(expense.workspaceId,w),eq(expense.categoryId,r.categoryId),eq(expense.status,"posted"),gte(expense.occurredOn,start),lt(expense.occurredOn,end)));
      const spent=costs.reduce((n,e)=>n+e.totalMinor,0n); const remaining=r.limitMinor>spent?r.limitMinor-spent:0n;
      return { id:r.id,workspaceId:w,categoryId:r.categoryId,yearMonth:r.yearMonth,limit:{amountMinor:r.limitMinor.toString(),currency:"IRR" as const},alertPct:r.alertPct,active:r.active,createdByUserId:r.createdByUserId,createdAt:r.createdAt.toISOString(),spent:{amountMinor:spent.toString(),currency:"IRR" as const},remaining:{amountMinor:remaining.toString(),currency:"IRR" as const},alertReached:spent*100n>=r.limitMinor*BigInt(r.alertPct) };
    }));
  });}
  async create(w:string,u:string,b:CreateCategoryBudgetRequest) { await withTenantContext(this.db,{workspaceId:w,userId:u},tx=>tx.insert(categoryBudget).values({workspaceId:w,categoryId:b.categoryId,yearMonth:b.yearMonth,limitMinor:BigInt(b.limitMinor),alertPct:b.alertPct,idempotencyKey:b.idempotencyKey,createdByUserId:u}).onConflictDoNothing()); return (await this.list(w,u)).find(x=>x.categoryId===b.categoryId&&x.yearMonth===b.yearMonth)!; }
}
class MemoryStore implements Store {
  private rows: CategoryBudgetUsage[]=[];
  async list(w:string){return this.rows.filter(x=>x.workspaceId===w);}
  async create(w:string,u:string,b:CreateCategoryBudgetRequest){const old=this.rows.find(x=>x.workspaceId===w&&x.categoryId===b.categoryId&&x.yearMonth===b.yearMonth);if(old)return old;const row={id:crypto.randomUUID(),workspaceId:w,categoryId:b.categoryId,yearMonth:b.yearMonth,limit:{amountMinor:b.limitMinor,currency:"IRR" as const},alertPct:b.alertPct,active:true,createdByUserId:u,createdAt:new Date().toISOString(),spent:{amountMinor:"0",currency:"IRR" as const},remaining:{amountMinor:b.limitMinor,currency:"IRR" as const},alertReached:false};this.rows.push(row);return row;}
}
@Injectable()
class Service {
  constructor(@Inject(STORE) private store:Store,private access:WorkspaceAccessService){}
  private enabled(){if(!readProductFeatureFlags(process.env).categoryBudget)throw new ForbiddenException({detail:"Set ENABLE_CATEGORY_BUDGET=1"});}
  async list(a:AuthActor,w:string){this.enabled();await this.access.requireMember(w,a.userId);return this.store.list(w,a.userId);}
  async create(a:AuthActor,w:string,b:CreateCategoryBudgetRequest){this.enabled();await this.access.requireFinanceManager(w,a.userId);return this.store.create(w,a.userId,b);}
}
@Controller("workspaces/:workspaceId/category-budgets") @UseGuards(AuthGuard)
class CategoryBudgetsController {
  constructor(private service:Service){}
  @Get() list(@CurrentActor()a:AuthActor,@Param("workspaceId")w:string){return this.service.list(a,w);}
  @Get("usage") usage(@CurrentActor()a:AuthActor,@Param("workspaceId")w:string){return this.service.list(a,w);}
  @Post() create(@CurrentActor()a:AuthActor,@Param("workspaceId")w:string,@Body(new ZodValidationPipe(createCategoryBudgetSchema))b:CreateCategoryBudgetRequest){return this.service.create(a,w,b);}
}
@Module({imports:[AuthModule,IamModule],controllers:[CategoryBudgetsController],providers:[Service,{provide:STORE,useFactory:():Store=>process.env.DATABASE_URL?new PostgresStore(createDatabase(process.env.DATABASE_URL).db):new MemoryStore()}]})
export class CategoryBudgetsModule {}
