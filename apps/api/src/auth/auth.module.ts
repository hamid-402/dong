import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthOidcController } from "./auth-oidc.controller.js";
import { DevAuthGuard } from "./auth.guard.js";

@Module({
  controllers: [AuthController, AuthOidcController],
  providers: [DevAuthGuard],
  exports: [DevAuthGuard],
})
export class AuthModule {}
