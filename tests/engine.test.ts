import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { investigate } from "../src/engine.ts";
import {
  normalizeNightshift,
  Nightshift,
  parseToolChoice,
} from "../src/providers.ts";
const fixture = () =>
  JSON.parse(
    fs.readFileSync(new URL("../data/cases.json", import.meta.url), "utf8"),
  );
test("warehouse evidence revises the apparent carrier problem", async () => {
  const r = await investigate(fixture(), "SR-101");
  assert.equal(r.cause, "warehouse_stockout");
  assert.equal(r.actions[0].type, "request_stock_reservation");
  assert.ok(r.trace.some((t) => t.event === "hypothesis_revised"));
  assert.ok(r.citations.includes("W101"));
});
test("dispatched order with late carrier ETA is classified narrowly", async () => {
  const r = await investigate(fixture(), "SR-102");
  assert.equal(r.cause, "carrier_eta_delay");
  assert.equal(r.actions[0].type, "request_carrier_investigation");
});
test("missing carrier and stale warehouse produce an evidence request", async () => {
  const r = await investigate(fixture(), "SR-103");
  assert.equal(r.risk, "unknown");
  assert.equal(r.cause, "unverified");
  assert.equal(r.actions[0].type, "request_evidence");
});
test("on-time confirmed dispatch has no exception action", async () => {
  const r = await investigate(fixture(), "SR-104");
  assert.equal(r.risk, "on_track");
  assert.deepEqual(r.actions, []);
});
test("insufficient stock does not produce an infeasible transfer", async () => {
  const r = await investigate(fixture(), "SR-105");
  assert.equal(r.actions[0].type, "escalate_stockout");
});
test("tool outage blocks confident attribution", async () => {
  const r = await investigate(fixture(), "SR-101", { failTool: "warehouse" });
  assert.equal(r.cause, "unverified");
  assert.ok(r.trace.some((t) => t.event === "tool_failed"));
});
test("classification follows changed evidence, not case ID", async () => {
  const d = fixture();
  d.warehouse[0].status = "dispatched";
  d.carrier[0].status = "in_transit";
  const r = await investigate(d, "SR-101");
  assert.equal(r.cause, "carrier_eta_delay");
});
test("stale inventory is never recommended", async () => {
  const d = fixture();
  d.inventory[0].observedAt = "2026-10-20T00:00:00Z";
  const r = await investigate(d, "SR-101");
  assert.equal(r.actions[0].type, "escalate_stockout");
});
test("impossible future evidence is rejected", async () => {
  const d = fixture();
  d.warehouse[0].observedAt = "2026-10-25T00:00:00Z";
  await assert.rejects(investigate(d, "SR-101"), /Future evidence/);
});
test("real H-MEM persists recall across independent investigations", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipment-memory-"));
  try {
    await investigate(fixture(), "SR-101", { memoryDir: dir });
    const r = await investigate(fixture(), "SR-101", { memoryDir: dir });
    assert.ok(r.memory.recalled.length > 0);
    assert.ok(r.trace.some((t) => t.event === "recall"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("Nightshift pasted endpoint normalizes without duplicate v1", () => {
  for (const input of [
    "127.0.0.1:8088",
    "http://127.0.0.1:8088/v1",
    "http://127.0.0.1:8088/v1/models",
    "http://127.0.0.1:8088/v1/chat/completions",
    "http://127.0.0.1:8088/healthz",
  ])
    assert.equal(normalizeNightshift(input), "http://127.0.0.1:8088/v1");
});
test("Nightshift missing token is unauthorized, never reported online", async () => {
  const r = await new Nightshift("").status();
  assert.equal(r.status, "unauthorized");
});

test("model output tolerates a single numbered or quoted choice", () => {
  assert.equal(parseToolChoice("1. carrier", ["carrier"]), "carrier");
  assert.equal(parseToolChoice('"warehouse"', ["warehouse"]), "warehouse");
});
test("model output rejects ambiguous plans and completed tools", () => {
  assert.throws(() => parseToolChoice("1. finish\n2. carrier", ["finish"]));
  assert.throws(() => parseToolChoice("warehouse", ["carrier"]));
});

test("expired promise cannot appear on track despite an old optimistic ETA", async () => {
  const d = fixture();
  d.orders.find((r: any) => r.id === "SR-104").promisedAt =
    "2026-10-23T16:45:00Z";
  d.carrier.find((r: any) => r.orderId === "SR-104").eta =
    "2026-10-23T16:40:00Z";
  const r = await investigate(d, "SR-104");
  assert.equal(r.cause, "delivery_overdue");
  assert.equal(r.risk, "at_risk");
  assert.equal(r.actions[0].type, "request_carrier_investigation");
});
test("row order and unrelated inventory do not change the finding", async () => {
  const d = fixture();
  d.inventory.push({
    id: "unrelated",
    sku: "OTHER",
    warehouse: "West",
    available: 999,
    transferHours: 0,
    observedAt: d.asOf,
  });
  for (const table of ["orders", "warehouse", "carrier", "inventory"])
    d[table].reverse();
  const r = await investigate(d, "SR-101");
  assert.equal(r.cause, "warehouse_stockout");
  assert.match(r.actions[0].title, /4 units from West/);
});
