import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { createDatabase, desc, fxRate, type AppDatabase } from "@dang/db";
import { loadAppEnv } from "@dang/config";
import {
  createFxRateSchema,
  fxConvertPreviewSchema,
  multiplyDecimalStrings,
  readProductFeatureFlags,
  type CreateFxRateRequest,
  type FxConvertPreviewRequest,
  type FxConvertPreviewResponse,
  type FxRateSummary,
} from "@dang/contracts";
import { AuthModule } from "../auth/auth.module.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

const map = (r: typeof fxRate.$inferSelect): FxRateSummary => ({
  id: r.id,
  baseCurrency: r.baseCurrency,
  quoteCurrency: r.quoteCurrency,
  rate: r.rateNumeric,
  asOf: r.asOf,
  source: r.source,
  createdAt: r.createdAt.toISOString(),
});

export function resolveFxProviderMode(
  env: NodeJS.ProcessEnv = process.env,
): "none" | "http_v1" {
  return (env.FX_PROVIDER_URL ?? "").trim() ? "http_v1" : "none";
}

/** Pure G13/G18 preview builder. Exported for depth tests. */
export function buildFxConvertPreviewResult(
  rows: FxRateSummary[],
  input: FxConvertPreviewRequest,
  opts?: { live?: boolean },
): FxConvertPreviewResponse {
  if (input.fromCurrency === input.toCurrency) {
    throw new ForbiddenException({
      type: "https://dang.local/problems/fx-preview-same-currency",
      title: "from and to currency must differ",
      status: 403,
    });
  }
  const hit = pickFxRateForPreview(
    rows,
    input.fromCurrency,
    input.toCurrency,
    input.asOf,
  );
  if (!hit) {
    throw new NotFoundException({
      type: "https://dang.local/problems/fx-rate-not-found",
      title: "No FX rate for pair",
      status: 404,
      detail: `${input.fromCurrency}/${input.toCurrency}`,
    });
  }
  const rateUsed = hit.inverted
    ? (() => {
        const r = Number(hit.row.rate);
        if (!Number.isFinite(r) || r <= 0) {
          throw new ForbiddenException({ detail: "bad rate" });
        }
        return String(Number((1 / r).toFixed(12)));
      })()
    : hit.row.rate;
  return {
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    amount: input.amount,
    convertedAmount: multiplyDecimalStrings(input.amount, rateUsed),
    rate: rateUsed,
    rateAsOf: hit.row.asOf,
    source: hit.row.source,
    inverted: hit.inverted,
    live: Boolean(opts?.live),
  };
}

/** Pure pick of best rate row for preview (G13). Exported for unit tests. */
export function pickFxRateForPreview(
  rows: FxRateSummary[],
  fromCurrency: string,
  toCurrency: string,
  asOf?: string,
): { row: FxRateSummary; inverted: boolean } | null {
  const cutoff = asOf ?? "9999-12-31";
  const direct = rows
    .filter(
      (r) =>
        r.baseCurrency === fromCurrency &&
        r.quoteCurrency === toCurrency &&
        r.asOf <= cutoff,
    )
    .sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0));
  if (direct[0]) return { row: direct[0], inverted: false };

  const inverse = rows
    .filter(
      (r) =>
        r.baseCurrency === toCurrency &&
        r.quoteCurrency === fromCurrency &&
        r.asOf <= cutoff,
    )
    .sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0));
  if (inverse[0]) return { row: inverse[0], inverted: true };
  return null;
}

@Injectable()
class FxRatesService {
  private readonly db?: AppDatabase;
  constructor() {
    if (process.env.DATABASE_URL) this.db = createDatabase(process.env.DATABASE_URL).db;
  }

  async list() {
    if (!this.db) return [];
    return (await this.db.select().from(fxRate).orderBy(desc(fxRate.asOf))).map(map);
  }

  async create(input: CreateFxRateRequest) {
    if (!readProductFeatureFlags(process.env).fxRates) {
      throw new ForbiddenException({ detail: "Set ENABLE_FX_RATES=1" });
    }
    if (!this.db) {
      throw new ForbiddenException({ detail: "FX rates require Postgres persistence" });
    }
    const rows = await this.db
      .insert(fxRate)
      .values({
        baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency,
        rateNumeric: input.rate,
        asOf: input.asOf,
        source: input.source,
      })
      .onConflictDoUpdate({
        target: [fxRate.baseCurrency, fxRate.quoteCurrency, fxRate.asOf],
        set: { rateNumeric: input.rate, source: input.source },
      })
      .returning();
    return map(rows[0]!);
  }

  /**
   * Optional HTTP provider (G12 #59). Expects JSON:
   * { rates: [{ baseCurrency, quoteCurrency, rate, asOf }] }
   * Fills the rate table used by conversionLive expense binding.
   */
  async syncFromProvider(): Promise<{ imported: number; source: string }> {
    const url = (process.env.FX_PROVIDER_URL ?? "").trim();
    if (!url) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/fx-provider-none",
        title: "FX_PROVIDER_URL not configured",
        status: 403,
      });
    }
    if (!this.db) {
      throw new ForbiddenException({ detail: "FX rates require Postgres persistence" });
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new ForbiddenException({
        detail: `FX provider HTTP ${res.status}`,
        status: 403,
      });
    }
    const json = (await res.json()) as {
      rates?: Array<{
        baseCurrency: string;
        quoteCurrency: string;
        rate: string;
        asOf: string;
      }>;
    };
    const rates = json.rates ?? [];
    let imported = 0;
    for (const row of rates) {
      if (!row.baseCurrency || !row.quoteCurrency || !row.rate || !row.asOf) continue;
      await this.create({
        baseCurrency: row.baseCurrency,
        quoteCurrency: row.quoteCurrency,
        rate: row.rate,
        asOf: row.asOf,
        source: `http:${new URL(url).hostname}`,
      });
      imported += 1;
    }
    return { imported, source: url };
  }

  /**
   * Convert preview from stored rates. `live` mirrors capabilities.conversionLive.
   */
  async convertPreview(input: FxConvertPreviewRequest): Promise<FxConvertPreviewResponse> {
    const rows = await this.list();
    const live = Boolean(loadAppEnv().databaseUrl);
    return buildFxConvertPreviewResult(rows, input, { live });
  }
}

@Controller("fx-rates")
@UseGuards(AuthGuard)
class FxRatesController {
  constructor(private service: FxRatesService) {}
  @Get() list() {
    return this.service.list();
  }
  @Post() create(@Body(new ZodValidationPipe(createFxRateSchema)) b: CreateFxRateRequest) {
    return this.service.create(b);
  }
  @Post("sync-provider") syncProvider() {
    return this.service.syncFromProvider();
  }
  @Post("preview")
  preview(@Body(new ZodValidationPipe(fxConvertPreviewSchema)) b: FxConvertPreviewRequest) {
    return this.service.convertPreview(b);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [FxRatesController],
  providers: [FxRatesService],
  exports: [FxRatesService],
})
export class FxRatesModule {}
