import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  buildReviewPacket,
  validateOperatorReview,
} from "../src/operator-review.ts";
const context = {
  snapshotId: "snapshot-a",
  asOf: "2026-10-23T17:00:00Z",
  synthetic: true,
  cases: [
    {
      orderId: "AD-201",
      evidence: [{ id: "W201-current" }],
      actions: [{ status: "draft_requires_review" }],
    },
  ],
};
test("handoff export preserves evidence and keeps every action as a draft", () => {
  const packet = buildReviewPacket(
    context,
    {
      "AD-201": {
        disposition: "ready_for_handoff",
        note: "Confirm stock with East before reserving.",
        reviewedAt: "2026-10-23T18:00:00Z",
      },
    },
    "2026-10-23T18:01:00Z",
  );
  assert.equal(packet.snapshotId, "snapshot-a");
  assert.equal(packet.synthetic, true);
  assert.equal(packet.cases[0].review.disposition, "ready_for_handoff");
  assert.deepEqual(packet.cases[0].evidence, context.cases[0].evidence);
  assert.equal(packet.cases[0].actions[0].status, "draft_requires_review");
  assert.match(packet.scope, /No inventory reservation/);
});
test("reviewed handoffs require a note and timestamp; unsupported dispositions fail", () => {
  for (const value of [
    { disposition: "executed", note: "x", reviewedAt: null },
    {
      disposition: "ready_for_handoff",
      note: " ",
      reviewedAt: "2026-10-23T18:00:00Z",
    },
    { disposition: "needs_followup", note: "x", reviewedAt: null },
    { disposition: "unreviewed", note: "x".repeat(2001), reviewedAt: null },
  ])
    assert.throws(() => validateOperatorReview(value));
});
test("foreign case reviews cannot enter the current snapshot packet", () => {
  const packet = buildReviewPacket(
    context,
    {
      "other-snapshot-case": {
        disposition: "ready_for_handoff",
        note: "x",
        reviewedAt: "2026-10-23T18:00:00Z",
      },
    },
    "2026-10-23T18:01:00Z",
  );
  assert.equal(packet.cases.length, 1);
  for (const orderId of ["__proto__", "constructor", "toString"]) {
    const isolated = buildReviewPacket(
      { ...context, cases: [{ orderId }] },
      {},
      "2026-10-23T18:01:00Z",
    );
    assert.equal(isolated.cases[0].review.disposition, "unreviewed");
  }
  assert.deepEqual(packet.cases[0].review, {
    disposition: "unreviewed",
    note: "",
    reviewedAt: null,
  });
});
test("review helpers run in a plain browser JavaScript context", () => {
  const result = vm.runInNewContext(
    `const validateOperatorReview=${validateOperatorReview.toString()};const buildReviewPacket=${buildReviewPacket.toString()};buildReviewPacket(${JSON.stringify(context)},{},'2026-10-23T18:01:00Z')`,
  );
  assert.equal(result.cases[0].review.disposition, "unreviewed");
});
