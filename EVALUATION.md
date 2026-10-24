> Product review update: 43 automated tests and 12 baseline scenarios pass. The operator workspace now includes warehouse comparisons, saved local reviews and evidence-bearing handoff export. Saved connected measurements below predate these UI additions. Browser screenshot and interaction QA remains blocked.

# Current adaptive evaluation — October 23, 2026

**39 tests and 12 original baseline cases pass.** The adaptive controller also passes three explicit refresh/replan scenarios through real Zetaris queries and through Zetaris + Nightshift. Details, exact limits and distinctions between deterministic, controlled-model and live-model evidence are in ADAPTIVE-WORKFLOW.md.

Six existing model cases were reused as regressions after the architecture change: 6/6 final outcomes, six accepted tool choices and no tool fallback; four reviewer agreements and two review fallbacks, 33.8s total. These are not fresh independent holdouts for v5.

The earlier metrics below describe previous code and protocols. They must not be presented as current architecture validation.

# Historical pre-adaptive evaluation — October 23, 2026

- **28 automated tests pass**, including report escaping, bounded review, source freshness/conflicts, memory persistence and batch stock invariants.
- **12/12 authored deterministic regression cases pass.**
- Current v4 development model cases: 3/3 evidence-gated outcomes, 9/9 accepted tool choices, 2/3 reviewer agreements.
- **Frozen synthetic v4 cases: 6/6 evidence-gated outcomes; 18/18 accepted tool choices; 4/6 reviewer agreements and 2/6 explicit review fallbacks; 53.0s total.**
- Full Zetaris + Nightshift SR-101 with optional review: warehouse_stockout, 3 accepted tool choices, no tool fallback, model agreement in round 1; 18.265 seconds; five H-MEM memories recalled. This is one synthetic connected case.

The v4 reviewer independently classifies typed facts without seeing the proposed label or source-gate category. Timestamps are compared in code and provided as facts. Both model roles use the same model family. Unsupported agreement is still blocked by the deterministic gate. Missing sources and conflicting evidence continue to expose model weaknesses. No autonomous consensus, independent benchmark accuracy or real customer impact is claimed.

The six frozen cases were authored after the v4 prompt and before their first model execution. No subsequent review-prompt tuning was performed on those results. These are developer-authored synthetic cases, not externally curated holdouts. Source hashes and full traces are in `evidence/`. Report/doctor changes after evaluation do not change the investigation/reviewer policy.

Reproduce: `npm run verify`; with configured Nightshift credentials, `npm run evaluate -- --live --holdout --tag=my-run`. Live evaluation uses in-memory source fixtures and real Nightshift calls. The connected Zetaris case is separate.

## Historical development record



## Current regression checks

October 23 hardening: **28/28 tests pass**, including 100 generated competing-order capacity batches, priority ordering, alternative warehouse selection, stale/future inventory rejection, equal-time stock conflicts, duplicate orders, citation preservation and overdue delivery detection. **12/12 authored baseline scenarios pass.** These are synthetic developer checks, not independent performance estimates.

Latest hosted model comparison: Nemotron 3.5 Lightning with thinking off accepted **9/9 tool choices** across three synthetic cases, but completed **0/3 review agreements**. Final evidence-gated outcomes were 3/3 correct. See NVIDIA-RESULTS.md. Source changes since that comparison mean it is historical evidence, not a fresh evaluation of the current prompt.

## Historical initial local-model findings

- Unit/integration-style tests: **17 passed**. Includes simulated reviewer rejection → investigator revision, bounded outages, and prevention of an unsupported model verdict overriding evidence.
- Additional synthetic baseline cases: **12/12 correct**.
- Live Nightshift evaluation: **3/3 final outcomes correct**, protected by deterministic verification.
- Model tool selection: **5/9 accepted**; **4 fallbacks**.
- Model cause review: **0 valid proposals across 6 bounded attempts**. Consequently no model verifier critiques completed and **0/3 review agreements**. All three reviews explicitly fell back to the evidence gate.
- Live evaluation wall time: **40.6 seconds**.

The local Qwen model's outputs often described a numbered investigation plan instead of returning the required cause label. Correct final outcomes do not establish model reliability. The new review workflow is implemented and covered by deterministic test doubles, but it has not yet completed an end-to-end live model agreement.

## Live cases

| Case | Final outcome | Accepted tool choices | Tool fallbacks | Review result |
|---|---|---|---|---|
| E01-stockout | Pass | 2/3 | 1 | deterministic_review_fallback |
| E02-carrier | Pass | 1/3 | 2 | deterministic_review_fallback |
| E04-missing | Pass | 2/3 | 1 | deterministic_review_fallback |

## Changes

1. Added an investigator proposal and separate verifier critique, with feedback returned for up to two rounds. Invalid results and non-convergence have explicit fallback events.
2. Equal-time conflicting warehouse/carrier evidence now yields an unverified case.
3. New inventory observations supersede older availability; contradictory equal-time inventory is excluded from recovery proposals.
4. Reports expose review status, iteration count, errors, tool fallbacks, model IDs and available receipts.

## Evaluation scope

These are developer-authored synthetic regression scenarios, not an external or real-world benchmark. The cases include missing/stale sources, conflicting states, later corrected handoffs, depleted stock and infeasible transfer timing. The live evaluation uses in-memory source fixtures with real Nightshift calls; it does **not** test fresh Zetaris retrieval. The earlier Zetaris integration test remains separate.

The source scenarios were authored during this implementation and are not statistically independent of the rules. Model roles use the same underlying local model; this is not independent multi-model consensus. In the initial protocol the verifier received an explicit evidence-gate constraint. The later v2 comparison withheld that constraint from the model critic; the controller still enforced it independently. Neither protocol establishes independent real-world validation.

## Reproduce

```sh
npm ci
npm test
npm run evaluate
# Export NIGHTSHIFT_TOKEN in your shell; never commit it.
npm run evaluate -- --live
# Full local-source investigation with bounded model review:
npm run investigate -- SR-101 --zetaris --live-model --review
```

Next: test a stronger instruction-following model through Nightshift using these same frozen scenarios, then require valid proposals and completed critiques before calling the new review loop demo-ready. Broader unseen operational data and user impact validation remain necessary.
