import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { SecurityEventsModule } from "../security-events/security-events.module.js";
import { SloController } from "./slo.controller.js";
import { SloService } from "./slo.service.js";

@Module({
  imports: [AuthModule, OutboxModule, SecurityEventsModule],
  controllers: [SloController],
  providers: [SloService],
  exports: [SloService],
})
export class SloModule {}
