import { createHash } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { isOidcConfigured, loadAppEnv } from "@dang/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { ACCOUNT_STORE, type AccountStore } from "./account.types.js";
import { newOpaqueToken } from "./password.js";
import { AccountService } from "./account.service.js";

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

function sha256Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

@Injectable()
export class OidcService {
  private discoveryCache: { issuer: string; doc: OidcDiscovery } | null = null;
  private readonly pendingStates = new Map<
    string,
    { codeVerifier: string; expiresAt: number }
  >();

  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AccountService) private readonly accountService: AccountService,
  ) {}

  isConfigured(): boolean {
    return isOidcConfigured(loadAppEnv());
  }

  async startLogin(): Promise<string> {
    const env = loadAppEnv();
    if (!isOidcConfigured(env)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "OIDC not configured",
        status: 400,
      });
    }
    const discovery = await this.discover(env.oidcIssuerUrl!);
    const state = newOpaqueToken(16);
    const codeVerifier = newOpaqueToken(48);
    this.pendingStates.set(state, {
      codeVerifier,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const redirectUri = `${env.apiBaseUrl.replace(/\/$/, "")}/auth/oidc/callback`;
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("client_id", env.oidcClientId!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", sha256Url(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async handleCallback(req: FastifyRequest, reply: FastifyReply): Promise<string> {
    const env = loadAppEnv();
    const query = req.query as Record<string, string | undefined>;
    const code = String(query.code ?? "");
    const state = String(query.state ?? "");
    if (!code || !state) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "OIDC callback missing code/state",
        status: 400,
      });
    }
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth",
        title: "OIDC state expired",
        status: 401,
      });
    }

    const discovery = await this.discover(env.oidcIssuerUrl!);
    const redirectUri = `${env.apiBaseUrl.replace(/\/$/, "")}/auth/oidc/callback`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.oidcClientId!,
      code,
      redirect_uri: redirectUri,
      code_verifier: pending.codeVerifier,
    });
    if (env.oidcClientSecret) {
      body.set("client_secret", env.oidcClientSecret);
    }
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth",
        title: "OIDC token exchange failed",
        status: 401,
      });
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      id_token?: string;
    };
    let sub = "";
    let email = "";
    let name = "کاربر OIDC";
    if (discovery.userinfo_endpoint && tokenJson.access_token) {
      const userRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (userRes.ok) {
        const profile = (await userRes.json()) as {
          sub?: string;
          email?: string;
          name?: string;
          preferred_username?: string;
        };
        sub = profile.sub ?? "";
        email = profile.email ?? "";
        name = profile.name ?? profile.preferred_username ?? name;
      }
    }
    if (!sub && tokenJson.id_token) {
      const payloadPart = tokenJson.id_token.split(".")[1];
      if (payloadPart) {
        const claims = JSON.parse(
          Buffer.from(payloadPart, "base64url").toString("utf8"),
        ) as { sub?: string; email?: string; name?: string };
        sub = claims.sub ?? sub;
        email = claims.email ?? email;
        name = claims.name ?? name;
      }
    }
    if (!sub) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth",
        title: "OIDC subject missing",
        status: 401,
      });
    }

    const user = await this.accounts.findOrCreateOidcUser({
      externalSubject: sub,
      email: email || undefined,
      displayName: name,
    });
    await this.iam.upsertDevActor({
      externalSubject: user.externalSubject,
      displayName: user.displayName,
      userId: user.userId,
    });
    await this.accountService.issueSessionForUser(user.userId, reply, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return `${env.webOrigin}/hub?login=ok`;
  }

  private async discover(issuerUrl: string): Promise<OidcDiscovery> {
    const issuer = issuerUrl.replace(/\/$/, "");
    if (this.discoveryCache?.issuer === issuer) return this.discoveryCache.doc;
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error("OIDC_DISCOVERY_FAILED");
    const doc = (await res.json()) as OidcDiscovery;
    this.discoveryCache = { issuer, doc };
    return doc;
  }
}
