import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { investigate, type Dataset } from "./engine.ts";
import { Nightshift, zetarisProbe } from "./providers.ts";
import { allocateDrafts } from "./allocation.ts";
import { loadZetaris, openZetaris } from "./zetaris.ts";
import { fixtureReader } from "./fixtures.ts";
import { renderReport } from "./report.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function main() {
  const [command = "demo", ...args] = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith("--"));
  const flags = args.filter((a) => a.startsWith("--"));
  const fromZetaris = flags.includes("--zetaris");
  if (command === "doctor") {
    let zetaris: any = await zetarisProbe();
    if (fromZetaris) {
      try {
        const d = await loadZetaris();
        zetaris = {
          status: "online",
          transport: "jdbc",
          synthetic: d.synthetic,
          asOf: d.asOf,
          counts: Object.fromEntries(
            ["orders", "carrier", "warehouse", "inventory"].map((t) => [
              t,
              (d as any)[t].length,
            ]),
          ),
        };
      } catch (e: any) {
        zetaris = { status: "offline", transport: "jdbc", error: e.message };
        process.exitCode = 1;
      }
    }
    console.log(
      JSON.stringify(
        { nightshift: await new Nightshift().status(), zetaris },
        null,
        2,
      ),
    );
    return;
  }
  if (!["demo", "investigate"].includes(command))
    throw new Error(
      "Use demo, investigate <order-id> [--live-model], or doctor",
    );
  if (command === "investigate" && !id) throw new Error("Supply an order ID");
  const live = flags.includes("--live-model");
  if (live && (await new Nightshift().status()).status !== "online")
    throw new Error(
      "Nightshift is not online. Run npm run doctor. No silent sample substitution.",
    );
  const connection = fromZetaris ? await openZetaris() : null;
  const data: Dataset =
    connection?.data ??
    JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          flags.includes("--adaptive")
            ? "data/adaptive-cases.json"
            : "data/cases.json",
        ),
        "utf8",
      ),
    );
  const readEvidence = connection?.readEvidence ?? fixtureReader(data);
  const selected = command === "demo" ? data.orders.map((o) => o.id) : [id];
  let results = [];
  for (const order of selected)
    results.push(
      await investigate(data, order!, {
        memoryDir: path.join(
          root,
          ".state",
          `${fromZetaris ? "zetaris" : flags.includes("--adaptive") ? "adaptive-fixture" : "fixture"}-${live ? "model" : "policy"}`,
        ),
        live,
        readEvidence,
        review: flags.includes("--no-review")
          ? false
          : live || flags.includes("--review"),
      }),
    );
  results = allocateDrafts(results);
  results.sort(
    (a, b) =>
      (a.risk === "at_risk" ? 0 : a.risk === "unknown" ? 1 : 2) -
        (b.risk === "at_risk" ? 0 : b.risk === "unknown" ? 1 : 2) ||
      a.priority - b.priority,
  );
  const out = path.join(root, "runs");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "latest.json"),
    JSON.stringify(results, null, 2),
  );
  const report = renderReport(data, results, { live, fromZetaris });
  fs.writeFileSync(path.join(out, "report.html"), report);
  console.log(
    results
      .map(
        (r) =>
          `${r.orderId}: ${r.risk} / ${r.cause} / ${r.actions[0]?.title ?? "no exception"}`,
      )
      .join("\n"),
  );
  console.log(`\nReport: ${path.join(out, "report.html")}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
