import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import type { AuthActor } from "@dang/contracts";
import {
  INTERNAL_DIGEST_ACTOR_USER_ID,
  INTERNAL_DIGEST_WORKSPACE_ID,
  readProductFeatureFlags,
  resolveInternalJobSecrets,
  verifyInternalJobAuth,
} from "@dang/contracts";
import {
  ACCOUNT_STORE,
  SESSION_COOKIE,
  authModeForUser,
  toActor,
  type AccountStore,
} from "../auth/account.types.js";
import { hashToken } from "../auth/password.js";
import { KeyVaultService } from "../key-vault/key-vault.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";

/** Same key as auth.guard — kept local to avoid circular class inject. */
const ACTOR_KEY = "dangActor";

type RecurrenceRequest = {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  [ACTOR_KEY]?: AuthActor;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

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

/**
 * Internal job HMAC auth, or session/dev actor.
 * Only Symbol tokens are injected (Nest+tsx ESM drops class ctor metadata).
 */
@Injectable()
export class RecurrenceRunGuard implements CanActivate {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Optional() @Inject(KeyVaultService) private readonly vault?: KeyVaultService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RecurrenceRequest>();
    const expectedSecrets = this.vault
      ? await this.vault.resolveInternalJobSecrets()
      : resolveInternalJobSecrets(process.env);
    const suppliedToken = headerValue(request.headers, "x-dang-internal-job")?.trim();
    if (!suppliedToken) {
      return this.activateSessionOrDev(request);
    }

    const actorUserId = headerValue(
      request.headers,
      "x-dang-internal-actor-user-id",
    )?.trim();
    const workspaceId = headerValue(
      request.headers,
      "x-dang-internal-workspace-id",
    )?.trim();
    const tsRaw = headerValue(request.headers, "x-dang-internal-ts")?.trim();
    const signature = headerValue(request.headers, "x-dang-internal-sig")?.trim();
    const routeWorkspaceId = request.params?.workspaceId?.trim();

    if (
      !readProductFeatureFlags(process.env).recurrenceWorker ||
      expectedSecrets.length === 0 ||
      !actorUserId ||
      !workspaceId ||
      !tsRaw ||
      !signature
    ) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
        detail: "Internal job auth requires signed actor/workspace headers.",
      });
    }

    const ts = Number(tsRaw);
    if (
      !verifyInternalJobAuth({
        secrets: expectedSecrets,
        suppliedToken,
        ts,
        workspaceId,
        actorUserId,
        signature,
      })
    ) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
        detail: "Internal job signature invalid or expired.",
      });
    }

    if (routeWorkspaceId && routeWorkspaceId !== workspaceId) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
        detail: "Internal job workspace mismatch.",
      });
    }

    const isDigestService =
      workspaceId === INTERNAL_DIGEST_WORKSPACE_ID &&
      actorUserId === INTERNAL_DIGEST_ACTOR_USER_ID;

    if (!isDigestService) {
      const members = await this.iam.listMembers(workspaceId, actorUserId);
      if (!members?.some((m) => m.userId === actorUserId)) {
        throw new UnauthorizedException({
          type: "https://dang.local/problems/auth-required",
          title: "Authentication required",
          status: 401,
          detail: "Internal job actor is not a workspace member.",
        });
      }
    }

    request[ACTOR_KEY] = {
      userId: actorUserId,
      externalSubject: isDigestService
        ? "internal:digest-worker"
        : "internal:recurrence-worker",
      displayName: isDigestService ? "Digest worker" : "Recurrence worker",
      authMode: "password",
    };
    return true;
  }

  private async activateSessionOrDev(request: RecurrenceRequest): Promise<boolean> {
    const env = loadAppEnv();
    const raw = request.cookies?.[SESSION_COOKIE]?.trim();
    if (raw) {
      const session = await this.accounts.findSessionByTokenHash(hashToken(raw));
      if (session) {
        const user = await this.accounts.findById(session.userId);
        if (user) {
          request[ACTOR_KEY] = toActor(user, authModeForUser(user));
          return true;
        }
      }
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
