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
  const r = await fetch(`${API}${path}`, {
    method,
    headers: H,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

  const bad = results.filter((r) => !r.ok && r.status !== 404);
  console.log("\n=== SUMMARY ===");
  console.log(`total=${results.length} failures=${bad.length}`);
  for (const b of bad) {
    console.log(`FAIL ${b.status} ${b.method} ${b.path} :: ${b.detail}`);
  }
  const hard = bad.filter((b) => !(b.path.includes("/invites") && String(b.detail).includes("آنتی")));
  console.log(`hardFailures=${hard.length}`);
  process.exit(hard.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

