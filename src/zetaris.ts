import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateData,
  type Dataset,
  type EvidenceReader,
  type EvidenceTask,
} from "./engine.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function jdbcQuery(sql: string): Promise<any[]> {
  const jar = process.env.ZETARIS_JDBC_JAR;
  if (!jar || !fs.existsSync(jar))
    throw new Error("Set ZETARIS_JDBC_JAR to the official bundled driver");
  if (
    !process.env.ZETARIS_USER ||
    !process.env.ZETARIS_PASSWORD ||
    !process.env.ZETARIS_JDBC_URL
  )
    throw new Error("Set Zetaris JDBC URL, user and password in the shell");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "java",
      ["--class-path", jar, path.join(root, "integrations/zetaris/Query.java")],
      { stdio: ["pipe", "pipe", "pipe"], env: process.env },
    );
    let out = "";
    const timer = setTimeout(() => child.kill(), 90000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (s) => {
      out += s;
      if (out.length > 5_000_000) child.kill();
    });
    child.stderr.on("data", () => {}); // Driver diagnostics can contain credentials; never retain or print them.
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not start Java JDBC bridge"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(
          new Error(
            `Zetaris JDBC query failed (${code ?? "timeout"}); inspect setup locally`,
          ),
        );
      try {
        const rows = JSON.parse(out);
        if (!Array.isArray(rows)) throw new Error();
        resolve(rows);
      } catch {
        reject(new Error("JDBC bridge returned invalid JSON rows"));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(sql);
  });
}
const columns: Record<string, string[]> = {
  orders: ["id", "sku", "quantity", "promisedAt", "priority"],
  carrier: ["id", "orderId", "status", "eta", "observedAt"],
  warehouse: ["id", "orderId", "status", "reserved", "observedAt"],
  inventory: [
    "id",
    "sku",
    "warehouse",
    "available",
    "transferHours",
    "observedAt",
  ],
};
function settings() {
  const schema = process.env.ZETARIS_SCHEMA ?? "shipment_rescue";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new Error("Invalid Zetaris schema identifier");
  const asOf = process.env.SHIPMENT_AS_OF;
  if (!asOf || !Number.isFinite(Date.parse(asOf)))
    throw new Error(
      "Set SHIPMENT_AS_OF explicitly for a reproducible source snapshot",
    );
  const synthetic = process.env.SHIPMENT_SYNTHETIC;
  if (!["true", "false"].includes(synthetic ?? ""))
    throw new Error("Set SHIPMENT_SYNTHETIC explicitly");
  return { schema, asOf, synthetic: synthetic === "true" };
}
async function readTable(schema: string, table: string, shape: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table))
    throw new Error("Invalid source table identifier");
  const rows = await jdbcQuery(`SELECT * FROM ${schema}.${table}`);
  return normalizeZetarisRows(shape, rows);
}
export function normalizeZetarisRows(shape: string, rows: any[]) {
  if (!Object.hasOwn(columns, shape)) throw new Error("Unknown source shape");
  return rows.map((row) =>
    Object.fromEntries(
      columns[shape].map((key) => {
        const actual = Object.keys(row).find(
          (k) => k.toLowerCase() === key.toLowerCase(),
        );
        if (!actual)
          throw new Error(`Missing ${shape}.${key} in Zetaris result`);
        const val = row[actual];
        if (
          val === null ||
          val === undefined ||
          (typeof val === "string" && !val.trim())
        )
          throw new Error(`Empty ${shape}.${key} in Zetaris result`);
        return [
          key,
          [
            "quantity",
            "priority",
            "reserved",
            "available",
            "transferHours",
          ].includes(key)
            ? Number(val)
            : val,
        ];
      }),
    ),
  );
}

/** Connected mode reads orders first, then executes only the controller's tasks.
 * Optional refresh table mappings are operator-configured, never model SQL.
 */
export async function openZetaris(): Promise<{
  data: Dataset;
  readEvidence: EvidenceReader;
}> {
  const { schema, asOf, synthetic } = settings();
  const data: Dataset = {
    asOf,
    synthetic,
    orders: await readTable(schema, "orders", "orders"),
    carrier: [],
    warehouse: [],
    inventory: [],
  };
  validateData(data);
  const readEvidence: EvidenceReader = async (task: EvidenceTask) => {
    const override =
      task.mode === "refresh"
        ? process.env[`ZETARIS_REFRESH_${task.source.toUpperCase()}_TABLE`]
        : undefined;
    return readTable(schema, override || task.source, task.source);
  };
  return { data, readEvidence };
}
/** Full snapshot is retained for doctor/setup verification, not investigation routing. */
export async function loadZetaris(): Promise<Dataset> {
  const { data, readEvidence } = await openZetaris();
  for (const source of ["carrier", "warehouse", "inventory"] as const)
    data[source] = await readEvidence({
      id: "doctor",
      source,
      attempt: 1,
      mode: "initial",
      reason: "Verify source schema",
      order: {},
    });
  validateData(data);
  return data;
}
