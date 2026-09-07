import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { readProductFeatureFlags } from "@dang/contracts";
import { ACTOR_KEY, SessionAuthGuard } from "../auth/auth.guard.js";

type RecurrenceRequest = {
  headers: Record<string, string | string[] | undefined>;
  [ACTOR_KEY]?: AuthActor;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class RecurrenceRunGuard implements CanActivate {
  constructor(private readonly sessionAuth: SessionAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RecurrenceRequest>();
    const expectedToken = process.env.DANG_INTERNAL_JOB_TOKEN?.trim();
    const suppliedToken = headerValue(request.headers, "x-dang-internal-job")?.trim();
    if (!suppliedToken) {
      return this.sessionAuth.canActivate(context);
    }

    const actorUserId = headerValue(
      request.headers,
      "x-dang-internal-actor-user-id",
    )?.trim();

    if (
      !readProductFeatureFlags(process.env).recurrenceWorker ||
      !expectedToken ||
      suppliedToken !== expectedToken ||
      !actorUserId
    ) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
      });
    }

    request[ACTOR_KEY] = {
      userId: actorUserId,
      externalSubject: "internal:recurrence-worker",
      displayName: "Recurrence worker",
      authMode: "password",
    };
    return true;
  }
}
