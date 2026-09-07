import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { resolveExpenseListOptions } from "../expenses/expense-list-options.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { RecurrenceRunGuard } from "./recurrence-run.guard.js";
import { ReportsController } from "./reports.controller.js";
import { createReportsStore, REPORTS_STORE, type ReportsStore } from "./reports.store.js";

@Module({
  imports: [AuthModule, IamModule, ExpensesModule],
  controllers: [ReportsController],
  providers: [
    RecurrenceRunGuard,
    {
      provide: REPORTS_STORE,
      inject: [EXPENSE_STORE, IAM_STORE],
      useFactory: (expenses: ExpenseStore, iam: IamStore): ReportsStore =>
        createReportsStore(async (workspaceId, actorUserId) => {
          const { viewAllPrivate } = await resolveExpenseListOptions(
            iam,
            workspaceId,
            actorUserId,
          );
          const list = await expenses.listForWorkspace(workspaceId, actorUserId, {
            viewAllPrivate,
          });
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
