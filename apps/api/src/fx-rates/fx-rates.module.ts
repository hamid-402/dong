import { Body, Controller, ForbiddenException, Get, Injectable, Module, Post, UseGuards } from "@nestjs/common";
import { createDatabase, desc, fxRate, type AppDatabase } from "@dang/db";
import { createFxRateSchema, readProductFeatureFlags, type CreateFxRateRequest, type FxRateSummary } from "@dang/contracts";
import { AuthModule } from "../auth/auth.module.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

const map = (r: typeof fxRate.$inferSelect): FxRateSummary => ({
  id:r.id,baseCurrency:r.baseCurrency,quoteCurrency:r.quoteCurrency,rate:r.rateNumeric,
  asOf:r.asOf,source:r.source,createdAt:r.createdAt.toISOString(),
});
@Injectable()
class FxRatesService {
  private readonly db?: AppDatabase;
  constructor(){if(process.env.DATABASE_URL)this.db=createDatabase(process.env.DATABASE_URL).db;}
  async list(){if(!this.db)return [];return (await this.db.select().from(fxRate).orderBy(desc(fxRate.asOf))).map(map);}
  async create(input:CreateFxRateRequest){
    if(!readProductFeatureFlags(process.env).fxRates)throw new ForbiddenException({detail:"Set ENABLE_FX_RATES=1"});
    if(!this.db)throw new ForbiddenException({detail:"FX rates require Postgres persistence"});
    const rows=await this.db.insert(fxRate).values({baseCurrency:input.baseCurrency,quoteCurrency:input.quoteCurrency,rateNumeric:input.rate,asOf:input.asOf,source:input.source}).onConflictDoUpdate({target:[fxRate.baseCurrency,fxRate.quoteCurrency,fxRate.asOf],set:{rateNumeric:input.rate,source:input.source}}).returning();
    return map(rows[0]!);
  }
  convertPreview():never{throw new ForbiddenException({type:"https://dang.local/problems/fx-conversion-not-live",title:"FX_CONVERSION_NOT_LIVE",status:403});}
}
@Controller("fx-rates") @UseGuards(AuthGuard)
class FxRatesController{
  constructor(private service:FxRatesService){}
  @Get() list(){return this.service.list();}
  @Post() create(@Body(new ZodValidationPipe(createFxRateSchema))b:CreateFxRateRequest){return this.service.create(b);}
}
@Module({imports:[AuthModule],controllers:[FxRatesController],providers:[FxRatesService]})
export class FxRatesModule{}
