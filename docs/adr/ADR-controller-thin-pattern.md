# ADR: Thin controller pattern

## Status

Accepted

## Context

As the NestJS API grows, controllers risk accumulating business logic (validation branching,
money math, persistence orchestration) that belongs in services. We want one canonical
reference for what a "thin" controller looks like so future refactors converge on it.

## Decision

Controllers stay **thin**: they wire HTTP to a service and nothing more. Business logic,
authorization decisions beyond the guard, money math, and store access live in the service.

Reference implementation: **`apps/api/src/expenses/daily-ledger.controller.ts`**.

A thin controller does only these things per endpoint:

1. Declare the route + method decorator (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`).
2. Attach `@UseGuards(AuthGuard)` and read the caller via `@CurrentActor()`.
3. Validate request bodies with `ZodValidationPipe` + a `@dang/contracts` schema
   (see `docs/adr/ADR-zod-get-exemptions.md` for the body-less read exemption).
4. Bind path/query params to typed parameters.
5. Add `@ApiOperation` / `@ApiTags` for Swagger.
6. `return this.<service>.<method>(actor, ...args)` — a single delegating call.

Example (from the reference controller):

```ts
@Post("entries")
@UseGuards(AuthGuard)
@ApiOperation({ summary: "Add item name + amount to a member or shared column" })
async addEntry(
  @CurrentActor() actor: AuthActor,
  @Param("workspaceId") workspaceId: string,
  @Body(new ZodValidationPipe(createDailyLedgerEntryRequestSchema))
  body: CreateDailyLedgerEntryRequest,
): Promise<DailyLedgerResponse> {
  return this.dailyLedger.addEntry(actor, workspaceId, body);
}
```

## Anti-patterns (do not do in a controller)

- Computing balances, splits, or any money arithmetic.
- Reaching into a store/repository directly instead of a service.
- Conditional business rules (status transitions, role math) — push into the service.
- Building response DTOs by hand beyond what the service returns.

## Consequences

- Reviews can point at `daily-ledger.controller.ts` as the target shape.
- Services stay unit-testable without HTTP; controllers need little testing beyond wiring.
- Future controller refactors are "additive" (see repo rule): move logic down into services,
  never delete the endpoint or its contract.
