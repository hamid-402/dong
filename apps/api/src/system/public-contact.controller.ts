import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PublicContactService } from "./public-contact.service.js";
import {
  publicContactRequestSchema,
  type PublicContactRequest,
  type PublicContactResponse,
} from "./public-contact.types.js";

@ApiTags("public")
@Controller("public")
export class PublicContactController {
  constructor(
    @Inject(PublicContactService) private readonly contacts: PublicContactService,
  ) {}

  @Post("contact")
  @ApiOperation({
    summary: "Public contact form — rate-limited; honest mailer delivery signal",
  })
  @ApiOkResponse({
    schema: {
      example: {
        accepted: true,
        delivered: false,
        mailerMode: "dev-log",
        suggestMailto: true,
      },
    },
  })
  submit(
    @Body(new ZodValidationPipe(publicContactRequestSchema))
    body: PublicContactRequest,
    @Req() req: FastifyRequest,
  ): Promise<PublicContactResponse> {
    return this.contacts.submit(body, { ip: req.ip });
  }
}
