import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { renderReport } from "../src/report.ts";
import { investigate } from "../src/engine.ts";
test("report escapes hostile source text without executable markup", async () => {
  const d = JSON.parse(
    fs.readFileSync(new URL("../data/cases.json", import.meta.url), "utf8"),
  );
  d.orders[0].sku = "</script><img src=x onerror=alert(1)>";
  const r = await investigate(d, "SR-101");
  const html = renderReport(d, [r], { live: false, fromZetaris: false });
  assert.ok(!html.includes("<img src=x"));
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.ok(html.includes("&lt;/script&gt;&lt;img"));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(html.includes("no model calls were made"));
  const rawContext = script.match(/const context=(.*),storageKey=/)![1];
  const embedded = JSON.parse(rawContext);
  assert.equal(embedded.cases[0].sku, d.orders[0].sku);
  assert.ok(html.includes("Export handoff packet"));
  assert.ok(html.includes("Handoff review"));
});
