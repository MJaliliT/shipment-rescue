# Frozen model comparison — October 23, 2026

| Nightshift model | Valid tool choices | Valid proposals | Valid critiques | Review agreements | Final outcomes |
|---|---|---|---|---|---|
| Qwen 2.5 3B (pinned) | 8/9 | 6/6 | 6/6 | 0/3 | 3/3 |
| Phi 3.5 Mini (pinned) | 4/9 | 6/6 | 1/6 | 0/3 | 3/3 |

Both runs used protocol SHA-256 `c99b5180498a27d7f11d32d6090ff24c4d95d704d44c243d4f3233741c6a4751`. This fingerprints cases, provider prompts, review prompts and evidence logic. Both used the same three synthetic cases, in-memory evaluation sources, fresh per-case application H-MEM stores, and explicit model IDs. Traces confirm the reported model matched the requested candidate. The inference service's own cache/state was not reset; these are small repeated development evaluations, not independent statistical trials or controlled speed benchmarks.

Qwen was the better local candidate in this sample. Phi did not improve review convergence. Final outcomes remained correct because deterministic evidence gates protected them; this is not evidence of successful model review.

Pinned Qwen produced and critiqued proposals, including rejecting correct proposals and changing them to incorrect ones after feedback. Phi had additional invalid verifier responses. Neither should be selected as a reliable model-driven reviewer based on these results.

The earlier meterless/auto run is preserved separately (5/9 tool decisions, 0/3 review agreements). It should not be confused with this direct-pinned comparison (8/9 and 4/9 tool decisions).

## Next step

Test a hosted NVIDIA Nemotron model through Nightshift on the same protocol. No NVIDIA account, provider credential, paid plan or new access permission was created during this comparison. NVIDIA Build sign-in is prepared for the user; the displayed flow requires joining the Developer Program and accepting its terms. User completion is needed before configuring hosted access.

Official NVIDIA account/API-key workflow: https://docs.api.nvidia.com/nim/re/docs/api-quickstart

## Reproduce

Export the runtime token locally, then run:

```sh
NIGHTSHIFT_MODEL=webllm/Qwen2.5-3B-Instruct-q4f16_1-MLC npm run evaluate -- --live --tag=qwen-pinned
NIGHTSHIFT_MODEL=webllm/Phi-3.5-mini-instruct-q4f16_1-MLC npm run evaluate -- --live --tag=phi-pinned
```

The runtime must already have those device models installed. Raw traces are included as separate evaluation artifacts. No account or API secrets are included.
