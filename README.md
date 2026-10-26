# Shipment Rescue

**Team Shipment Rescue · Mohammad Jalili Torkamani**

## What we built

An operations investigation prototype that connects handoff evidence to a reviewable recovery draft. The controller refreshes only evidence rejected by the validator, obtains inventory only for supported stockouts, and sends rejected recovery candidates back to the planner.

**Status:** 43 tests and 12 baseline regression scenarios pass. Three adaptive cases were exercised through real Zetaris queries and through Zetaris + Nightshift/Nemotron. All operational records are synthetic. This is a single-user prototype; no stock is reserved, carrier action executed or message sent.

## Data used

All shipment and inventory records are developer-authored synthetic demonstration data, not customer records or evidence of measured business impact.

| Included data | Purpose |
| --- | --- |
| [`data/cases.json`](data/cases.json) | Five original cases combining orders, carrier events, warehouse handoffs and inventory. |
| [`data/adaptive-cases.json`](data/adaptive-cases.json) | Three adaptive cases, including explicitly supplied initial and refreshed observations. |
| [`data/zetaris/`](data/zetaris/) | Synthetic orders, carrier, warehouse and inventory CSV tables for the original Zetaris-connected demo. |
| [`data/zetaris-adaptive/`](data/zetaris-adaptive/) | Adaptive CSV tables, including `warehouse_updates.csv` for evidence refresh. |
| [`evidence/`](evidence/) | Saved synthetic execution results and model traces from previous connected runs. |

The credential-free demo reads the included JSON fixtures locally. The connected feature queries the registered CSV-backed tables through Zetaris JDBC. These are separate execution modes; running the local demo does not establish a live Zetaris or model connection.

## Run the demo without credentials

Requires Git, Node 20.6+ and npm. No API key, account, environment file, Java, Docker, Zetaris installation or Nightshift runtime is needed for this local demo. Internet access is needed to clone the public repository and install npm dependencies.

```sh
git clone https://github.com/MJaliliT/shipment-rescue.git
cd shipment-rescue
npm ci
npm run verify
npm run adaptive
```

Expected result: 43 tests and 12 baseline cases pass. The adaptive demo produces AD-201 (stockout; West rejected, East proposed), AD-202 (on track; inventory skipped), and AD-203 (insufficient evidence; escalation). This mode makes deterministic decisions and performs no hosted model calls.

`verify` runs tests, baseline evaluation, the five-case original demo and the three-case adaptive demo. Open `runs/report.html` for the latest report; `runs/latest.json` includes evidence, workflow state and full traces. The report supports status filters, order/SKU search, evidence tables, draft-text selection, warehouse feasibility comparison and an investigation activity trail. Operators can save a disposition and handoff note in browser storage and export a JSON packet containing the source evidence, proposed actions and review. Each review belongs to an exact report fingerprint. This is a local review record, not an authenticated approval or stock reservation. Operator controls have automated coverage; full browser usability testing remains pending.

```sh
npm run investigate -- SR-101
npm run investigate -- AD-201 --adaptive
npm run evaluate
```

Sample mode is explicitly deterministic and needs no model/API credentials. The adaptive fixture declares both initial and refreshed observations; it never invents a fresh record to make a case succeed. It demonstrates stale warehouse evidence → focused refresh → stockout finding → West rejected for insufficient capacity → East accepted. Another case skips inventory; an unresolved case exhausts its refresh budget and asks for evidence.

## Connected setup

Dependencies: official local Zetaris platform, its JDBC driver, Java 21, and a running Nightshift runtime. On this Mac, Nightshift M1–M4 is installed at `/Applications/Nightshift M1-M4.app`; its tested endpoint is `http://127.0.0.1:8088/v1`. See `NIGHTSHIFT-SETUP.md` and `integrations/zetaris/README.md`.

Export credentials as environment variables only, using `.env.example` as the variable list. This application does not auto-load `.env` files. Do not commit actual credentials. The NVIDIA API key belongs in Nightshift's Providers tab, never in this project. The hosted profile tested through Nightshift is:

```sh
export NIGHTSHIFT_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
export NIGHTSHIFT_THINKING=off
export NIGHTSHIFT_MIN_INTERVAL_MS=1600
```

After setting your own runtime token and Zetaris JDBC variables:

