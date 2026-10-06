import { describe, expect, it } from "vitest";
import { persistenceLabelFa } from "./status-labels";

describe("persistenceLabelFa", () => {
  it("returns loading when persistence missing", () => {
    expect(persistenceLabelFa(undefined, true)).toBe("در حال بارگذاری…");
  });

  it("returns no-db when databaseConfigured is false", () => {
    expect(
      persistenceLabelFa({ iam: "postgres", ledger: "postgres" }, false),
    ).toBe("بدون اتصال پایگاه");
  });

  it("claims durable only when every counted store is postgres", () => {
    expect(
      persistenceLabelFa(
        {
          iam: "postgres",
          ledger: "postgres",
          expense: "postgres",
          settlement: "postgres",
          attachmentBlob: "local",
        },
        true,
      ),
    ).toBe("ذخیره‌سازی پایدار");
  });

  it("reports mixed when any memory store remains", () => {
    expect(
      persistenceLabelFa(
        {
          iam: "postgres",
          ledger: "postgres",
          expense: "memory",
          settlement: "postgres",
        },
        true,
      ),
    ).toBe("مختلط (3/4 پایدار)");
  });

  it("reports temp memory when all counted stores are memory", () => {
    expect(
      persistenceLabelFa(
        { iam: "memory", ledger: "memory", expense: "memory" },
        true,
      ),
    ).toBe("حافظه موقت (توسعه)");
  });
});
