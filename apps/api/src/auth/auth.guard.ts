import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { AccountService } from "./account.service.js";
import { SESSION_COOKIE } from "./account.types.js";

export const ACTOR_KEY = "dangActor";

type FastifyRequestLike = {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  [ACTOR_KEY]?: AuthActor;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Accepts plain ASCII or `b64:` UTF-8 payloads from the web client. */
function decodeDevHeader(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const value = raw.trim();
  if (!value.startsWith("b64:")) return value;
  try {
    return Buffer.from(value.slice(4), "base64").toString("utf8") || fallback;
  } catch {
    return fallback;
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AccountService) private readonly accounts: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const env = loadAppEnv();
    const request = context.switchToHttp().getRequest<FastifyRequestLike>();

    try {
      const sessionActor = await this.accounts.resolveSessionActor(
        request.cookies?.[SESSION_COOKIE],
      );
      if (sessionActor) {
        request[ACTOR_KEY] = sessionActor;
        return true;
      }
    } catch {
      // Bad/expired cookie or transient DB blip — fall through to dev auth or 401.
    }

    if (!(env.allowDevAuth && env.nodeEnv !== "production")) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
        detail: "Login session or OIDC is required in this environment.",
      });
    }

    const subject = decodeDevHeader(
      headerValue(request.headers, "x-dang-subject"),
      "dev-local-user",
    );
    const displayName = decodeDevHeader(
      headerValue(request.headers, "x-dang-display-name"),
      "کاربر محلی",
    );
    const userId = headerValue(request.headers, "x-dang-user-id");

    const actor = await this.iam.upsertDevActor({
      externalSubject: subject,
      displayName,
      userId,
    });
    request[ACTOR_KEY] = actor;
    return true;
  }
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthActor => {
    const request = context.switchToHttp().getRequest<FastifyRequestLike>();
    const actor = request[ACTOR_KEY];
    if (!actor) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
      });
    }
    return actor;
  },
);

/** Prefer password/OIDC session cookie; fall back to trusted DevAuth headers when allowed. */
export const AuthGuard: Type<CanActivate> = SessionAuthGuard;
export const DevAuthGuard = SessionAuthGuard;
