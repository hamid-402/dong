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

export const ACTOR_KEY = "dangActor";

type FastifyRequestLike = {
  headers: Record<string, string | string[] | undefined>;
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
export class DevAuthGuard implements CanActivate {
  constructor(@Inject(IAM_STORE) private readonly iam: IamStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const env = loadAppEnv();
    const request = context.switchToHttp().getRequest<FastifyRequestLike>();

    if (!env.allowDevAuth) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
        detail: "OIDC session is required in this environment.",
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

export const AuthGuard: Type<CanActivate> = DevAuthGuard;
