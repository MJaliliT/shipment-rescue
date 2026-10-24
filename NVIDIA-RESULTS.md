> Historical pre-adaptive draft. For the current controller, evidence and limits, read ADAPTIVE-WORKFLOW.md. Do not use this as a current submission narrative without revision.

# Current follow-up

V4 review (typed timestamp facts, independent category assessment) supersedes earlier 0/3 review figures below: 2/3 development agreements, 4/6 frozen synthetic agreements, 2 frozen cases with explicit fallback. All six frozen final outcomes were protected by source gates; 18 valid tool choices and zero tool fallbacks. Full connected Zetaris SR-101 with review agreed in round 1 (18.265s). See EVALUATION.md and evidence/; this does not establish broad model reliability.

## Earlier model experiments

# NVIDIA Nightshift integration — October 23, 2026

## Result

NVIDIA Build API testing access is configured in Nightshift. The API key is stored only in Nightshift's local provider store; it is not in the application source, evaluation traces or archive. NVIDIA displayed an expiration of April 23, 2027. No payment method, paid deployment or partner endpoint was configured.

The key is a reusable credential. Manage or revoke it in NVIDIA Build if no longer needed. Do not paste it into chat or commit it.

## Tests

| Configuration | Valid tool choices | Completed model reviews | Interpretation |
|---|---|---|---|
| Nemotron 3.5 Lightning, default thinking | 0/9 | 0/3 | Empty responses under the short answer budget; compatibility failure |
| Lightning, thinking off, original review instructions | 9/9 | 0/3 | Valid requests and cause labels, unreliable critic |
| Lightning, thinking off, clarified label-only review | 9/9 | 0/3 | Critic appropriate in only 1/6 judgments |
| Nemotron 3 Super, thinking off | Not evaluated | Not evaluated | NVIDIA returned 404: endpoint unavailable for this account |

All final case outcomes were correct because deterministic evidence gates controlled the result. This does not mean the model reviewers succeeded. Lightning revised incorrect carrier-delay and missing-evidence proposals to the evidence-backed labels after feedback; its separate critic still rejected supported labels and once accepted an unsupported label. The gate prevented that acceptance from changing the final classification.

The revised review prompt defines the four labels and asks the model to assess classification validity rather than complete recovery-plan quality. The real critic no longer receives the deterministic gate result; the controller still enforces that gate independently. Model roles share a model family, so there is no independent model-family consensus.

## Configuration

```sh
export NIGHTSHIFT_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
export NIGHTSHIFT_THINKING=off
export NIGHTSHIFT_MIN_INTERVAL_MS=1600
# Export NIGHTSHIFT_TOKEN locally. The NVIDIA key stays inside Nightshift.
npm run evaluate -- --live --tag=nemotron-review-v2
```

Requests go to the local Nightshift endpoint; Nightshift calls the hosted NVIDIA model. Only synthetic case records were used. The cadence limits this process to about 37.5 request starts/minute; it is not an account-wide quota enforcement mechanism. NVIDIA's own rate limits still apply.

## Scope and comparison limits

Three synthetic cases with in-memory source records were tested. The prior Zetaris retrieval check remains separate. The non-thinking profile changes inference configuration, and the clarified-review experiment changes the review prompt; neither should be represented as an unchanged-protocol comparison against the original local-model results. Each run records its actual protocol hash, requested/reported model and profile settings. The unavailable Super endpoint must not be scored as poor model quality.

The final revised Lightning protocol hash was `bf1d7981d3e71596e54bce80fa29cc667bb5313fa0d5b22499311cf142840818`. Error-display redaction was subsequently strengthened without changing the inference prompts.

All 18 automated tests pass. This is a working hosted tool-selection integration, not a demo-ready autonomous model reviewer. Keep the deterministic verifier authoritative while improving and retesting the review design.

References: https://build.nvidia.com/ and https://docs.api.nvidia.com/nim/docs/product
