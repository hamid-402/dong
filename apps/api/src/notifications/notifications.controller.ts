// Zod body-validation exempt: GET + body-less POST (mark-read via path param) + SSE stream.
// See docs/adr/ADR-zod-get-exemptions.md
import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, NotificationSummary } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { allowCorsOrigin } from "../common/cors-origin.js";
import { NotificationsService } from "./notifications.service.js";
import type { RealtimeEnvelope } from "./realtime-hub.js";

const HEARTBEAT_MS = 25_000;

/** Returns false when the socket is gone so callers can cleanup. */
function writeSse(
  reply: FastifyReply,
  event: string,
  data: unknown,
  id?: string,
): boolean {
  if (reply.raw.destroyed || reply.raw.writableEnded) return false;
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  let chunk = "";
  if (id) chunk += `id: ${id}\n`;
  chunk += `event: ${event}\n`;
  for (const line of payload.split("\n")) {
    chunk += `data: ${line}\n`;
  }
  chunk += "\n";
  try {
    return reply.raw.write(chunk);
  } catch {
    return false;
  }
}

@ApiTags("notifications")
@Controller("workspaces/:workspaceId/notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get("stream")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "SSE stream for notifications + local presence (R10-18)",
  })
  async stream(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await this.notifications.requireMember(workspaceId, actor.userId);

    // hijack() skips Nest CORS — echo ACAO when Origin is allowed (direct browser → :3006).
    const env = loadAppEnv();
    const originHeader = (req.headers as { origin?: unknown }).origin;
    const origin =
      typeof originHeader === "string"
        ? originHeader
        : Array.isArray(originHeader) && typeof originHeader[0] === "string"
          ? originHeader[0]
          : undefined;
    const lanOrigins = (process.env.WEB_EXTRA_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const corsOk = allowCorsOrigin({
      origin,
      webOrigin: env.webOrigin,
      extraOrigins: lanOrigins,
      nodeEnv: env.nodeEnv,
    });

    reply.hijack();
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };
    if (corsOk && origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
      headers.Vary = "Origin";
    }
    reply.raw.writeHead(200, headers);
    if (typeof reply.raw.flushHeaders === "function") {
      reply.raw.flushHeaders();
    }

    const hub = this.notifications.hub();

    let closed = false;
    const heartbeat: { id?: ReturnType<typeof setInterval> } = {};
    let unsubUser = () => {};
    let unsubPresence = () => {};

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat.id) clearInterval(heartbeat.id);
      unsubUser();
      unsubPresence();
      try {
        reply.raw.end();
      } catch {
        /* already closed */
      }
    };

    const safeWrite = (
      event: string,
      data: unknown,
      id?: string,
    ): boolean => {
      if (closed) return false;
      const ok = writeSse(reply, event, data, id);
      if (!ok) cleanup();
      return ok;
    };

    const onEvent = (envelope: RealtimeEnvelope) => {
      try {
        if (envelope.type === "notification") {
          safeWrite(
            "notification",
            envelope.notification,
            envelope.notification.id,
          );
          return;
        }
        if (envelope.type === "notification.read") {
          safeWrite(
            "notification.read",
            envelope.notification,
            envelope.notification.id,
          );
          return;
        }
        if (
          envelope.type === "presence.join" ||
          envelope.type === "presence.leave" ||
          envelope.type === "presence.snapshot" ||
          envelope.type === "data.invalidate"
        ) {
          safeWrite(envelope.type, envelope);
        }
      } catch {
        cleanup();
      }
    };

    unsubUser = hub.subscribe(workspaceId, actor.userId, onEvent);
    unsubPresence = hub.subscribePresence(workspaceId, onEvent);

    if (
      !safeWrite("connected", {
        workspaceId,
        userId: actor.userId,
        transport: hub.providerMode(),
        at: new Date().toISOString(),
      })
    ) {
      return;
    }
    if (
      !safeWrite("presence.snapshot", {
        workspaceId,
        userIds: await hub.listPresentUserIds(workspaceId),
      })
    ) {
      return;
    }

    heartbeat.id = setInterval(() => {
      safeWrite("heartbeat", { at: new Date().toISOString() });
    }, HEARTBEAT_MS);

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
    req.raw.on("aborted", cleanup);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "In-app notifications for current user" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<NotificationSummary[]> {
    return this.notifications.list(actor, workspaceId);
  }

  @Post(":notificationId/read")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Mark notification as read" })
  markRead(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
  ): Promise<NotificationSummary> {
    return this.notifications.markRead(actor, workspaceId, notificationId);
  }
}
