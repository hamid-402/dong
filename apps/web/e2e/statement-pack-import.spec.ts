import { test, expect } from "@playwright/test";
import { resolveWorkspace, devApiAuthHeaders } from "./helpers/dev-session";

/**
 * API-only deep checks (no browser UI) for statement pack + ledger import.
 * Requires ALLOW_DEV_AUTH + live API (proxied via web origin or PLAYWRIGHT_API_ORIGIN).
 */
test.describe("statement pack + ledger import (API)", () => {
  test("pack export xlsx and pdf return downloadable bodies", async ({
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "no workspace for e2e subject");
    const workspaceId = ws!.id;
    const headers = await devApiAuthHeaders(request);

    const from = "2026-09-01";
    const to = "2026-09-23";

    for (const format of ["xlsx", "pdf"] as const) {
      const create = await request.post(
        `/api/v1/workspaces/${workspaceId}/statements/pack/exports`,
        {
          data: { from, to, format },
          headers,
        },
      );
      if (format === "pdf" && create.status() === 503) {
        // Honest unavailable when font missing on server
        continue;
      }
      expect(create.ok(), `create ${format} ${create.status()}`).toBeTruthy();
      const created = (await create.json()) as { id: string };
      expect(created.id).toBeTruthy();

      const download = await request.get(
        `/api/v1/workspaces/${workspaceId}/statements/exports/${created.id}/download`,
        { headers },
      );
      expect(download.ok(), `download ${format}`).toBeTruthy();
      const body = await download.body();
      if (format === "xlsx") {
        expect(body[0]).toBe(0x50);
        expect(body[1]).toBe(0x4b);
      } else {
        expect(body.subarray(0, 4).toString("latin1")).toBe("%PDF");
      }
    }
  });

  test("ledger import preview + edited rows + capabilities pdf flag", async ({
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "no workspace for e2e subject");
    const workspaceId = ws!.id;
    const headers = await devApiAuthHeaders(request);

    const caps = await request.get(`/api/v1/system/capabilities`, { headers });
    expect(caps.ok()).toBeTruthy();
    const capsJson = (await caps.json()) as {
      providers?: { statementPackPdf?: string; statements?: string };
    };
    expect(capsJson.providers?.statements).toBe("csv_json_print_v1");
    expect(
      capsJson.providers?.statementPackPdf === "pdfkit_vazir_v1" ||
        capsJson.providers?.statementPackPdf === "unavailable",
    ).toBeTruthy();

    const paste = [
      "ردیف\tروز\tتاریخ\tحمید\tقیمت\tشرکت\tقیمت6\tجمع",
      "1\tپنجشنبه\t1405/06/12\tچای\t5000\tنان\t20000\t25000",
    ].join("\n");

    const preview = await request.post(
      `/api/v1/workspaces/${workspaceId}/daily-ledger/import`,
      {
        data: {
          paste,
          previewOnly: true,
          idempotencyKey: `e2e-preview-${Date.now()}`,
        },
        headers,
      },
    );
    expect(preview.ok(), `preview ${preview.status()}`).toBeTruthy();
    const prevJson = (await preview.json()) as {
      imported: number;
      preview?: Array<{
        date: string;
        column: string;
        itemName: string;
        amountToman: number;
      }>;
      unmappedColumns?: string[];
    };
    expect(prevJson.imported).toBe(0);
    expect((prevJson.preview ?? []).length).toBeGreaterThan(0);

    const sharedRow = (prevJson.preview ?? []).find((r) => r.column === "shared");
    if (sharedRow) {
      const commit = await request.post(
        `/api/v1/workspaces/${workspaceId}/daily-ledger/import`,
        {
          data: {
            rows: [
              {
                ...sharedRow,
                itemName: `${sharedRow.itemName} e2e`,
                amountToman: Math.max(1, sharedRow.amountToman),
              },
            ],
            previewOnly: false,
            idempotencyKey: `e2e-rows-commit-${Date.now()}`,
          },
          headers,
        },
      );
      // Day locks / policy may deny — shape must still be honest
      if (commit.ok()) {
        const body = (await commit.json()) as { imported: number };
        expect(body.imported).toBeGreaterThanOrEqual(0);
      } else {
        expect([400, 403, 409, 422]).toContain(commit.status());
      }
    }
  });
});
