import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdempotencyModule } from "../common/idempotency.module.js";
import { MembershipController } from "./membership.controller.js";
import { MembershipService } from "./membership.service.js";

@Module({
  imports: [AuthModule, IdempotencyModule],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
