import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { ReportsController } from "./reports.controller.js";
import { createReportsStore, REPORTS_STORE, type ReportsStore } from "./reports.store.js";

@Module({
  imports: [AuthModule, IamModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: REPORTS_STORE,
      inject: [EXPENSE_STORE],
      useFactory: (expenses: ExpenseStore): ReportsStore =>
        createReportsStore(async (workspaceId, actorUserId) => {
          const list = await expenses.listForWorkspace(workspaceId, actorUserId);
          return list.map((e) => ({
            id: e.id,
            title: e.title,
            occurredOn: e.occurredOn,
            total: e.total,
            visibility: e.visibility,
            categoryId: e.categoryId,
            status: e.status,
          }));
        }),
    },
  ],
  exports: [REPORTS_STORE],
})
export class ReportsModule {}
