// Authored after v4 prompt freeze, before its first live run. Do not tune on these results.
import fs from "node:fs";
const sample = JSON.parse(
  fs.readFileSync(new URL("../data/cases.json", import.meta.url), "utf8"),
);
const tests: any[] = [];
function add(
  id: string,
  base: string,
  mutate: (d: any) => void,
  expected: any,
) {
  const data = structuredClone(sample);
  const old = base;
  data.orders = data.orders
    .filter((r: any) => r.id === old)
    .map((r: any) => ({ ...r, id }));
  for (const t of ["carrier", "warehouse"])
    data[t] = data[t]
      .filter((r: any) => r.orderId === old)
      .map((r: any) => ({ ...r, orderId: id }));
  mutate(data);
  tests.push({ id, data, expected });
}
add(
  "H01-renamed-stockout",
  "SR-101",
  (d) => {
    d.orders[0].sku = "NEW-ITEM";
    d.inventory = d.inventory
      .filter((r: any) => r.sku === "PUMP-A")
      .map((r: any) => ({ ...r, sku: "NEW-ITEM" }));
  },
  {
    cause: "warehouse_stockout",
    risk: "at_risk",
    action: "request_stock_reservation",
  },
);
add(
  "H02-missing-warehouse",
  "SR-102",
  (d) => {
    d.warehouse = [];
  },
  { cause: "unverified", risk: "unknown", action: "request_evidence" },
);
add(
  "H03-overdue",
  "SR-104",
  (d) => {
    d.orders[0].promisedAt = "2026-10-23T16:40:00Z";
    d.carrier[0].eta = "2026-10-23T16:30:00Z";
  },
  {
    cause: "delivery_overdue",
    risk: "at_risk",
    action: "request_carrier_investigation",
  },
);
add(
  "H04-newer-handoff",
  "SR-101",
  (d) => {
    d.warehouse.push({
      ...d.warehouse[0],
      id: "WC",
      status: "dispatched",
      observedAt: d.asOf,
    });
    d.carrier.push({
      ...d.carrier[0],
      id: "CC",
      status: "in_transit",
      eta: "2026-10-24T10:00:00Z",
      observedAt: d.asOf,
    });
    d.warehouse.reverse();
  },
  { cause: "none", risk: "on_track", action: null },
);
add(
  "H05-latest-carrier-conflict",
  "SR-102",
  (d) => {
    d.carrier.push({ ...d.carrier[0], id: "CX", eta: "2026-10-24T10:00:00Z" });
  },
  { cause: "unverified", risk: "unknown", action: "request_evidence" },
);
add(
  "H06-short-recovery-window",
  "SR-101",
  (d) => {
    d.orders[0].promisedAt = "2026-10-23T20:00:00Z";
  },
  { cause: "warehouse_stockout", risk: "at_risk", action: "escalate_stockout" },
);
export default tests;
