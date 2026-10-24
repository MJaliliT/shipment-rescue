import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { investigate, type EvidenceTask } from "../src/engine.ts";
import { fixtureReader } from "../src/fixtures.ts";
import { allocateDrafts } from "../src/allocation.ts";
const fixture = () =>
  JSON.parse(
    fs.readFileSync(new URL("../data/cases.json", import.meta.url), "utf8"),
  );
const adaptive = () =>
  JSON.parse(
    fs.readFileSync(
      new URL("../data/adaptive-cases.json", import.meta.url),
      "utf8",
    ),
  );

test("stale handoff triggers scoped refresh, then a rejected fast plan becomes a feasible alternative", async () => {
  const d = adaptive(),
    calls: EvidenceTask[] = [];
  const source = fixtureReader(d);
  const r = await investigate(d, "AD-201", {
    readEvidence: async (t) => {
      calls.push(t);
      return source(t);
    },
  });
  assert.equal(r.cause, "warehouse_stockout");
  assert.match(r.actions[0].title, /East/);
  assert.deepEqual(
    calls.map((t) => [t.source, t.attempt]),
    [
      ["carrier", 1],
      ["warehouse", 1],
      ["warehouse", 2],
      ["inventory", 1],
    ],
  );
  assert.ok(calls[2].reason.includes("stale"));
  assert.ok(!r.evidence.some((e) => e.id === "W201-old"));
  assert.ok(r.citations.includes("W201-current"));
  const reject = r.trace.findIndex((t) => t.event === "recovery_rejected"),
    accept = r.trace.findIndex((t) => t.event === "recovery_accepted");
  assert.ok(reject >= 0 && accept > reject);
  assert.equal(r.trace[reject].warehouse, "West");
  assert.equal(r.trace[accept].warehouse, "East");
  assert.equal(r.workflow.rejectedPlans, 1);
});
test("confirmed dispatch branches to carrier action without querying inventory", async () => {
  const d = fixture(),
    calls: string[] = [];
  const r = await investigate(d, "SR-102", {
    readEvidence: async (t) => {
      calls.push(t.source);
      return d[t.source];
    },
  });
  assert.equal(r.cause, "carrier_eta_delay");
  assert.deepEqual(calls, ["carrier", "warehouse"]);
  assert.equal(r.workflow.sourceAttempts.inventory, 0);
});
test("transient source outage is retried and can recover", async () => {
  const d = fixture();
  let warehouseCalls = 0;
  const r = await investigate(d, "SR-101", {
    readEvidence: async (t) => {
      if (t.source === "warehouse" && warehouseCalls++ === 0)
        throw new Error("transient outage");
      return d[t.source];
    },
  });
  assert.equal(warehouseCalls, 2);
  assert.equal(r.cause, "warehouse_stockout");
  assert.ok(r.trace.some((t) => t.event === "tool_failed"));
  assert.equal(r.workflow.status, "resolved");
});
test("permanent outage stops after two attempts and never seeks recovery inventory", async () => {
  const d = fixture();
  let calls = 0;
  const r = await investigate(d, "SR-101", {
    readEvidence: async (t) => {
      if (t.source === "warehouse") {
        calls++;
        throw new Error("permanent outage");
      }
      assert.notEqual(t.source, "inventory");
      return d[t.source];
    },
  });
  assert.equal(calls, 2);
  assert.equal(r.cause, "unverified");
  assert.equal(r.workflow.status, "escalated");
  assert.equal(r.actions[0].type, "request_evidence");
});
test("conflicting latest handoff can be resolved by a new source snapshot", async () => {
  const d = fixture();
  d.warehouse.push({
    ...d.warehouse[0],
    id: "W-conflict",
    status: "dispatched",
  });
  const r = await investigate(d, "SR-101", {
    readEvidence: async (t) =>
      t.source === "warehouse" && t.mode === "refresh"
        ? [{ ...d.warehouse[0], id: "W-corrected", observedAt: d.asOf }]
        : d[t.source],
  });
  assert.equal(r.cause, "warehouse_stockout");
  assert.ok(r.citations.includes("W-corrected"));
  assert.ok(
    r.trace.some(
      (t) => t.event === "evidence_rejected" && t.issues[0].code === "conflict",
    ),
  );
});
test("fresh inventory request follows a stale-plan critique and uses only the returned revision", async () => {
  const d = fixture();
  d.inventory[0].observedAt = "2026-10-20T00:00:00Z";
  const r = await investigate(d, "SR-101", {
    readEvidence: async (t) =>
      t.source === "inventory" && t.mode === "refresh"
        ? [{ ...d.inventory[0], id: "I-fresh", observedAt: d.asOf }]
        : d[t.source],
  });
  assert.equal(r.workflow.sourceAttempts.inventory, 2);
  assert.equal(r.actions[0].type, "request_stock_reservation");
  assert.ok(r.actions[0].evidence.includes("I-fresh"));
  assert.ok(
    r.trace.some(
      (t) =>
        t.event === "recovery_rejected" &&
        t.reasons.some((x: any) => x.code === "inventory_stale"),
    ),
  );
});
test("unchanged stale evidence exhausts refresh budget and escalates", async () => {
  const d = fixture();
  d.inventory[0].observedAt = "2026-10-20T00:00:00Z";
  const r = await investigate(d, "SR-101");
  assert.equal(r.workflow.sourceAttempts.inventory, 2);
  assert.equal(r.actions[0].type, "escalate_stockout");
  assert.ok(r.workflow.recoveryAttempts <= 6);
});
test("a regressed warehouse refresh cannot replace newer contradictory evidence", async () => {
  const d = fixture();
  d.warehouse[0].status = "dispatched";
  const r = await investigate(d, "SR-101", {
    readEvidence: async (t) =>
      t.source === "warehouse" && t.mode === "refresh"
        ? [
            {
              ...d.warehouse[0],
              status: "stockout",
              observedAt: "2026-10-20T00:00:00Z",
            },
          ]
        : d[t.source],
  });
  assert.equal(r.cause, "unverified");
  assert.equal(
    r.evidence.find((e) => e.source === "warehouse")?.status,
    "dispatched",
  );
  assert.ok(
    r.trace.some((t) => t.event === "tool_failed" && t.tool === "warehouse"),
  );
});
test("batch evaluator returns a capacity-rejected proposal to the planner and allocates another warehouse", async () => {
  const d = adaptive();
  const a = await investigate(d, "AD-201", { readEvidence: fixtureReader(d) });
  const b = structuredClone(a);
  b.orderId = "AD-204";
  b.priority = 2;
  b.trace = [];
  // East holds six units: first draft uses four; the second cannot promise four.
  let r = allocateDrafts([a, b]);
  assert.equal(r[1].actions[0].type, "escalate_stockout");
  assert.ok(r[1].trace.some((t: any) => t.event === "batch_recovery_rejected"));
  for (const c of [a, b])
    c.evidence.push({
      id: "I-third",
      source: "inventory",
      sku: "PUMP-A",
      warehouse: "North",
      available: 4,
      transferHours: 7,
      observedAt: d.asOf,
    });
  r = allocateDrafts([a, b]);
  assert.match(r[1].actions[0].title, /North/);
  assert.equal(r[1].draftAllocation.availableAfter, 0);
  assert.ok(r[1].trace.some((t: any) => t.event === "replan_requested"));
});

