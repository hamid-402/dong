import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, GenerateBuildingChargesRequest } from "@dang/contracts";
import { generateBuildingChargesSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BuildingChargesService } from "./building-charges.service.js";

@ApiTags("building-charges")
@Controller("workspaces/:workspaceId/building-charges")
export class BuildingChargesController {
  constructor(
    @Inject(BuildingChargesService) private readonly charges: BuildingChargesService,
  ) {}

  @Post("generate")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Generate monthly per-unit building charge expense drafts" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  generate(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(generateBuildingChargesSchema))
    body: GenerateBuildingChargesRequest,
  ) {
    return this.charges.generateMonthly(actor, workspaceId, body);
  }
}
