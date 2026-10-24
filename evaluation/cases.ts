import type { Dataset } from "../src/engine.ts";
function base(id: string): Dataset {
  return {
    synthetic: true,
    asOf: "2026-10-23T17:00:00Z",
    orders: [
      {
        id,
        sku: "EVAL-SKU",
        quantity: 4,
        promisedAt: "2026-10-24T17:00:00Z",
        priority: 1,
      },
    ],
    carrier: [
      {
        id: "EC1",
        orderId: id,
        status: "label_created",
        eta: "2026-10-26T17:00:00Z",
        observedAt: "2026-10-23T16:00:00Z",
      },
    ],
    warehouse: [
      {
        id: "EW1",
        orderId: id,
        status: "stockout",
        reserved: 0,
        observedAt: "2026-10-23T16:30:00Z",
      },
    ],
    inventory: [
      {
        id: "EI1",
        sku: "EVAL-SKU",
        warehouse: "North",
        available: 6,
        transferHours: 5,
        observedAt: "2026-10-23T16:30:00Z",
      },
    ],
  };
}
const cases: any[] = [];
function scenario(
  id: string,
  mutate: (d: Dataset) => void,
  cause: string,
  risk: string,
  action: string | null,
) {
  const data = base(id);
  mutate(data);
  cases.push({ id, data, expected: { cause, risk, action } });
}
scenario(
  "E01-stockout",
  () => {},
  "warehouse_stockout",
  "at_risk",
  "request_stock_reservation",
);
scenario(
  "E02-carrier",
  (d) => {
    d.warehouse[0].status = "dispatched";
    d.carrier[0].status = "in_transit";
  },
  "carrier_eta_delay",
  "at_risk",
  "request_carrier_investigation",
);
scenario(
  "E03-ontime",
  (d) => {
    d.warehouse[0].status = "dispatched";
    d.carrier[0].status = "in_transit";
    d.carrier[0].eta = "2026-10-24T12:00:00Z";
  },
  "none",
  "on_track",
  null,
);
scenario(
  "E04-missing",
  (d) => {
    d.carrier = [];
  },
  "unverified",
  "unknown",
  "request_evidence",
);
scenario(
  "E05-stale",
  (d) => {
    d.warehouse[0].observedAt = "2026-10-21T12:00:00Z";
  },
  "unverified",
  "unknown",
  "request_evidence",
);
scenario(
  "E06-conflict",
  (d) => {
    d.warehouse.push({ ...d.warehouse[0], id: "EW2", status: "dispatched" });
  },
  "unverified",
  "unknown",
  "request_evidence",
);
scenario(
  "E07-revised",
  (d) => {
    d.warehouse.push({
      ...d.warehouse[0],
      id: "EW2",
      status: "dispatched",
      observedAt: "2026-10-23T16:45:00Z",
    });
    d.carrier.push({
      ...d.carrier[0],
      id: "EC2",
      status: "in_transit",
      observedAt: "2026-10-23T16:45:00Z",
    });
  },
  "carrier_eta_delay",
  "at_risk",
  "request_carrier_investigation",
);
scenario(
  "E08-depleted",
  (d) => {
    d.inventory.push({
      ...d.inventory[0],
      id: "EI2",
      available: 0,
      observedAt: "2026-10-23T16:45:00Z",
    });
  },
  "warehouse_stockout",
  "at_risk",
  "escalate_stockout",
);
scenario(
  "E09-late-transfer",
  (d) => {
    d.inventory[0].transferHours = 80;
  },
  "warehouse_stockout",
  "at_risk",
  "escalate_stockout",
);
scenario(
  "E10-stale-stock",
  (d) => {
    d.inventory[0].observedAt = "2026-10-20T12:00:00Z";
  },
  "warehouse_stockout",
  "at_risk",
  "escalate_stockout",
);
scenario(
  "E11-contradiction",
  (d) => {
    d.carrier[0].status = "in_transit";
  },
  "unverified",
  "unknown",
  "request_evidence",
);
scenario(
  "E12-stock-conflict",
  (d) => {
    d.inventory.push({ ...d.inventory[0], id: "EI2", available: 0 });
  },
  "warehouse_stockout",
  "at_risk",
  "escalate_stockout",
);
export default cases;