```sh
npm run doctor -- --zetaris
npm run demo -- --zetaris
npm run investigate -- SR-101 --zetaris --live-model
```

`doctor --zetaris` verifies a full JDBC snapshot and source table counts. Without the flag it reports the legacy HTTP fields, whose contract remains disabled. Investigation mode reads orders first, then executes fixed-template JDBC source queries only when the controller queues them. No model SQL reaches the database. Queries over 1000 rows fail rather than truncate silently.

Live mode uses Nightshift for queued task choices, optional recovery candidate selection and model cause review. Review is enabled by default in live mode; `--no-review` explicitly disables it. Invalid model responses have visible fallback events. The investigator and reviewer use the same model family; no independent multi-model consensus is claimed. Source and plan feasibility gates remain authoritative.

The separate synthetic adaptive Zetaris schema, including an explicit warehouse update source, is documented in `integrations/zetaris/register-adaptive.sql`. Configure refresh table mappings only through validated operator environment settings. If unset, refresh rereads the original table. All observations must remain within the same explicit snapshot.

## Roles and bounds

- Investigator/dispatcher: chooses among pending evidence tasks supplied by the controller.
- Executor: retrieves and validates source snapshots; rejected/failed tasks can refresh once.
- Evaluator: identifies missing, stale or conflicting handoffs and rejects infeasible plans with structured reasons.
- Planner: proposes another candidate after rejection, or obtains refreshed inventory when evidence quality prevents planning. In live mode Nightshift can select among multiple candidates; sample mode ranks by transfer speed.
- Batch allocator: rechecks the shared draft stock ledger, returning a rejected capacity proposal for another warehouse or escalation.
- H-MEM: persists case summaries and supplies recalled context; fresh source records always govern the finding.

Bounds: two retrieval attempts per source; at most six investigation recovery proposals, six batch-capacity candidates per order and two cause-review rounds. The task/source universe is allowlisted, not open-ended. Regressed/future/malformed evidence cannot silently replace valid observations. Null JDBC estimates cannot turn into zero-hour transfer claims.

## Current evidence and limitations

See **[ADAPTIVE-WORKFLOW.md](ADAPTIVE-WORKFLOW.md)** for the state machine and exact evidence:

- 43 tests pass, including actual transient-source retry, source refresh, plan feedback and batch replanning.
- 12/12 original synthetic baseline scenarios match expected results.
- Six reused live synthetic regression cases: 6/6 evidence-gated outcomes, six accepted task choices, no tool fallback; 4/6 review agreements and 2/6 explicit review fallbacks.
- Real Zetaris + deterministic controller: 3/3 adaptive cases, 32.488 seconds total; includes rejected West → accepted East.
- Real Zetaris + Nightshift/Nemotron: 3/3 adaptive cases, 44.253 seconds total. Model selected feasible East directly; four accepted task choices and one accepted recovery choice, no tool/planner fallback. Two model reviews agreed; the unresolved case fell back.

These are small, developer-authored synthetic evaluations, not customer validation, independent accuracy estimates or p95 latency. The reviewer still makes mistakes. A controlled model-response test proves feedback reaches the planner; it is not evidence of live model quality. H-MEM uses deterministic hash embeddings, not semantic embeddings. No measured benefit from recall is established. Draft capacity is coordinated only inside one report, not between concurrent runs. The 8h handling/delivery buffer is an assumption requiring operational validation.

## Hackathon and provenance

Primary track: **The Agent That Can Explain Why**. The pitch explains the operations problem, adaptive investigation and recovery workflow, sponsor integrations and synthetic evaluation. Administrative preparation is tracked separately from the product documentation.

The unmodified Meterless H-MEM reference is pre-existing Apache-2.0 source, commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`, under `vendor/hmem/` with license and notice. Application code, adapters and synthetic fixtures are hackathon work. Cursor was not used. External Zetaris/Nightshift/NVIDIA runtimes and credentials are not bundled.

References: [official event/rules](https://hackathon.genai.works/event/open-agent-hackathon-2026), [HackOS overview](https://hackathon.genai.works/dashboard), [Meterless provider contract](https://github.com/Meterless/Meterless/blob/main/docs/agent-ready/add-meterless-provider.md), [H-MEM source](https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem/reference).
