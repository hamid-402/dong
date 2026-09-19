import { Module, type DynamicModule } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { SocialModule } from "../social/social.module.js";
import { DemoController } from "./demo.controller.js";
import { DemoSeedService } from "./demo-seed.service.js";

/** S10-05 / S11-14 — production never mounts demo controllers or providers. */
export function isDemoModuleEnabled(env: { nodeEnv: string }): boolean {
  return env.nodeEnv !== "production";
}

@Module({})
export class DemoModule {
  /** Production builds omit demo controllers entirely — no auto-seed path. */
  static register(): DynamicModule {
    const env = loadAppEnv();
    if (!isDemoModuleEnabled(env)) {
      return {
        module: DemoModule,
      };
    }
    return {
      module: DemoModule,
      imports: [
        AuthModule,
        IamModule,
        AuditModule,
        ExpensesModule,
        LedgerModule,
        ProcurementModule,
        BillingModule,
        CatalogModule,
        SocialModule,
      ],
      controllers: [DemoController],
      providers: [DemoSeedService],
      exports: [DemoSeedService],
    };
  }
}
