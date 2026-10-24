# Nightshift connection — verified October 23, 2026

Installed the free M1–M4 edition from Meterless's official download on this Apple M3 Pro Mac (36 GB memory).

- Application: /Applications/Nightshift M1-M4.app
- Endpoint: http://127.0.0.1:8088/v1
- Requested routing mode: meterless/auto
- Reported model: webllm/Qwen2.5-3B-Instruct-q4f16_1-MLC
- Runtime token: managed by Nightshift in its private application support directory; not copied into the project or archive. Export NIGHTSHIFT_TOKEN in the shell to connect.
- No cloud provider keys were added. No NVIDIA Build account was created. No paid service was used.

Verified authenticated model discovery, invalid-token rejection (401), a READY text completion, and a combined SR-101 investigation over Zetaris data with three model decisions and zero fallbacks. Each decision has a Nightshift receipt ID and fromCache=false.

Initial failures revealed strict JSON/formatting incompatibilities and a local backend error with system-message order. The client now uses one bounded user message, gives examples, accepts only a single permitted tool name (optionally quoted or numbered), and stops when all three sources have been read. Multiple choices and completed tools remain invalid. Fallbacks are explicitly counted in reports.

Scope: one successful live-model case. This is not proof of general reliability or a completed multi-agent system. Investigator tool selection is model-driven; cause verification and action construction are deterministic. Broader held-out evaluations, iterative model-driven verification/planning and NVIDIA/Nemotron contribution remain future work.

Keep Nightshift open during requests. The model runs on this Mac; Zetaris runs in Docker. Neither app should be considered an always-on production service yet.

References:
- https://meterless.ai/mac.html
- https://github.com/Meterless/Meterless/blob/main/docs/agent-ready/add-meterless-provider.md
