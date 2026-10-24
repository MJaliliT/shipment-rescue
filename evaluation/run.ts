import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { investigate } from "../src/engine.ts";
import cases from "./cases.ts";
import holdout from "./holdout.ts";
const held = process.argv.includes("--holdout");
const live = process.argv.includes("--live");
const tag = process.argv.find((x) => x.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag)) throw new Error("Invalid evaluation tag");
const fingerprint = createHash("sha256");
for (const file of [
  "./cases.ts",
  "./holdout.ts",
  "../src/providers.ts",
  "../src/review.ts",
  "../src/engine.ts",
  "../src/handoff.ts",
  "../src/recovery.ts",
  "../src/allocation.ts",
])
  fingerprint.update(fs.readFileSync(new URL(file, import.meta.url)));
const protocolHash = fingerprint.digest("hex");
const selected = held
  ? holdout
  : live
    ? cases.filter((c) =>
        ["E01-stockout", "E02-carrier", "E04-missing"].includes(c.id),
      )
    : cases;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shipment-eval-"));
const results = [];
const start = Date.now();
try {
  for (const c of selected) {
    const t = Date.now();
    const r = await investigate(c.data, c.id, {
      live,
      review: live,
      memoryDir: path.join(dir, c.id),
    });
    const actual = {
      cause: r.cause,
      risk: r.risk,
      action: r.actions[0]?.type ?? null,
    };
    const passed = JSON.stringify(actual) === JSON.stringify(c.expected);
    results.push({
      id: c.id,
      passed,
      expected: c.expected,
      actual,
      ms: Date.now() - t,
      modelExecution: r.modelExecution,
      review: r.review,
      workflow: r.workflow,
      trace: r.trace,
    });
    console.log(
      `${c.id}: ${passed ? "PASS" : "FAIL"}; tool decisions=${r.modelExecution.successfulDecisions}; tool fallbacks=${r.modelExecution.failedDecisions}; review=${r.review.status}`,
    );
  }
  const report = {
    minIntervalMs: Number(process.env.NIGHTSHIFT_MIN_INTERVAL_MS ?? 0),
    thinking: process.env.NIGHTSHIFT_THINKING ?? "runtime_default",
    requestedModel: process.env.NIGHTSHIFT_MODEL ?? "meterless/auto",
    protocolHash,
    createdAt: new Date().toISOString(),
    synthetic: true,
    sourceTransport:
      "in-memory evaluation fixtures; not live Zetaris retrieval",
    scope: held
      ? "6 synthetic cases frozen after v4 prompt, before first live run"
      : live
        ? "3 representative model cases"
        : "12 additional rule cases",
    live,
    elapsedMs: Date.now() - start,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    toolDecisions: results.reduce(
      (n, r) => n + r.modelExecution.successfulDecisions,
      0,
    ),
    toolFallbacks: results.reduce(
      (n, r) => n + r.modelExecution.failedDecisions,
      0,
    ),
    reviewAgreements: results.filter(
      (r) => r.review.status === "model_agreement",
    ).length,
    reviewFallbacks: results.filter(
      (r) => r.review.status === "deterministic_review_fallback",
    ).length,
    results,
  };
  fs.mkdirSync(new URL("../runs/", import.meta.url), { recursive: true });
  fs.writeFileSync(
    new URL(
      live
        ? `../runs/evaluation-live${tag ? "-" + tag : ""}.json`
        : "../runs/evaluation-baseline.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Completed ${report.passed}/${report.total}; ${(report.elapsedMs / 1000).toFixed(1)}s. Review agreements=${report.reviewAgreements}, fallbacks=${report.reviewFallbacks}.`,
  );
  if (report.passed !== report.total) process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
