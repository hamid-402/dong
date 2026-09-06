import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BalancesModule } from "../balances/balances.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { SettlementsModule } from "../settlements/settlements.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [
    AuthModule,
    ExpensesModule,
    SettlementsModule,
    NotificationsModule,
    BalancesModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
