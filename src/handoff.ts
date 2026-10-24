export type EvidenceSource = "carrier" | "warehouse" | "inventory";
export type EvidenceIssue = {
  source: EvidenceSource;
  code: string;
  reason: string;
};
/** Source evidence determines support; model agreement never overrides this gate. */
export function assessHandoff(order: any, asOf: string, evidence: any[]) {
  const issues: EvidenceIssue[] = [];
  const latest: Record<string, any> = {};
  for (const source of ["carrier", "warehouse"] as const) {
    const rows = evidence
      .filter((r) => r.source === source)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    const row = rows[0];
    latest[source] = row;
    if (!row)
      issues.push({
        source,
        code: "missing",
        reason: `${source} evidence unavailable`,
      });
    else if (Date.parse(asOf) - Date.parse(row.observedAt) > 86400000)
      issues.push({
        source,
        code: "stale",
        reason: `${source} evidence is over 24 hours old`,
      });
    else if (
      rows.some(
        (r) =>
          Date.parse(r.observedAt) === Date.parse(row.observedAt) &&
          (r.status !== row.status ||
            (source === "carrier" &&
              Date.parse(r.eta) !== Date.parse(row.eta))),
      )
    )
      issues.push({
        source,
        code: "conflict",
        reason: `Conflicting ${source} records share the latest timestamp`,
      });
  }
  let cause = "unverified",
    risk = "unknown",
    summary = "Insufficient current evidence to assign a cause.";
  const { carrier, warehouse } = latest;
  const citations: string[] = [];
  if (!issues.length) {
    citations.push(carrier.id, warehouse.id);
    if (warehouse.status === "stockout" && carrier.status === "label_created") {
      cause = "warehouse_stockout";
      risk = "at_risk";
      summary =
        "Warehouse reports a stockout and the carrier has only a label; there is no evidence of carrier custody.";
    } else if (
      warehouse.status === "dispatched" &&
      carrier.status === "in_transit"
    ) {
      const overdue = Date.parse(asOf) > Date.parse(order.promisedAt),
        late = Date.parse(carrier.eta) > Date.parse(order.promisedAt);
      risk = overdue || late ? "at_risk" : "on_track";
      cause = overdue
        ? "delivery_overdue"
        : late
          ? "carrier_eta_delay"
          : "none";
      summary = overdue
        ? "The delivery promise has expired while the carrier still reports in-transit; obtain a current delivery update."
        : late
          ? "Carrier ETA exceeds the promised delivery time after warehouse dispatch. The underlying cause of carrier delay is not established."
          : "Current carrier ETA meets the promise and warehouse confirms dispatch.";
    } else
      for (const source of ["carrier", "warehouse"] as const)
        issues.push({
          source,
          code: "inconsistent_handoff",
          reason:
            "Warehouse and carrier states do not establish a consistent handoff",
        });
  }
  return {
    cause,
    risk,
    summary,
    citations,
    issues,
    gaps: [...new Set(issues.map((i) => i.reason))],
  };
}
