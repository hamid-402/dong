import assert from "node:assert/strict";
import test from "node:test";
import { Body, Controller, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
  RouteConfig,
} from "@nestjs/platform-fastify";
import { PAYMENT_RECEIPT_MAX_BYTES } from "@dang/contracts";
import { bridgeNestRouteConfigBodyLimit } from "./attachments.controller.js";

/**
 * Slim Fastify app mirroring AttachmentsController payment-receipt vs generic
 * content upload bodyLimit behavior (no DB / Auth).
 */
@Controller("workspaces/:workspaceId/attachments")
class BodyLimitProbeController {
  @Post(":attachmentId/payment-receipt-content")
  @RouteConfig({ bodyLimit: PAYMENT_RECEIPT_MAX_BYTES })
  paymentReceipt(@Body() body: { contentBase64?: string }) {
    return { route: "payment-receipt", bytes: body?.contentBase64?.length ?? 0 };
  }

  @Post(":attachmentId/content")
  general(@Body() body: { contentBase64?: string }) {
    return { route: "general", bytes: body?.contentBase64?.length ?? 0 };
  }
}

@Module({
  controllers: [BodyLimitProbeController],
})
class BodyLimitProbeModule {}

async function createProbeApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    bodyLimit: 12 * 1024 * 1024,
  });
  bridgeNestRouteConfigBodyLimit(adapter.getInstance());
  const app = await NestFactory.create<NestFastifyApplication>(
    BodyLimitProbeModule,
    adapter,
    { logger: false },
  );
  app.setGlobalPrefix("api/v1");
  await app.init();
  return app;
}

test("6MB payment-receipt content upload is rejected with HTTP 413", async () => {
  const app = await createProbeApp();
  try {
    const sixMb = 6 * 1024 * 1024;
    const payload = Buffer.alloc(sixMb, 0x61);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/w1/attachments/a1/payment-receipt-content",
      headers: {
        "content-type": "application/json",
        "content-length": String(payload.length),
      },
      payload,
    });
    assert.equal(
      res.statusCode,
      413,
      `expected Fastify 413 for ${sixMb}B on payment-receipt route, got ${res.statusCode}: ${res.body.slice(0, 200)}`,
    );
  } finally {
    await app.close();
  }
});

test("generic attachment content upload keeps inherited 12MB bodyLimit (6MB not 413)", async () => {
  const app = await createProbeApp();
  try {
    const sixMb = 6 * 1024 * 1024;
    // JSON body >5MB and <12MB so only a 5MB route bodyLimit would 413.
    const body = JSON.stringify({ contentBase64: "x".repeat(sixMb - 40) });
    assert.ok(body.length > PAYMENT_RECEIPT_MAX_BYTES);
    assert.ok(body.length < 12 * 1024 * 1024);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/w1/attachments/a1/content",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    assert.notEqual(
      res.statusCode,
      413,
      `general upload must not apply 5MB Fastify cap; got 413 (body ${body.length}B)`,
    );
    assert.ok(
      res.statusCode === 200 || res.statusCode === 201,
      `expected 200/201 from general route, got ${res.statusCode}`,
    );
    const json = JSON.parse(res.body) as { route: string };
    assert.equal(json.route, "general");
  } finally {
    await app.close();
  }
});