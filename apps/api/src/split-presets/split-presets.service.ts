import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateSplitPresetRequest,
  SplitPresetSummary,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  SPLIT_PRESET_STORE,
  type SplitPresetStore,
} from "./split-preset.store.js";

@Injectable()
export class SplitPresetsService {
  constructor(
    @Inject(SPLIT_PRESET_STORE) private readonly presets: SplitPresetStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateSplitPresetRequest,
  ): Promise<SplitPresetSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    try {
      return await this.presets.create(workspaceId, actor.userId, body);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "PRESET_NAME") {
        throw new BadRequestException({ detail: "name required (1-80)" });
      }
      if (error instanceof Error && error.message === "PRESET_LINES") {
        throw new BadRequestException({ detail: "at least one line required" });
      }
      throw error;
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<SplitPresetSummary[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    return this.presets.list(workspaceId);
  }

  async get(
    actor: AuthActor,
    workspaceId: string,
    presetId: string,
  ): Promise<SplitPresetSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    const row = await this.presets.get(workspaceId, presetId);
    if (!row) {
      throw new NotFoundException({ detail: "Split preset not found" });
    }
    return row;
  }

  async remove(
    actor: AuthActor,
    workspaceId: string,
    presetId: string,
  ): Promise<{ deleted: boolean }> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    return { deleted: await this.presets.delete(workspaceId, presetId) };
  }
}
