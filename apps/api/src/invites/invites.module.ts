import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { InvitesController } from "./invites.controller.js";
import { InvitesService } from "./invites.service.js";

@Module({
  imports: [AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
