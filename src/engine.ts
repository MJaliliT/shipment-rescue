import { HMEM } from "../vendor/hmem/src/index.ts";
import { Nightshift } from "./providers.ts";
import { NightshiftReview, reviewLoop, type ReviewModel } from "./review.ts";
import { assessHandoff, type EvidenceSource } from "./handoff.ts";
import {
  inventoryCandidates,
  evaluateRecovery,
  recoveryAction,
} from "./recovery.ts";
export type Dataset = {
  synthetic: boolean;
  asOf: string;
  orders: any[];
  carrier: any[];
  warehouse: any[];
  inventory: any[];
};
export function validateData(data: Dataset) {
  if (!data || !Number.isFinite(Date.parse(data.asOf)))
    throw new Error("Dataset requires an explicit asOf timestamp");
  for (const table of [
    "orders",
    "carrier",
    "warehouse",
    "inventory",
  ] as const) {
    if (!Array.isArray(data[table])) throw new Error(`Missing table ${table}`);
    const ids = new Set<string>();
    for (const row of data[table]) {
      if (typeof row.id !== "string" || ids.has(row.id))
        throw new Error(`Invalid or duplicate ID in ${table}`);
      ids.add(row.id);
      const time = table === "orders" ? row.promisedAt : row.observedAt;
      if (!Number.isFinite(Date.parse(time)))
        throw new Error(`Invalid timestamp in ${table}:${row.id}`);
      if (table === "carrier" && !Number.isFinite(Date.parse(row.eta)))
        throw new Error("Invalid carrier ETA");
      if (table !== "orders" && Date.parse(time) > Date.parse(data.asOf))
        throw new Error(`Future evidence in ${table}:${row.id}`);
    }
  }
  for (const row of data.orders)
    if (
      !Number.isInteger(row.quantity) ||
      row.quantity <= 0 ||
      !row.sku ||
      !Number.isInteger(row.priority) ||
      row.priority < 1
    )
      throw new Error("Invalid order quantity, SKU or priority");
  for (const row of data.inventory)
    if (
      !Number.isInteger(row.available) ||
      row.available < 0 ||
      !Number.isFinite(row.transferHours) ||
      row.transferHours < 0 ||
      !row.warehouse ||
      !row.sku
    )
      throw new Error("Invalid inventory capacity or timing");
}
export type EvidenceTask = {
  id: string;
  source: EvidenceSource;
  attempt: number;
  mode: "initial" | "refresh";
  reason: string;
  order: any;
};
export type EvidenceReader = (task: EvidenceTask) => Promise<any[]>;
export async function investigate(
  data: Dataset,
  orderId: string,
  options: {
    memoryDir?: string;
    live?: boolean;
    failTool?: string;
    review?: boolean;
    reviewModel?: ReviewModel;
    readEvidence?: EvidenceReader;
  } = {},
) {
  validateData(data);
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`Unknown order ${orderId}`);
  const memory = new HMEM({
    persistDir: options.memoryDir,
    actor: "shipment-rescue",
  });
  const recall = memory.query(
    `${order.sku} shipment stockout carrier dispatch`,
    { threshold: 0.1 },
  );
  const trace: any[] = [];
  let evidence: any[] = [];
  const attempts: Record<EvidenceSource, number> = {
    carrier: 0,
    warehouse: 0,
    inventory: 0,
  };
  const tasks: any[] = [];
  const provider = options.live ? new Nightshift() : undefined;
  if (recall.memories.length)
    trace.push({
      role: "memory",
      event: "recall",
      context: recall.context,
      ids: recall.memories.map((m) => m.memory.id),
    });
  async function execute(source: EvidenceSource, reason: string) {
    if (attempts[source] >= 2) return false;
    const task: EvidenceTask = {
      id: `${orderId}:task:${tasks.length + 1}`,
      source,
      attempt: ++attempts[source],
      mode: attempts[source] === 1 ? "initial" : "refresh",
      reason,
      order,
    };
    tasks.push({ ...task, status: "running" });
    trace.push({
      role: "planner",
      event: "task_created",
      taskId: task.id,
      source,
      attempt: task.attempt,
      reason,
    });
    try {
      if (options.failTool === source) throw new Error("Injected outage");
      const raw = options.readEvidence
        ? await options.readEvidence(task)
        : (data[source] as any[]);
      if (!Array.isArray(raw)) throw new Error("Invalid source result");
      const rows = raw.filter((r) =>
        source === "inventory" ? r.sku === order.sku : r.orderId === order.id,
      );
      validateData({ ...data, [source]: rows });
      const prior = evidence.filter((r) => r.source === source);
      if (
        prior.length &&
        rows.length &&
        Math.max(...rows.map((r) => Date.parse(r.observedAt))) <
          Math.max(...prior.map((r) => Date.parse(r.observedAt)))
      )
        throw new Error("Source snapshot regressed");
      evidence = evidence
        .filter((r) => r.source !== source)
        .concat(rows.map((r) => ({ ...r, source })));
      tasks.at(-1).status = "completed";
      trace.push({
        role: "executor",
        event: "tool_result",
        tool: source,
        taskId: task.id,
        attempt: task.attempt,
        recordIds: rows.map((r) => r.id),
        replacedRecordIds: prior.map((r) => r.id),
        retrieval: options.readEvidence ? "source_reader" : "fixture_snapshot",
      });
      if (
        source === "carrier" &&
        rows.some((r) => r.status === "label_created")
      )
        trace.push({
          role: "investigator",
          event: "provisional_hypothesis",
          hypothesis:
            "A carrier label does not establish custody. Obtain current warehouse evidence before assigning cause.",
        });
      return true;
    } catch {
      tasks.at(-1).status = "failed";
      trace.push({
        role: "executor",
        event: "tool_failed",
        tool: source,
        taskId: task.id,
        attempt: task.attempt,
        detail:
          "Evidence retrieval unavailable, invalid, or older than the prior observation; source checks remain in force.",
      });
      return false;
    }
  }
  async function acquire(sources: EvidenceSource[], reason: string) {
    const pending = [...new Set(sources)].filter((s) => attempts[s] < 2);
    while (pending.length) {
      let selected = pending[0];
      if (provider && pending.length > 1) {
        try {
          const decision = await provider.chooseTool({
            order,
            evidence,
            available: pending,
            read: Object.keys(attempts).filter(
              (s) => attempts[s as EvidenceSource] > 0,
            ),
            memory: recall.context,
            taskReason: reason,
          });
          selected = decision.tool as EvidenceSource;
          if (!pending.includes(selected))
            throw new Error("Task outside queue");
          trace.push({
            role: "investigator",
            event: "model_decision",
            ...decision,
          });
        } catch (e: any) {
          trace.push({
            role: "investigator",
            event: "model_error",
            message: String(e.message)
              .replaceAll(provider.token, "[redacted]")
              .replace(/nvapi-[A-Za-z0-9_-]+/g, "[redacted]"),
            fallback:
              "First pending evidence task; no task added outside the validated queue",
          });
        }
      }
      pending.splice(pending.indexOf(selected), 1);
      await execute(selected, reason);
    }
  }
  await acquire(
    ["carrier", "warehouse"],
    "Establish current handoff evidence; inventory is not needed until a stockout is supported",
  );
  let assessment = assessHandoff(order, data.asOf, evidence);
  while (assessment.issues.length) {
    trace.push({
      role: "evaluator",
      event: "evidence_rejected",
      issues: assessment.issues,
    });
    const sources = [...new Set(assessment.issues.map((i) => i.source))].filter(
      (s) => attempts[s] < 2,
    );
    if (!sources.length) {
      trace.push({
        role: "controller",
        event: "evidence_escalated",
        reason:
          "Required evidence remains unresolved after two attempts per source",
      });
      break;
    }
    await acquire(
      sources,
      assessment.issues
        .map((i) => `${i.source}: ${i.code} — ${i.reason}`)
        .join("; "),
    );
    assessment = assessHandoff(order, data.asOf, evidence);
  }
  const { cause, risk, summary, citations } = assessment;
  const gaps = [...assessment.gaps];
  if (cause === "warehouse_stockout")
    trace.push({
      role: "verifier",
      event: "hypothesis_revised",
      from: "possible carrier delay",
      to: cause,
      evidence: citations,
    });
  const review =
    options.reviewModel ||
    (options.live && options.review !== false) ||
    options.review
      ? await reviewLoop(
          options.reviewModel ?? new NightshiftReview(),
          { order, asOf: data.asOf, evidence },
          cause,
          trace,
        )
      : {
          status: "not_requested",
          rounds: 0,
          proposals: 0,
          critiques: 0,
          errors: 0,
        };
  const actions: any[] = [];
  let recoveryAttempts = 0;
  let accepted: any = null;
  let rejectedPlans = 0;
  if (cause === "warehouse_stockout") {
    await acquire(
      ["inventory"],
      "Supported warehouse stockout: obtain recovery candidates",
    );
    // Rejections create a new planner task. Only stale/conflicting/missing inventory
    // can trigger one refreshed retrieval; infeasible candidates are never committed.
    for (let generation = 1; generation <= 2 && !accepted; generation++) {
      let candidates = inventoryCandidates(evidence);
      let needsRefresh = candidates.length === 0;
      const allRejections: any[] = [];
      while (candidates.length && recoveryAttempts < 6) {
        let candidate = candidates[0];
        if (provider && candidates.length > 1) {
          try {
            const decision = await provider.chooseRecovery({
              order,
              asOf: data.asOf,
              candidates,
              feedback: allRejections,
            });
            candidate = candidates.find((c) => c.poolKey === decision.poolKey)!;
            if (!candidate) throw new Error("Unknown recovery candidate");
            trace.push({
              role: "planner",
              event: "model_plan_decision",
              ...decision,
            });
          } catch (e: any) {
            trace.push({
              role: "planner",
              event: "model_plan_error",
              message: String(e.message)
                .replaceAll(provider.token, "[redacted]")
                .replace(/nvapi-[A-Za-z0-9_-]+/g, "[redacted]"),
              fallback:
                "Fastest remaining transfer candidate, independently evaluated",
            });
          }
        }
        candidates = candidates.filter((c) => c.poolKey !== candidate.poolKey);
        recoveryAttempts++;
        trace.push({
          role: "planner",
          event: "recovery_proposed",
          attempt: recoveryAttempts,
          generation,
          warehouse: candidate.warehouse,
          recordId: candidate.id,
          quantity: order.quantity,
        });
        const verdict = evaluateRecovery(candidate, order, data.asOf);
        if (verdict.accepted) {
          accepted = candidate;
          actions.push(recoveryAction(candidate, order, citations));
          trace.push({
            role: "evaluator",
            event: "recovery_accepted",
            attempt: recoveryAttempts,
            warehouse: candidate.warehouse,
            recordId: candidate.id,
          });
          break;
        }
        rejectedPlans++;
        allRejections.push({
          warehouse: candidate.warehouse,
          reasons: verdict.reasons,
        });
        needsRefresh ||= verdict.reasons.some((r) =>
          ["inventory_stale", "inventory_conflict"].includes(r.code),
        );
        trace.push({
          role: "evaluator",
          event: "recovery_rejected",
          attempt: recoveryAttempts,
          warehouse: candidate.warehouse,
          recordId: candidate.id,
          observedAt: candidate.observedAt,
          reasons: verdict.reasons,
        });
        trace.push({
          role: "planner",
          event: "replan_requested",
          avoidWarehouse: candidate.warehouse,
          instructions: verdict.reasons.map((r) => r.detail),
          remainingCandidates: candidates.length,
        });
      }
      if (
        !accepted &&
        needsRefresh &&
        attempts.inventory < 2 &&
        recoveryAttempts < 6
      ) {
        await acquire(
          ["inventory"],
          "Recovery evaluator needs fresh, non-conflicting inventory before proposing another plan",
        );
      } else break;
    }
    if (!accepted) {
      if (!evidence.some((r) => r.source === "inventory"))
        gaps.push("Inventory evidence unavailable; do not promise recovery");
      actions.push({
        type: "escalate_stockout",
        status: "draft_requires_review",
        title: "Escalate stockout: no verified feasible recovery",
        evidence: citations,
        detail:
          "No candidate passed current capacity, freshness, consistency and promise checks within the bounded investigation. Confirm alternatives and prepare a revised ETA.",
      });
      trace.push({
        role: "controller",
        event: "recovery_escalated",
        reason: "Recovery candidates exhausted or evidence budget reached",
      });
    }
  } else if (cause === "carrier_eta_delay" || cause === "delivery_overdue")
    actions.push({
      type: "request_carrier_investigation",
      status: "draft_requires_review",
      title: "Request carrier exception review",
      evidence: citations,
      detail:
        "Ask carrier for the reason and available delivery options; do not promise an expedited arrival.",
    });
  else if (risk === "unknown")
    actions.push({
      type: "request_evidence",
      status: "draft_requires_review",
      title: "Obtain current handoff and shipment evidence",
      evidence: [],
      detail: gaps.join("; "),
    });
  const modelExecution = {
    successfulDecisions: trace.filter((t) => t.event === "model_decision")
      .length,
    failedDecisions: trace.filter((t) => t.event === "model_error").length,
    successfulPlanningDecisions: trace.filter(
      (t) => t.event === "model_plan_decision",
    ).length,
    failedPlanningDecisions: trace.filter((t) => t.event === "model_plan_error")
      .length,
  };
  const result = {
    review,
    modelExecution,
    workflow: {
      sourceAttempts: attempts,
      retrievals: tasks.length,
      recoveryAttempts,
      rejectedPlans,
      tasks: tasks.map(({ order, ...task }) => task),
      status:
        risk === "unknown" || (cause === "warehouse_stockout" && !accepted)
          ? "escalated"
          : "resolved",
    },
    orderId,
    quantity: order.quantity,
    promisedAt: order.promisedAt,
    sku: order.sku,
    priority: order.priority,
    mode: options.live
      ? modelExecution.successfulDecisions +
          modelExecution.successfulPlanningDecisions +
          review.proposals >
        0
        ? "nightshift_with_deterministic_verification"
        : "degraded_deterministic_fallback"
      : "deterministic_sample",
    synthetic: data.synthetic,
    asOf: data.asOf,
    risk,
    cause,
    summary,
    citations,
    gaps,
    actions,
    evidence,
    trace,
    memory: {
      engine: "Meterless H-MEM reference",
      recalled: recall.memories.map((r) => ({
        id: r.memory.id,
        content: r.memory.content,
        relevance: r.relevance,
      })),
    },
  };
  if (cause !== "unverified")
    memory.add({
      content: `${order.sku} shipment ${orderId}: ${summary}`,
      type: "factual",
      source: `${data.synthetic ? "synthetic" : "live"}:case:${orderId}`,
      confidence: 0.8,
      tags: ["shipment", order.sku],
      chatId: order.sku,
    });
  return result;
}
