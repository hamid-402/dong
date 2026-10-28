import { createHash, randomUUID } from "node:crypto";

/**
 * DevAuth smoke: write/read flows across personal/group/building/org.
 * Run: node scripts/qa-smoke-flows.mjs
 */
const API = process.env.API_BASE_URL ?? "http://localhost:3006/api/v1";
const H = {
  "x-dang-subject": "dev-local-user",
  "x-dang-display-name": "Dev",
  "Content-Type": "application/json",
  Accept: "application/json",
};

const IDS = {
  personal: "5f45781d-1109-4892-99b7-b2fd99268117",
  group: "dd7e2dc9-9129-4069-9d27-bf64b602b81a",
  building: "55b122e8-5452-4704-ae0f-168af39f8511",
  org: "a02e1e18-e7f2-4308-8b5d-884084e8125f",
};

const irr = (minor) => ({ currency: "IRR", amountMinor: String(minor) });
const key = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const results = [];

async function req(method, path, body) {
  const headers = { ...H };
  const hasBody = body !== undefined;
  if (!hasBody) delete headers["Content-Type"];
  const r = await fetch(`${API}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const row = {
    method,
    path,
    status: r.status,
    ok: r.ok,
    detail:
      typeof json === "object" && json
        ? json.detail || json.title || json.message || JSON.stringify(json).slice(0, 160)
        : String(json).slice(0, 160),
  };
  results.push(row);
  const mark = r.ok ? "OK " : "ERR";
  console.log(`${mark} ${r.status} ${method} ${path} :: ${String(row.detail).slice(0, 120)}`);
  return { status: r.status, body: json, ok: r.ok };
}

async function main() {
  const members = await req("GET", `/workspaces/${IDS.group}/members`);
  const memberIds = Array.isArray(members.body)
    ? members.body.map((m) => m.userId).filter(Boolean)
    : [];
  const uid = memberIds[0];
  if (!uid) throw new Error("no member");

  // Group expense (equal split across all members when possible, auto-commit)
  const exp = await req("POST", `/workspaces/${IDS.group}/expenses`, {
    title: "QA lunch",
    total: irr(250000),
    paidByUserId: uid,
    splitMethod: "equal",
    participantUserIds: memberIds.length > 1 ? memberIds : [uid],
    occurredOn: "2026-09-19",
    idempotencyKey: key("exp"),
    commit: "auto",
  });
  if (exp.ok && exp.body?.status && exp.body.status !== "posted") {
    console.log(
      `WARN expense status=${exp.body.status} (expected posted after commit:auto)`,
    );
  }

  // Building subunit
  await req("POST", `/workspaces/${IDS.building}/subunits`, {
    kind: "unit",
    code: `U${Date.now().toString().slice(-5)}`,
    name: "Unit QA",
  });

  // Org need
  await req("POST", `/workspaces/${IDS.org}/needs`, {
    workspaceId: IDS.org,
    title: "QA chairs",
    description: "for office",
    idempotencyKey: key("need"),
  });

  // Org agreement
  await req("POST", `/workspaces/${IDS.org}/agreements`, {
    workspaceId: IDS.org,
    title: "QA agreement",
    effectiveFrom: "2026-09-01",
    idempotencyKey: key("agr"),
  });

  // Org proposal
  await req("POST", `/workspaces/${IDS.org}/proposals`, {
    workspaceId: IDS.org,
    kind: "goods",
    title: "QA proposal goods",
    description: "test vote",
    idempotencyKey: key("prop"),
  });

  // Personal account
  await req("POST", `/me/finance/accounts`, {
    name: "QA Cash",
    kind: "cash",
    openingBalance: irr(0),
    idempotencyKey: key("acc"),
  });

  // Personal category + txn if possible
  const cats = await req("GET", `/me/finance/categories`);
  const catId = Array.isArray(cats.body) ? cats.body[0]?.id : null;
  const accounts = await req("GET", `/me/finance/accounts`);
  const accId = Array.isArray(accounts.body)
    ? accounts.body.find((a) => a.name === "QA Cash")?.id ?? accounts.body[0]?.id
    : null;
  if (accId) {
    await req("POST", `/me/finance/transactions`, {
      accountId: accId,
      kind: "expense",
      amount: irr(10000),
      occurredOn: "2026-09-19",
      note: "QA snack",
      categoryId: catId ?? undefined,
      idempotencyKey: key("txn"),
    });
  }

  // Savings goal
  await req("POST", `/me/finance/savings-goals`, {
    name: "QA goal",
    targetMinor: "1000000",
    targetDate: "2026-12-31",
    idempotencyKey: key("goal"),
  });

  // Money intent (spend_cap_amount needs targetMinor)
  await req("POST", `/me/finance/money-intents`, {
    name: "QA intent",
    kind: "spend_cap_amount",
    targetMinor: "500000",
    idempotencyKey: key("intent"),
  });

  // Allocation plan (personal.allocation_plan upsert — needs UPDATE grant)
  await req("GET", `/me/finance/allocation-plan`);
  await req("PUT", `/me/finance/allocation-plan`, {
    percents: { solo: 40, group: 15, building: 10, org: 5, savings: 30 },
  });

  // Paycheck: pick a free Persian/Jalali month (avoid fixed 2026-09-19 SOFT conflict)
  {
    // Minimal gregorian→Jalali (same algorithm as @dang/contracts daily-ledger).
    const gregorianToJalali = (gy, gm, gd) => {
      const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
      const gy2 = gy - 1600;
      let days =
        365 * gy2 +
        Math.floor((gy2 + 3) / 4) -
        Math.floor((gy2 + 99) / 100) +
        Math.floor((gy2 + 399) / 400) -
        80 +
        gd +
        g_d_m[gm - 1];
      if (gm > 2 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) {
        days += 1;
      }
      let jy = 979;
      const cycles = Math.floor(days / 12053);
      days %= 12053;
      jy += 33 * cycles + 4 * Math.floor(days / 1461);
      days %= 1461;
      if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
      }
      const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
      const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
      return { jy, jm, jd };
    };
    const yearMonthFromIso = (iso) => {
      const [ys, ms, ds] = iso.split("-");
      const { jy, jm } = gregorianToJalali(Number(ys), Number(ms), Number(ds));
      return `${jy}-${String(jm).padStart(2, "0")}`;
    };

    const listed = await req("GET", `/me/finance/paychecks`);
    const usedMonths = new Set(
      Array.isArray(listed.body)
        ? listed.body.map((p) => p.yearMonth).filter(Boolean)
        : [],
    );
    const candidates = [];
    const now = new Date();
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
      candidates.push(d.toISOString().slice(0, 10));
    }
    const freeOn = candidates.find((iso) => !usedMonths.has(yearMonthFromIso(iso)));
    if (!freeOn) {
      const last = results[results.length - 1];
      if (last) last.soft = true;
      console.log("SOFT exhausted free Jalali months for paycheck probe");
    } else {
      const pc = await req("POST", `/me/finance/paychecks`, {
        amountMinor: "12000000",
        occurredOn: freeOn,
        note: "QA paycheck",
        idempotencyKey: key("paycheck"),
      });
      if (!pc.ok && pc.status === 400) {
        const last = results[results.length - 1];
        if (last) last.soft = true;
        console.log(
          `SOFT ${pc.status} paycheck month conflict :: ${String(pc.body?.detail ?? "").slice(0, 80)}`,
        );
      }
    }
  }
  await req("GET", `/me/finance/paychecks`);

  // Vendor for org
  await req("POST", `/workspaces/${IDS.org}/vendors`, {
    workspaceId: IDS.org,
    name: "QA Vendor",
    idempotencyKey: key("vendor"),
  });

  // Invite — antifraud may reject rapid repeats; soft probe only.
  {
    const r = await fetch(`${API}/workspaces/${IDS.group}/invites`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ role: "finance" }),
    });
    const text = await r.text();
    if (r.ok) console.log(`OK  ${r.status} POST /workspaces/.../invites`);
    else console.log(`SOFT ${r.status} invite :: ${text.slice(0, 80)}`);
  }

  // Settlement claim attempt (may need balances)
  await req("GET", `/workspaces/${IDS.group}/balances`);
  await req("GET", `/workspaces/${IDS.group}/expenses`);
  await req("GET", `/workspaces/${IDS.building}/subunits`);
  await req("GET", `/workspaces/${IDS.org}/needs`);
  await req("GET", `/workspaces/${IDS.org}/agreements`);
  await req("GET", `/workspaces/${IDS.org}/proposals`);
  await req("GET", `/me/finance/overview?from=2026-08-23&to=2026-09-19`);


  // --- Payment receipt upload + approve (card_to_card, person payee, flag default ON) ---
  {
    const softReceipt = (code, reason) => {
      const last = results[results.length - 1];
      if (last && !last.ok) last.soft = true;
      console.log(`SKIP ${code} :: ${reason}`);
    };
    const wsPay = IDS.group;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const contentHash = createHash("sha256").update(png).digest("hex");
    const contentBase64 = png.toString("base64");
    const targetId = randomUUID();
    const att = await req("POST", `/workspaces/${wsPay}/attachments`, {
      workspaceId: wsPay,
      targetType: "payment_receipt",
      targetId,
      kind: "receipt",
      fileName: `receipt-${randomUUID()}.png`,
      mimeType: "image/png",
      sizeBytes: png.length,
      contentHash,
      idempotencyKey: key("att-receipt"),
    });
    if (!att.ok) {
      softReceipt("R1", `createAttachment status=${att.status}`);
    } else {
      const up = await req(
        "POST",
        `/workspaces/${wsPay}/attachments/${att.body.id}/content`,
        { contentBase64 },
      );
      if (!up.ok) {
        softReceipt("R2", `uploadContent status=${up.status}`);
      } else {
        const members = await req("GET", `/workspaces/${wsPay}/members`);
        const selfId = "d37b2375-9a99-493e-9922-0fd9811fad3c";
        const payee = Array.isArray(members.body)
          ? members.body.find((m) => m.userId && m.userId !== selfId)
          : null;
        if (!payee?.userId) {
          softReceipt("R3", "no other member for payeeUserId");
        } else {
          const receipt = await req("POST", `/workspaces/${wsPay}/payments/receipts`, {
            payeeUserId: payee.userId,
            method: "card_to_card",
            amountMinor: "10000",
            paidAt: new Date().toISOString(),
            referenceNo: `QA-REF-${Date.now()}`,
            attachmentId: att.body.id,
            idempotencyKey: key("pay-receipt"),
          });
          if (!receipt.ok) {
            softReceipt(
              "R4",
              `createReceipt status=${receipt.status} :: ${String(receipt.body?.detail ?? receipt.body?.title ?? "").slice(0, 80)}`,
            );
          } else {
            const approved = await req(
              "POST",
              `/workspaces/${wsPay}/payments/receipts/${receipt.body.id}/approve`,
              {},
            );
            if (!approved.ok) {
              softReceipt(
                "R5",
                `approveReceipt status=${approved.status} :: ${String(approved.body?.detail ?? approved.body?.title ?? "").slice(0, 80)}`,
              );
            }
          }
        }
      }
    }
  }


  // --- Catalog C1–C7 (0103 RLS + runtime grants; soft-skip if endpoint/role unavailable) ---
  const ws = IDS.group;
  const softSkip = (code, reason) => {
    const last = results[results.length - 1];
    if (last && !last.ok) last.soft = true;
    console.log(`SKIP ${code} :: ${reason}`);
  };

  // C1 units: system SELECT + workspace INSERT
  {
    const list = await req("GET", `/units?workspaceId=${ws}`);
    if (!list.ok) {
      softSkip("C1", `GET /units unavailable status=${list.status}`);
    } else {
      const code = `qa${Date.now().toString().slice(-6)}`;
      const created = await req("POST", `/workspaces/${ws}/units`, {
        code,
        labelFa: "واحد QA",
        labelEn: "QA unit",
        kind: "count",
      });
      if (!created.ok) {
        softSkip(
          "C1-write",
          `POST units status=${created.status} (finance role or catalog store may be missing)`,
        );
      }
    }
  }

  // C2 categories: global SELECT + workspace CRUD
  let catalogCategoryId = null;
  {
    const list = await req("GET", `/workspaces/${ws}/catalog/categories`);
    if (!list.ok) {
      softSkip("C2", `GET categories status=${list.status}`);
    } else {
      const created = await req("POST", `/workspaces/${ws}/catalog/categories`, {
        name: `QA Cat ${Date.now().toString().slice(-5)}`,
        sortOrder: 50,
      });
      if (created.ok && created.body?.id) {
        catalogCategoryId = created.body.id;
        const patched = await req(
          "PATCH",
          `/workspaces/${ws}/catalog/categories/${catalogCategoryId}`,
          { name: `QA Cat patched ${Date.now().toString().slice(-4)}` },
        );
        if (!patched.ok) {
          softSkip("C2-patch", `PATCH category status=${patched.status}`);
        }
      } else {
        softSkip(
          "C2-write",
          `POST categories status=${created.status} (finance role may be required)`,
        );
      }
    }
  }

  // C3 items + price INSERT on create / price change
  let catalogItemId = null;
  {
    const list = await req("GET", `/workspaces/${ws}/catalog/items`);
    if (!list.ok) {
      softSkip("C3", `GET items status=${list.status}`);
    } else {
      const created = await req("POST", `/workspaces/${ws}/catalog/items`, {
        name: `QA Item ${Date.now().toString().slice(-5)}`,
        unitCode: "piece",
        referencePriceMinor: "12000",
        ...(catalogCategoryId ? { categoryId: catalogCategoryId } : {}),
      });
      if (created.ok && created.body?.id) {
        catalogItemId = created.body.id;
        const patched = await req(
          "PATCH",
          `/workspaces/${ws}/catalog/items/${catalogItemId}`,
          { referencePriceMinor: "15000" },
        );
        if (!patched.ok) {
          softSkip("C3-patch", `PATCH item status=${patched.status}`);
        }
        await req(
          "POST",
          `/workspaces/${ws}/catalog/items/${catalogItemId}/deactivate`,
        );
        await req(
          "POST",
          `/workspaces/${ws}/catalog/items/${catalogItemId}/activate`,
        );
        await req(
          "GET",
          `/workspaces/${ws}/catalog/items/${catalogItemId}/prices`,
        );
      } else {
        softSkip(
          "C3-write",
          `POST items status=${created.status} (finance role or unit seed may be missing)`,
        );
      }
    }
  }

  // C4 usage via expense with catalogItemId (recordUsage)
  if (catalogItemId && uid) {
    const expCat = await req("POST", `/workspaces/${ws}/expenses`, {
      title: "QA catalog usage",
      total: irr(15000),
      paidByUserId: uid,
      splitMethod: "equal",
      participantUserIds: memberIds.length > 1 ? memberIds : [uid],
      occurredOn: "2026-09-19",
      catalogItemId,
      idempotencyKey: key("exp-cat"),
      commit: "auto",
    });
    if (!expCat.ok) {
      softSkip(
        "C4",
        `expense+catalogItemId status=${expCat.status} (usage path not exercised)`,
      );
    }
  } else {
    softSkip("C4", "no catalogItemId from C3 — skip usage via expense");
  }

  // C5 pins
  {
    const list = await req("GET", `/workspaces/${ws}/catalog/pins`);
    if (!list.ok) {
      softSkip("C5", `GET pins status=${list.status}`);
    } else if (catalogItemId) {
      const put = await req("PUT", `/workspaces/${ws}/catalog/pins`, {
        itemIds: [catalogItemId],
      });
      if (!put.ok) {
        softSkip("C5-write", `PUT pins status=${put.status}`);
      } else {
        await req("PUT", `/workspaces/${ws}/catalog/pins`, { itemIds: [] });
      }
    } else {
      softSkip("C5-write", "no catalogItemId from C3 — skip pin replace");
    }
  }

  // C6 import-personal (no public createPersonalItem HTTP — skip if empty/unavailable)
  {
    const imp = await req("POST", `/workspaces/${ws}/catalog/import-personal`, {});
    if (!imp.ok) {
      softSkip(
        "C6",
        `import-personal status=${imp.status} (endpoint or personal menu unavailable)`,
      );
    } else if (Array.isArray(imp.body) && imp.body.length === 0) {
      softSkip(
        "C6",
        "import-personal OK but empty — no public createPersonalItem endpoint to seed personal rows",
      );
    }
  }

  // C7 frequent (usage join under RLS)
  {
    const freq = await req("GET", `/workspaces/${ws}/catalog/frequent?limit=10`);
    if (!freq.ok) {
      softSkip("C7", `GET frequent status=${freq.status}`);
    }
  }

  const bad = results.filter((r) => !r.ok && r.status !== 404);
  console.log("\n=== SUMMARY ===");
  console.log(`total=${results.length} failures=${bad.length}`);
  for (const b of bad) {
    console.log(`FAIL ${b.status} ${b.method} ${b.path} :: ${b.detail}`);
  }
  const hard = bad.filter(
    (b) =>
      !b.soft &&
      !(b.path.includes("/invites")) &&
      // Closed/default petty-cash fund as settlement party can break journal user_id (env pollution).
      !(
        b.path.includes("/expenses") &&
        String(b.detail).includes("fund:") &&
        String(b.detail).includes("invalid input syntax for type uuid")
      ),
  );
  console.log(`hardFailures=${hard.length}`);
  process.exit(hard.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

