import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { groupEmailVerificationEnforced, loadAppEnv, type AppEnv } from "@dang/config";
import { ACCOUNT_STORE, type AccountStore } from "./account.types.js";

export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

export const EMAIL_NOT_VERIFIED_DETAIL =
  "برای ساخت گروه و ثبت یا نهایی‌کردن هزینه و تسویه در فضای گروهی، ابتدا ایمیل حساب را تأیید کنید.";

type GateEnv = Pick<AppEnv, "allowDevAuth" | "requireEmailVerification">;

@Injectable()
export class EmailVerificationGate {
  constructor(@Inject(ACCOUNT_STORE) private readonly accounts: AccountStore) {}

  /**
   * No-op when this environment does not enforce verification (including
   * development/test with allowDevAuth). Personal-space callers must skip
   * this themselves.
   */
  async assertVerifiedForGroupAction(
    userId: string,
    env: GateEnv = loadAppEnv(),
  ): Promise<void> {
    if (!groupEmailVerificationEnforced(env)) return;
    const user = await this.accounts.findById(userId);
    if (user?.emailVerifiedAt) return;
    throw new ForbiddenException({
      type: "https://dang.local/problems/email-not-verified",
      title: "تأیید ایمیل لازم است",
      status: 403,
      code: EMAIL_NOT_VERIFIED,
      detail: EMAIL_NOT_VERIFIED_DETAIL,
    });
  }
}
