import test from "node:test";
import assert from "node:assert/strict";
import { allocateDrafts } from "../src/allocation.ts";
const stock = (available = 7) => ({
  id: "I1",
  source: "inventory",
  sku: "A",
  warehouse: "West",
  available,
  transferHours: 4,
  observedAt: "2026-10-23T16:00:00Z",
});
const order = (id: string, priority: number, evidence: any[] = [stock()]) => ({
  orderId: id,
  priority,
  sku: "A",
  quantity: 4,
  asOf: "2026-10-23T17:00:00Z",
  promisedAt: "2026-10-24T17:00:00Z",
  synthetic: true,
  cause: "warehouse_stockout",
  evidence,
  citations: [],
  trace: [],
  actions: [],
});
test("shared stock cannot fund two competing drafts; priority beats input order", () => {
  const input = [order("B", 2), order("A", 1)];
  const r = allocateDrafts(input);
  assert.equal(r[1].draftAllocation.availableAfter, 3);
  assert.equal(r[0].actions[0].type, "escalate_stockout");
  assert.deepEqual(input[0].actions, []);
});
test("alternate warehouse handles remaining demand and every action citation resolves", () => {
  const east = { ...stock(4), id: "I2", warehouse: "East", transferHours: 6 };
  const r = allocateDrafts([order("A", 1, [stock(), east]), order("B", 2, [])]);
  assert.match(r[1].actions[0].title, /East/);
  assert.ok(r[1].evidence.some((x: any) => x.id === "I2"));
  assert.equal(r[1].draftAllocation.availableAfter, 0);
});
test("equal-time stock conflicts and newer depletion block drafts", () => {
  for (const row of [
    { ...stock(2), id: "I2" },
    { ...stock(0), id: "I2", observedAt: "2026-10-23T16:30:00Z" },
  ]) {
    const r = allocateDrafts([order("A", 1, [stock(), row])]);
    assert.equal(r[0].actions[0].type, "escalate_stockout");
  }
});
test("stale and future capacity cannot support a draft", () => {
  for (const observedAt of ["2026-10-20T00:00:00Z", "2026-10-24T00:00:00Z"])
    assert.equal(
      allocateDrafts([order("A", 1, [{ ...stock(), observedAt }])])[0]
        .actions[0].type,
      "escalate_stockout",
    );
});
test("duplicate orders and mixed snapshots are rejected", () => {
  assert.throws(
    () => allocateDrafts([order("A", 1), order("A", 2)]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      allocateDrafts([order("A", 1), { ...order("B", 2), synthetic: false }]),
    /consistent snapshot/,
  );
});
test("capacity invariant holds across 100 synthetic competing-order batches", () => {
  for (let capacity = 0; capacity < 100; capacity++) {
    const orders = Array.from({ length: 12 }, (_, i) => ({
      ...order(String(i), i + 1, [stock(capacity)]),
      quantity: (i % 5) + 1,
    }));
    const r = allocateDrafts(orders.reverse());
    const allocated = r.filter((x) => x.draftAllocation);
    assert.ok(
      allocated.reduce((n, x) => n + x.draftAllocation.quantity, 0) <= capacity,
    );
    assert.ok(allocated.every((x) => x.draftAllocation.availableAfter >= 0));
  }
});
