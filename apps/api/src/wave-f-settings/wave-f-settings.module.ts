import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IamModule } from "../iam/iam.module.js";
import { WaveFSettingsController } from "./wave-f-settings.controller.js";
import { WaveFSettingsService } from "./wave-f-settings.service.js";

@Module({
  imports: [AuthModule, IamModule],
  controllers: [WaveFSettingsController],
  providers: [WaveFSettingsService],
  exports: [WaveFSettingsService],
})
export class WaveFSettingsModule {}
