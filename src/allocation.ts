import { inventoryCandidates, evaluateRecovery } from "./recovery.ts";
/** Reviewable batch proposals only: this never reserves stock or calls a carrier. */
export function allocateDrafts(input: any[]) {
  const results = structuredClone(input);
  if (new Set(results.map((r) => `${r.asOf}|${r.synthetic}`)).size > 1)
    throw new Error(
      "Batch allocation requires one consistent snapshot and data mode",
    );
  const pools = inventoryCandidates(results.flatMap((r) => r.evidence)).map(
    (p) => ({ ...p, remaining: p.available }),
  );
  const ordered = [...results].sort(
    (a, b) => a.priority - b.priority || a.orderId.localeCompare(b.orderId),
  );
  const seen = new Set<string>();
  for (const result of ordered) {
    if (seen.has(result.orderId))
      throw new Error("Duplicate order in allocation batch");
    seen.add(result.orderId);
    if (result.cause !== "warehouse_stockout") continue;
    const order = {
      sku: result.sku,
      quantity: result.quantity,
      promisedAt: result.promisedAt,
    };
    let selected: any = null;
    let rejected = 0;
    const acceptedIds = new Set(
      result.actions
        .filter((a: any) => a.type === "request_stock_reservation")
        .flatMap((a: any) => a.evidence),
    );
    const priorRejected = result.trace.filter(
      (t: any) => t.event === "recovery_rejected",
    );
    const ranked = pools
      .filter(
        (p) =>
          p.sku === result.sku &&
          !priorRejected.some(
            (t: any) => t.recordId === p.id && t.observedAt === p.observedAt,
          ),
      )
      .sort(
        (a, b) =>
          Number(acceptedIds.has(b.id)) - Number(acceptedIds.has(a.id)) ||
          a.transferHours - b.transferHours ||
          a.poolKey.localeCompare(b.poolKey),
      );
    for (const pool of ranked.slice(0, 6)) {
      result.trace.push({
        role: "planner",
        event: "batch_recovery_proposed",
        warehouse: pool.warehouse,
        recordId: pool.id,
        quantity: result.quantity,
      });
      const verdict = evaluateRecovery(
        pool,
        order,
        result.asOf,
        pool.remaining,
      );
      if (verdict.accepted) {
        selected = pool;
        break;
      }
      rejected++;
      result.trace.push({
        role: "evaluator",
        event: "batch_recovery_rejected",
        warehouse: pool.warehouse,
        recordId: pool.id,
        reasons: verdict.reasons,
      });
      result.trace.push({
        role: "planner",
        event: "replan_requested",
        scope: "batch",
        avoidWarehouse: pool.warehouse,
        instructions: verdict.reasons.map((r) => r.detail),
      });
    }
    if (result.workflow) result.workflow.batchRejectedPlans = rejected;
    if (!selected) {
      result.actions = [
        {
          type: "escalate_stockout",
          status: "draft_requires_review",
          title: "Escalate stockout: no feasible unallocated stock",
          evidence: result.citations,
          detail:
            "Current stock, prior higher-priority draft allocations, freshness and the assumed delivery buffer leave no verified complete recovery within the candidate budget. No real stock was reserved.",
        },
      ];
      result.draftAllocation = null;
      if (result.workflow) result.workflow.status = "escalated";
      continue;
    }
    const before = selected.remaining;
    selected.remaining -= result.quantity;
    if (
      !result.evidence.some(
        (r: any) => r.source === "inventory" && r.id === selected.id,
      )
    ) {
      const { remaining, poolKey, conflicting, ...record } = selected;
      result.evidence.push(record);
    }
    result.draftAllocation = {
      status: "proposed_only",
      poolKey: selected.poolKey,
      quantity: result.quantity,
      availableBefore: before,
      availableAfter: selected.remaining,
    };
    result.actions = [
      {
        type: "request_stock_reservation",
        status: "draft_requires_review",
        title: `Request ${result.quantity} units from ${selected.warehouse}`,
        evidence: [...new Set([...result.citations, selected.id])],
        detail: `Batch proposal: ${before} units before this allocation, ${selected.remaining} after. Estimated ${selected.transferHours}h transfer plus an assumed 8h handling/delivery buffer. Confirm capacity, cutoffs and transit before commitment; no stock is reserved.`,
      },
    ];
    result.trace.push({
      role: "evaluator",
      event: "draft_capacity_allocated",
      ...result.draftAllocation,
      recordId: selected.id,
      warehouse: selected.warehouse,
    });
  }
  return results;
}