test("a null or blank JDBC transfer estimate is rejected rather than becoming zero hours", async () => {
  const { normalizeZetarisRows } = await import("../src/zetaris.ts");
  const row = {
    ID: "I",
    SKU: "PUMP-A",
    WAREHOUSE: "West",
    AVAILABLE: "4",
    TRANSFERHOURS: null,
    OBSERVEDAT: "2026-10-23T16:30:00Z",
  };
  assert.throws(
    () => normalizeZetarisRows("inventory", [row]),
    /Empty inventory.transferHours/,
  );
  assert.throws(
    () => normalizeZetarisRows("inventory", [{ ...row, TRANSFERHOURS: "" }]),
    /Empty inventory.transferHours/,
  );
  assert.equal(
    normalizeZetarisRows("inventory", [{ ...row, TRANSFERHOURS: "6" }])[0]
      .transferHours,
    6,
  );
});

test("model planner receives a structured rejection before choosing another supported candidate", async () => {
  const d = adaptive();
  d.inventory.push({
    id: "I-north",
    sku: "PUMP-A",
    warehouse: "North",
    available: 4,
    transferHours: 7,
    observedAt: d.asOf,
  });
  // West has insufficient capacity. A deliberately wrong first model choice must
  // be rejected; a later choice remains subject to the same independent gate.
  const priorFetch = globalThis.fetch;
  const saved = Object.fromEntries(
    ["NIGHTSHIFT_TOKEN", "NIGHTSHIFT_MIN_INTERVAL_MS"].map((k) => [
      k,
      process.env[k],
    ]),
  );
  process.env.NIGHTSHIFT_TOKEN = "unit-test-only";
  process.env.NIGHTSHIFT_MIN_INTERVAL_MS = "0";
  const plans: any[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const prompt = body.messages[0].content;
    let choice = "stockout";
    if (prompt.startsWith("Select ONE")) choice = "carrier";
    if (prompt.startsWith("Select one recovery candidate")) {
      plans.push(JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)));
      choice = "option_1";
    }
    return new Response(
      JSON.stringify({
        model: "unit-test-model",
        choices: [{ message: { content: choice } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as any;
  try {
    const r = await investigate(d, "AD-201", {
      live: true,
      readEvidence: fixtureReader(d),
    });
    assert.equal(plans.length, 2);
    assert.equal(plans[1].feedback[0].reasons[0].code, "insufficient_capacity");
    assert.match(r.actions[0].title, /East/);
    assert.equal(r.workflow.rejectedPlans, 1);
    assert.equal(r.modelExecution.successfulPlanningDecisions, 2);
    assert.equal(r.review.status, "model_agreement");
  } finally {
    globalThis.fetch = priorFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
