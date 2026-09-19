import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  BlockedUserSummary,
  ContactMatchRequest,
  ContactMatchResponse,
  ContactSyncRunSummary,
  CreateFriendRequestBody,
  DirectoryPrivacySettings,
  DirectoryUserSummary,
  FriendshipSummary,
  SocialCountsSummary,
  UpdateDirectoryPrivacyRequest,
} from "@dang/contracts";
import {
  contactMatchRequestSchema,
  createFriendRequestSchema,
  updateDirectoryPrivacyRequestSchema,
} from "@dang/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { SocialService } from "./social.service.js";

@ApiTags("social")
@Controller()
@UseGuards(AuthGuard)
export class SocialController {
  constructor(@Inject(SocialService) private readonly social: SocialService) {}

  @Get("account/privacy/directory")
  @ApiOperation({ summary: "Directory findability settings" })
  getPrivacy(@CurrentActor() actor: AuthActor): Promise<DirectoryPrivacySettings> {
    return this.social.getPrivacy(actor);
  }

  @Put("account/privacy/directory")
  @ApiOperation({ summary: "Update directory findability settings" })
  updatePrivacy(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(updateDirectoryPrivacyRequestSchema))
    body: UpdateDirectoryPrivacyRequest,
  ): Promise<DirectoryPrivacySettings> {
    return this.social.updatePrivacy(actor, body);
  }

  @Get("directory/lookup")
  @ApiOperation({ summary: "Exact username or phone lookup (anti-enumeration)" })
  lookup(
    @CurrentActor() actor: AuthActor,
    @Query("username") username: string | undefined,
    @Query("phone") phone: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DirectoryUserSummary | null> {
    return this.social.lookup(actor, { username, phone }, { ip: req.ip, reply });
  }

  @Get("friends")
  @ApiOperation({ summary: "Accepted friends" })
  listFriends(@CurrentActor() actor: AuthActor): Promise<FriendshipSummary[]> {
    return this.social.listFriends(actor);
  }

  @Get("me/social-counts")
  @ApiOperation({ summary: "Account social graph counts (not workspace funnel)" })
  socialCounts(@CurrentActor() actor: AuthActor): Promise<SocialCountsSummary> {
    return this.social.socialCounts(actor);
  }

  @Get("friends/blocks")
  @ApiOperation({ summary: "Users blocked by the current actor" })
  listBlocks(@CurrentActor() actor: AuthActor): Promise<BlockedUserSummary[]> {
    return this.social.listBlocks(actor);
  }

  @Get("friends/requests")
  @ApiOperation({ summary: "Pending friend requests" })
  listRequests(
    @CurrentActor() actor: AuthActor,
    @Query("direction") direction: "incoming" | "outgoing" = "incoming",
  ): Promise<FriendshipSummary[]> {
    const dir = direction === "outgoing" ? "outgoing" : "incoming";
    return this.social.listRequests(actor, dir);
  }

  @Post("friends/requests")
  @ApiOperation({ summary: "Send friend request" })
  request(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createFriendRequestSchema)) body: CreateFriendRequestBody,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<FriendshipSummary> {
    return this.social.requestFriend(actor, body, { ip: req.ip, reply });
  }

  @Post("friends/requests/:id/accept")
  accept(
    @CurrentActor() actor: AuthActor,
    @Param("id") id: string,
  ): Promise<FriendshipSummary> {
    return this.social.acceptRequest(actor, id);
  }

  @Post("friends/requests/:id/decline")
  decline(
    @CurrentActor() actor: AuthActor,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.social.declineRequest(actor, id);
  }

  @Post("friends/requests/:id/cancel")
  @ApiOperation({ summary: "Cancel own pending outgoing friend request" })
  cancel(
    @CurrentActor() actor: AuthActor,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.social.cancelOutgoingRequest(actor, id);
  }

  @Delete("friends/:userId")
  remove(
    @CurrentActor() actor: AuthActor,
    @Param("userId") userId: string,
  ): Promise<{ ok: true }> {
    return this.social.removeFriend(actor, userId);
  }

  @Post("friends/:userId/block")
  block(
    @CurrentActor() actor: AuthActor,
    @Param("userId") userId: string,
  ): Promise<{ ok: true }> {
    return this.social.block(actor, userId);
  }

  @Delete("friends/:userId/block")
  unblock(
    @CurrentActor() actor: AuthActor,
    @Param("userId") userId: string,
  ): Promise<{ ok: true }> {
    return this.social.unblock(actor, userId);
  }

  @Post("contacts/match")
  @ApiOperation({ summary: "Match hashed phones to directory users; raw phones not stored" })
  matchContacts(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(contactMatchRequestSchema)) body: ContactMatchRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ContactMatchResponse> {
    return this.social.matchContacts(actor, body, { ip: req.ip, reply });
  }

  @Get("contacts/runs")
  listRuns(@CurrentActor() actor: AuthActor): Promise<ContactSyncRunSummary[]> {
    return this.social.listContactRuns(actor);
  }
}
