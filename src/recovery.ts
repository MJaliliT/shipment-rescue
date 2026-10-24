export const poolKey = (row: any) => JSON.stringify([row.sku, row.warehouse]);
export function inventoryCandidates(evidence: any[]) {
  const groups = new Map<string, any[]>();
  for (const row of evidence.filter((r) => r.source === "inventory")) {
    const key = poolKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      rows.sort(
        (a, b) =>
          Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
          a.id.localeCompare(b.id),
      );
      const row = rows[0];
      const conflicting = rows.some(
        (r) =>
          Date.parse(r.observedAt) === Date.parse(row.observedAt) &&
          (r.available !== row.available ||
            r.transferHours !== row.transferHours),
      );
      return { ...row, poolKey: key, conflicting };
    })
    .sort(
      (a, b) =>
        a.transferHours - b.transferHours || a.poolKey.localeCompare(b.poolKey),
    );
}
export function evaluateRecovery(
  candidate: any,
  order: any,
  asOf: string,
  available = candidate.available,
) {
  const reasons: { code: string; detail: string }[] = [];
  if (candidate.sku !== order.sku)
    reasons.push({
      code: "wrong_sku",
      detail: "Inventory does not match the order SKU",
    });
  if (candidate.conflicting)
    reasons.push({
      code: "inventory_conflict",
      detail:
        "Conflicting latest stock observations require refreshed inventory",
    });
  const age = Date.parse(asOf) - Date.parse(candidate.observedAt);
  if (age < 0 || age > 86400000)
    reasons.push({
      code: "inventory_stale",
      detail:
        "Inventory is stale or from after this snapshot; refresh required",
    });
  if (available < order.quantity)
    reasons.push({
      code: "insufficient_capacity",
      detail: `${available} units available after prior draft allocations; ${order.quantity} required`,
    });
  if (
    Date.parse(asOf) + (candidate.transferHours + 8) * 3600000 >
    Date.parse(order.promisedAt)
  )
    reasons.push({
      code: "promise_infeasible",
      detail:
        "Transfer plus assumed 8h handling/delivery buffer exceeds the promise",
    });
  return { accepted: reasons.length === 0, reasons };
}
export function recoveryAction(
  candidate: any,
  order: any,
  citations: string[],
) {
  return {
    type: "request_stock_reservation",
    status: "draft_requires_review",
    title: `Request ${order.quantity} units from ${candidate.warehouse}`,
    evidence: [...new Set([...citations, candidate.id])],
    detail: `Reported capacity: ${candidate.available}. Transfer estimate: ${candidate.transferHours}h plus an assumed 8h handling/delivery buffer. No stock reserved; confirm capacity, transit and cutoff before commitment.`,
  };
}
