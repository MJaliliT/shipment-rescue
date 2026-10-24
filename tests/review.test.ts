import test from "node:test";
import assert from "node:assert/strict";
import { reviewLoop } from "../src/review.ts";
test("verifier rejection is fed into a revised investigator proposal", async () => {
  const trace: any[] = [];
  let turn = 0;
  const inputs: any[] = [];
  const model = {
    async propose(c: any) {
      inputs.push(c);
      return { choice: turn++ ? "stockout" : "carrier_delay" };
    },
    async critique(c: any) {
      return { choice: c.evidenceGate.supported ? "accept" : "reject" };
    },
  };
  const result = await reviewLoop(
    model,
    { records: [] },
    "warehouse_stockout",
    trace,
  );
  assert.equal(result.status, "model_agreement");
  assert.equal(result.rounds, 2);
  assert.equal(inputs[1].feedback.verdict, "reject");
  assert.ok(trace.some((t) => t.event === "revision_requested"));
});
test("model verifier cannot overrule contradictory source evidence", async () => {
  const trace: any[] = [];
  const model = {
    async propose() {
      return { choice: "carrier_delay" };
    },
    async critique() {
      return { choice: "accept" };
    },
  };
  const result = await reviewLoop(model, {}, "warehouse_stockout", trace);
  assert.equal(result.status, "deterministic_review_fallback");
  assert.equal(result.rounds, 2);
  assert.ok(trace.some((t) => t.event === "review_fallback"));
});
test("review outages have bounded attempts and explicit fallback", async () => {
  let calls = 0;
  const trace: any[] = [];
  const model = {
    async propose() {
      calls++;
      throw new Error("offline");
    },
    async critique() {
      throw new Error("not called");
    },
  };
  const result = await reviewLoop(model, {}, "unverified", trace);
  assert.equal(calls, 2);
  assert.equal(result.errors, 2);
  assert.equal(result.status, "deterministic_review_fallback");
});

test("reviewer facts report timestamp comparisons without an expected cause", async () => {
  const { reviewFacts, classificationPrompt } = await import(
    "../src/review.ts"
  );
  const c = {
    asOf: "2026-10-23T17:00:00Z",
    order: { promisedAt: "2026-10-24T17:00:00Z" },
    evidence: [
      {
        source: "carrier",
        id: "C",
        status: "in_transit",
        eta: "2026-10-25T00:00:00Z",
        observedAt: "2026-10-23T16:00:00Z",
      },
      {
        source: "warehouse",
        id: "W",
        status: "dispatched",
        observedAt: "2026-10-20T00:00:00Z",
      },
    ],
  };
  const f = reviewFacts(c);
  assert.equal(f.carrier.etaAfterPromise, true);
  assert.equal(f.warehouse.stale, true);
  assert.equal(f.promiseExpired, false);
  assert.equal(reviewFacts({ ...c, evidence: [] }).carrier.present, false);
  assert.ok(!classificationPrompt("auditor", c).includes("evidenceGate"));
});
