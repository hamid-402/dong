import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { SubunitsModule } from "../subunits/subunits.module.js";
import { BuildingChargesController } from "./building-charges.controller.js";
import { BuildingChargesService } from "./building-charges.service.js";

@Module({
  imports: [AuthModule, IamModule, SubunitsModule, ExpensesModule],
  controllers: [BuildingChargesController],
  providers: [BuildingChargesService],
  exports: [BuildingChargesService],
})
export class BuildingChargesModule {}
