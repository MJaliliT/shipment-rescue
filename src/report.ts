import type { Dataset } from "./engine.ts";
import { createHash } from "node:crypto";
import { inventoryCandidates, evaluateRecovery } from "./recovery.ts";
import {
  validateOperatorReview,
  buildReviewPacket,
} from "./operator-review.ts";
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const label: Record<string, string> = {
  at_risk: "At risk",
  unknown: "Needs evidence",
  on_track: "On track",
  warehouse_stockout: "Warehouse stockout",
  carrier_eta_delay: "Carrier ETA exceeds promise",
  delivery_overdue: "Delivery overdue",
  unverified: "Cause not yet verified",
  none: "No exception found",
  label_created: "Label created",
  in_transit: "In transit",
  dispatched: "Dispatched",
  stockout: "Stockout",
  picking: "Picking",
};
const time = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " UTC";
function activity(r: any) {
  const rows = r.trace.flatMap((t: any) => {
    if (t.event === "task_created" && t.attempt > 1)
      return [`Requested current ${t.source} evidence: ${t.reason}`];
    if (t.event === "tool_failed")
      return [
        `${t.tool} retrieval failed (attempt ${t.attempt}); evidence checks remain in force`,
      ];
    if (
      t.event === "recovery_rejected" ||
      t.event === "batch_recovery_rejected"
    )
      return [
        `Rejected ${t.warehouse}${t.event.startsWith("batch") ? " during shared-stock allocation" : ""}: ${t.reasons.map((x: any) => x.detail).join("; ")}`,
      ];
    if (t.event === "recovery_accepted")
      return [
        `${t.attempt > 1 ? "Revised recovery" : "Recovery"} passed checks: ${t.warehouse}, supported by ${t.recordId}`,
      ];
    if (t.event === "evidence_escalated" || t.event === "recovery_escalated")
      return [t.reason];
    return [];
  });
  if (!rows.length) return "";
  return `<section class="activity"><h3>Investigation activity</h3><ol>${rows.map((row: string) => `<li>${esc(row)}</li>`).join("")}</ol><p class="source-note">${r.workflow?.retrievals ?? 0} evidence reads · ${Object.values(r.workflow?.sourceAttempts ?? {}).reduce((n: number, a: any) => n + Math.max(0, a - 1), 0)} refresh attempts · ${r.workflow?.rejectedPlans ?? 0} rejected recovery proposals. Each source is read at most twice; no external action is executed.</p></section>`;
}
export function renderReport(
  data: Dataset,
  results: any[],
  options: { live: boolean; fromZetaris: boolean },
) {
  const { live, fromZetaris } = options;
  const snapshotId = createHash("sha256")
    .update(JSON.stringify({ data, results }))
    .digest("hex");
  const reviewContext = {
    snapshotId,
    asOf: data.asOf,
    synthetic: !!data.synthetic,
    cases: results.map((r) => ({
      orderId: r.orderId,
      sku: r.sku,
      risk: r.risk,
      cause: r.cause,
      summary: r.summary,
      actions: r.actions,
      evidence: r.evidence,
      draftAllocation: r.draftAllocation ?? null,
    })),
  };
  const safeJSON = (value: unknown) =>
    JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  const comparison = (r: any) => {
    const candidates = inventoryCandidates(r.evidence).filter(
      (c) => c.sku === r.sku,
    );
    if (!candidates.length) return "";
    return `<details class="evidence"><summary>Recovery options <span>${candidates.length} warehouse snapshots</span></summary><p class="source-note">Reported stock and feasibility at this snapshot. Shared draft allocations may reduce available capacity.</p><div class="table-wrap"><table><thead><tr><th>Warehouse</th><th>Stock / needed</th><th>Transfer + buffer</th><th>Feasibility check</th><th>Record</th></tr></thead><tbody>${candidates
      .map((c) => {
        const check = evaluateRecovery(c, r, r.asOf);
        return `<tr><th>${esc(c.warehouse)}</th><td>${c.available} / ${r.quantity}</td><td>${c.transferHours}h + 8h</td><td>${check.accepted ? "Passes snapshot checks" : esc(check.reasons.map((x) => x.detail).join("; "))}</td><td>${esc(c.id)}</td></tr>`;
      })
      .join("")}</tbody></table></div></details>`;
  };
  const section = (r: any) => `case-${encodeURIComponent(r.orderId)}`;
  const records = (r: any) =>
    r.evidence
      .map(
        (e: any) =>
          `<tr id="${esc(section(r) + "-" + e.id)}"><th scope="row">${esc(e.id)}</th><td>${esc(e.source)}</td><td>${esc(label[e.status] ?? e.status ?? `${e.available} units · ${e.warehouse}`)}</td><td>${esc(time(e.observedAt))}</td></tr>`,
      )
      .join("");
  const modelDecisions = results.flatMap((r) =>
    r.trace.filter((t: any) => t.event === "model_decision"),
  );
  const models = [...new Set(modelDecisions.map((t: any) => t.reportedModel))];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Shipment Rescue · Exception desk</title><style>
 :root{--ink:#173b32;--muted:#53665e;--paper:#f5f6f1;--line:#d6ded5;--green:#17634d;--pale:#e8f2e9;--amber:#815307;--amber-bg:#fff0d5;--blue:#2c5274}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:100px}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--green)}button,input,select{font:inherit}button,a,input,select,summary{outline-offset:5px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #306ee8}.skip{position:fixed;left:12px;top:-100px;background:white;padding:12px;z-index:10}.skip:focus{top:8px}.topbar{background:white;border-bottom:1px solid var(--line);padding:18px max(24px,calc((100vw - 1240px)/2));display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;background:var(--ink);color:#d7edb5;width:35px;height:35px;border-radius:9px;font-size:23px;font-weight:600}.brand{font-weight:750;font-size:18px;letter-spacing:-.4px}.topbar .right{margin-left:auto;font-size:13px;color:var(--muted)}main{max-width:1288px;margin:auto;padding:40px 24px 70px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}h1{font:500 clamp(34px,4vw,48px)/1.15 Georgia,serif;letter-spacing:-1.5px;margin:12px 0 14px}h2{font-size:23px;line-height:1.25;margin:8px 0}h3{font-size:16px;margin:0 0 8px}.intro{color:var(--muted);max-width:740px;margin:0 0 22px}.notice{display:flex;gap:13px;align-items:flex-start;background:#fff9e9;border:1px solid #e6d9b9;border-radius:10px;padding:14px 18px;margin-bottom:26px;color:#5d4f30}.notice strong{color:#654711}.notice p{margin:0;font-size:13px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.stat{background:white;border:1px solid var(--line);border-radius:11px;padding:18px 20px;text-align:left;color:var(--ink);cursor:pointer;display:flex;align-items:baseline;gap:12px}.stat strong{font-size:32px;font-weight:600;line-height:1}.stat span{font-size:13px;color:var(--muted)}.stat:hover{border-color:var(--green)}.stat[aria-pressed=true]{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}.tools{display:flex;gap:12px;align-items:center;margin:20px 0 26px}.search{width:100%;max-width:390px;padding:11px 14px;border:1px solid #bdcabe;border-radius:8px;background:white}.tools select{background:white;border:1px solid #bdcabe;border-radius:8px;padding:11px}.tools output{margin-left:auto;color:var(--muted);font-size:13px}.workspace{display:grid;grid-template-columns:244px minmax(0,1fr);gap:26px}.queue{align-self:start;position:sticky;top:24px}.queue h2{font-size:12px;text-transform:uppercase;letter-spacing:1.4px;margin:0 0 12px}.queue a{display:block;padding:13px 12px;text-decoration:none;color:var(--ink);border:1px solid transparent;border-radius:9px;margin-bottom:5px}.queue a:hover,.queue a:focus{background:white;border-color:var(--line)}.queue small{display:block;color:var(--muted);margin-top:3px}.queue .dot{float:right;margin-top:8px;width:8px;height:8px;background:#b87612;border-radius:50%}.queue .dot.unknown{background:#5579a0}.queue .dot.on_track{background:#398368}.case{background:white;border:1px solid var(--line);border-radius:13px;margin-bottom:22px;overflow:hidden;scroll-margin-top:24px}.case-head{padding:22px 26px 20px;border-bottom:1px solid #e2e7df}.case-meta{display:flex;align-items:center;gap:12px}.pill{display:inline-flex;align-items:center;gap:7px;border-radius:30px;padding:4px 10px;background:var(--amber-bg);color:var(--amber);font-size:12px;font-weight:650}.pill:before{content:'';height:6px;width:6px;border-radius:50%;background:currentColor}.pill.unknown{background:#edf2f9;color:var(--blue)}.pill.on_track{background:var(--pale);color:var(--green)}.priority{margin-left:auto;color:var(--muted);font-size:12px}.case-title{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;margin:12px 0 7px}.case-title h2{margin:0}.sku{color:var(--muted);font-size:14px}.finding{margin:12px 0 0;font-size:16px;line-height:1.6;max-width:830px}.source-note{margin:12px 0 0;font-size:12px;color:var(--muted)}.case-body{padding:20px 26px}.order-facts{display:flex;flex-wrap:wrap;gap:28px;color:var(--muted);font-size:12px;margin-bottom:18px}.order-facts b{display:block;color:var(--ink);font-size:14px;font-weight:600}.action{background:#edf4ed;border:1px solid #d5e3d5;border-radius:10px;padding:18px 20px;margin-bottom:12px}.action.needs{background:#f1f5fa;border-color:#d7e0ed}.action h3{max-width:650px}.action p{margin:8px 0 12px;color:#3d594b;font-size:14px}.action .draft-tag{font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:7px}.action footer{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted)}.text-button{background:white;border:1px solid #b9cbbd;padding:7px 11px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--ink);flex-shrink:0}.clear{color:var(--green);padding:8px 0}.gap{border-left:3px solid #7694b5;padding:9px 13px;background:#f2f5f9;font-size:13px;margin:12px 0 18px;color:#355471}.evidence{border-top:1px solid #e3e8e1;margin-top:15px;padding-top:14px}summary{cursor:pointer;font-size:13px;font-weight:600;padding:3px 0}summary span{font-weight:400;color:var(--muted);margin-left:6px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0}th,td{padding:10px 9px;border-bottom:1px solid #e4e9e1;text-align:left;vertical-align:top}thead th{font-weight:500;color:var(--muted);white-space:nowrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f2;padding:14px;border-radius:6px;font-size:11px;max-height:420px;overflow:auto}.activity{border:1px solid #d6e3d8;border-radius:10px;padding:17px 20px;margin:18px 0;background:#f7faf6}.activity ol{padding-left:19px;font-size:13px;color:#365b48}.activity li{margin:9px 0}.review-note{font-size:12px;color:var(--muted);margin:14px 0 0}.empty{background:white;border:1px dashed #b7c8bc;border-radius:12px;padding:38px;text-align:center}.page-footer{margin-top:30px;color:var(--muted);font-size:12px;max-width:850px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}[hidden]{display:none!important}@media(max-width:850px){.workspace{grid-template-columns:1fr}.queue{display:none}.stats{grid-template-columns:repeat(2,1fr)}main{padding:28px 16px}.topbar{padding:16px}.topbar .right{max-width:160px;text-align:right}.case-head,.case-body{padding:20px}.tools{flex-wrap:wrap}.tools output{margin-left:0}.search{max-width:none;flex:1;min-width:180px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.topbar,.tools,.queue,.text-button{display:none}.workspace{display:block}.case{break-inside:avoid}.case[hidden]{display:block!important}details{display:block}}
 .handoff-review{border-top:1px solid var(--line);margin-top:22px;padding-top:22px}.handoff-review label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}.handoff-review select,.handoff-review textarea{width:100%;background:white;color:var(--ink);border:1px solid #bdcabe;border-radius:7px;padding:10px}.handoff-review textarea{min-height:88px;resize:vertical}.review-controls{display:flex;align-items:center;gap:14px;margin-top:12px}.review-feedback{font-size:12px;color:var(--muted)}.export-button{margin-left:auto;background:var(--ink);color:white;border:0;padding:11px 16px;border-radius:7px;cursor:pointer}.tools output{margin-left:0}.review-progress{font-size:13px;color:var(--green);margin:12px 0}.review-save{background:var(--green);color:white;border:0;padding:9px 15px;border-radius:6px;cursor:pointer}@media(max-width:650px){.export-button{margin-left:0}.review-controls{flex-wrap:wrap}}
 </style></head><body><a href="#content" class="skip">Skip to investigations</a><header class="topbar"><span class="mark" aria-hidden="true">↗</span><span class="brand">Shipment Rescue</span><span class="right">Investigation report · ${esc(time(data.asOf))}</span></header><main id="content"><div class="eyebrow">Exception desk</div><h1>Review shipment exceptions</h1><p class="intro">See what the records support, inspect the evidence and prepare the next action. Findings and proposals reflect the snapshot below.</p><aside class="notice"><strong>${data.synthetic ? "Synthetic data" : "Source snapshot"}</strong><p>${data.synthetic ? "Demonstration records, not real customer orders. " : ""}As of ${esc(time(data.asOf))}. All actions are drafts for human review. No stock is reserved and no carrier changes are made.</p></aside><section class="stats" aria-label="Filter by shipment status">${[
   ["all", results.length, "All orders"],
   ["at_risk", results.filter((r) => r.risk === "at_risk").length, "At risk"],
   [
     "unknown",
     results.filter((r) => r.risk === "unknown").length,
     "Need evidence",
   ],
   [
     "on_track",
     results.filter((r) => r.risk === "on_track").length,
     "On track",
   ],
 ]
   .map(
     ([key, n, title]) =>
       `<button class="stat" data-filter="${key}" aria-pressed="${key === "all"}"><strong>${n}</strong><span>${title}</span></button>`,
   )
   .join(
     "",
   )}</section><div class="tools"><label for="search" class="sr-only">Search order ID or SKU</label><input class="search" id="search" type="search" placeholder="Search order ID or SKU…"><label for="status" class="sr-only">Shipment status</label><select id="status"><option value="all">All statuses</option><option value="at_risk">At risk</option><option value="unknown">Needs evidence</option><option value="on_track">On track</option></select><button class="export-button" id="export-review" type="button">Export handoff packet</button><output id="visible-count" aria-live="polite">${results.length} orders shown</output></div><p class="review-progress" id="review-progress" aria-live="polite">0 of ${results.length} cases reviewed</p><div class="workspace"><nav class="queue" aria-label="Case queue"><h2>Investigation queue</h2>${results.map((r) => `<a href="#${esc(section(r))}" data-queue="${esc(r.orderId)}"><span class="dot ${esc(r.risk)}" aria-hidden="true"></span><strong>${esc(r.orderId)}</strong><small>${esc(r.sku)} · ${esc(label[r.risk])}</small></a>`).join("")}<p class="source-note">At-risk orders first, then evidence gaps. Priority 1 is highest within each group.</p></nav><section aria-label="Investigations"><p id="empty" class="empty" hidden>No matching orders. Try another search or choose All statuses.</p>${results.map((r) => `<article class="case" id="${esc(section(r))}" data-order="${esc(r.orderId)}" data-risk="${esc(r.risk)}" data-search="${esc((r.orderId + " " + r.sku).toLowerCase())}"><header class="case-head"><div class="case-meta"><span class="pill ${esc(r.risk)}">${esc(label[r.risk])}</span><span class="priority">Priority ${r.priority}</span></div><div class="case-title"><h2>${esc(r.orderId)}</h2><span class="sku">${esc(r.sku)}</span></div><p class="finding">${esc(r.summary)}</p><p class="source-note">${esc(label[r.cause] ?? r.cause)} · ${r.citations.length ? "Supporting records: " + esc(r.citations.join(", ")) : "Awaiting current handoff evidence"}</p></header><div class="case-body"><div class="order-facts"><span>Quantity<b>${r.quantity} units</b></span><span>Delivery promise<b>${esc(time(r.promisedAt))}</b></span><span>Finding<b>${r.risk === "unknown" ? "More evidence needed" : "Supported by source checks"}</b></span></div>${r.gaps.length ? `<div class="gap"><strong>Evidence to resolve</strong><br>${esc(r.gaps.join(" · "))}</div>` : ""}${r.actions.length ? r.actions.map((a) => `<section class="action ${r.risk === "unknown" ? "needs" : ""}" aria-label="Draft action"><span class="draft-tag">Proposed next action · review required</span><h3>${esc(a.title)}</h3><p class="draft-text">${esc(a.detail)}</p><footer><span>Evidence: ${esc(a.evidence.join(", ") || "request for current records")}</span><button class="text-button select-draft" type="button">Select draft text</button></footer></section>`).join("") : '<p class="clear">No exception action proposed for this snapshot.</p>'}${activity(r)}${comparison(r)}<details class="evidence"><summary>Source evidence <span>${r.evidence.length} records</span></summary><div class="table-wrap"><table><thead><tr><th scope="col">Record</th><th scope="col">Source</th><th scope="col">Reported state</th><th scope="col">Observed</th></tr></thead><tbody>${records(r)}</tbody></table></div><details><summary>Full source fields</summary><pre>${esc(JSON.stringify(r.evidence, null, 2))}</pre></details></details><details class="evidence"><summary>How this finding was reached <span>model, checks and fallback history</span></summary><p class="review-note">${esc(r.mode)} · ${r.modelExecution.successfulDecisions} accepted model tool choices · ${r.modelExecution.failedDecisions} tool fallbacks · ${r.modelExecution.successfulPlanningDecisions ?? 0} accepted model plan choices · ${r.modelExecution.failedPlanningDecisions ?? 0} plan fallbacks<br>Model review: ${esc(r.review.status)}; ${r.review.rounds} rounds. Source checks remain authoritative.</p><pre>${esc(JSON.stringify(r.trace, null, 2))}</pre></details><details class="evidence"><summary>Prior case context <span>${r.memory.recalled.length} recalled memories</span></summary><p class="review-note">H-MEM reference recall supplies context; current records determine the finding.</p><pre>${esc(JSON.stringify(r.memory, null, 2))}</pre></details><section class="handoff-review" aria-label="Operator review"><h3>Handoff review</h3><p class="source-note">Record your decision for this snapshot. Saved in this browser only. Export the packet to share it.</p><label for="disposition-${esc(section(r))}">Disposition</label><select class="review-disposition" id="disposition-${esc(section(r))}"><option value="unreviewed">Awaiting review</option><option value="ready_for_handoff">Ready for human handoff</option><option value="needs_followup">Needs follow-up</option></select><label for="note-${esc(section(r))}">Handoff note</label><textarea class="review-note-input" id="note-${esc(section(r))}" maxlength="2000" placeholder="Record what to confirm, who should act, or why more evidence is needed"></textarea><div class="review-controls"><button class="review-save" type="button">Save review</button><span class="review-feedback" role="status">No review saved</span></div></section></div></article>`).join("")}</section></div><footer class="page-footer"><strong>Snapshot and execution</strong><br>${fromZetaris ? "Records retrieved through Zetaris JDBC." : "Bundled source fixtures; Zetaris was not queried for this report."} ${live ? "AI tool choices were requested through Nightshift." : "Deterministic sample mode; no model calls were made."} ${models.length ? "Reported model: " + esc(models.join(", ")) + "." : ""} Draft capacity is shared within this report only. Estimates include an assumed 8h handling/delivery buffer. Independent runs do not reserve or coordinate stock.</footer></main><script>
 const validateOperatorReview=${validateOperatorReview.toString()};
 const buildReviewPacket=${buildReviewPacket.toString()};
 const context=${safeJSON(reviewContext)},storageKey='shipment-rescue-review:'+context.snapshotId;
 let reviews=Object.create(null);let storageAvailable=true;
 try{const stored=JSON.parse(localStorage.getItem(storageKey)||'{}');for(const item of context.cases){if(stored[item.orderId])reviews[item.orderId]=validateOperatorReview(stored[item.orderId]);}}catch{storageAvailable=false;}
 const search=document.getElementById('search'),status=document.getElementById('status');
 const cases=[...document.querySelectorAll('[data-order]')],buttons=[...document.querySelectorAll('[data-filter]')];
 function filter(){const q=search.value.trim().toLowerCase();let count=0;for(const c of cases){const show=(status.value==='all'||c.dataset.risk===status.value)&&c.dataset.search.includes(q);c.hidden=!show;if(show)count++;for(const a of document.querySelectorAll('[data-queue]'))if(a.dataset.queue===c.dataset.order)a.hidden=!show;}for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.filter===status.value));document.getElementById('visible-count').textContent=count+' '+(count===1?'order':'orders')+' shown';document.getElementById('empty').hidden=count>0;}
 function progress(){const n=context.cases.filter(c=>reviews[c.orderId]&&reviews[c.orderId].disposition!=='unreviewed').length;document.getElementById('review-progress').textContent=n+' of '+context.cases.length+' cases reviewed';}
 for(const c of cases){
  const select=c.querySelector('.review-disposition'),note=c.querySelector('.review-note-input'),feedback=c.querySelector('.review-feedback');
  const saved=reviews[c.dataset.order];if(saved){select.value=saved.disposition;note.value=saved.note;feedback.textContent='Saved '+saved.reviewedAt;}
  if(!storageAvailable)feedback.textContent='Browser storage unavailable. Reviews stay in memory until you export.';
  const dirty=()=>{feedback.textContent='Unsaved changes. Save before exporting.';};select.addEventListener('change',dirty);note.addEventListener('input',dirty);
  c.querySelector('.review-save').addEventListener('click',()=>{try{const review=validateOperatorReview({disposition:select.value,note:note.value,reviewedAt:new Date().toISOString()});reviews[c.dataset.order]=review;try{localStorage.setItem(storageKey,JSON.stringify(reviews));feedback.textContent='Saved in this browser';}catch{feedback.textContent='Saved in memory. Export before closing.';}progress();}catch(e){feedback.textContent=e.message;}});
 }
 document.getElementById('export-review').addEventListener('click',()=>{
  const dirty=cases.some(c=>{const saved=reviews[c.dataset.order]||{disposition:'unreviewed',note:''};return c.querySelector('.review-disposition').value!==saved.disposition||c.querySelector('.review-note-input').value!==saved.note;});
  if(dirty){document.getElementById('review-progress').textContent='Save each changed review before exporting.';return;}
  const packet=buildReviewPacket(context,reviews,new Date().toISOString()),url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='shipment-rescue-handoff-'+context.snapshotId.slice(0,12)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });progress();
 search.addEventListener('input',filter);status.addEventListener('change',filter);buttons.forEach(b=>b.addEventListener('click',()=>{status.value=b.dataset.filter;filter();}));
 document.querySelectorAll('.select-draft').forEach(b=>b.addEventListener('click',()=>{const target=b.closest('.action');const range=document.createRange();range.selectNodeContents(target.querySelector('.draft-text'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);b.textContent='Text selected';}));
 </script></body></html>`;
}
