import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { PersonalFinanceModule } from "../personal-finance/personal-finance.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { WaveFSettingsModule } from "../wave-f-settings/wave-f-settings.module.js";
import { ChartsController } from "./charts.controller.js";
import { ChartsService } from "./charts.service.js";

@Module({
  imports: [
    AuthModule,
    IamModule,
    ExpensesModule,
    AnalyticsModule,
    PersonalFinanceModule,
    ReportsModule,
    WaveFSettingsModule,
  ],
  controllers: [ChartsController],
  providers: [ChartsService],
  exports: [ChartsService],
})
export class ChartsModule {}
