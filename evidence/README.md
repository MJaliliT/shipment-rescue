# Evidence scope

All operational records and proposed benefits in this project are synthetic. No interviews, testimonials or customer outcomes are asserted.

`release-performance.json`: three sequential repetitions of SR-101 on October 23, 2026, querying the real local Zetaris JDBC engine and calling the pinned hosted Nemotron model through Nightshift. All nine routing decisions report the requested model and `fromCache=false`. Memory and services were warm. Each run selected tools correctly and returned the evidence-gated stockout cause; optional critic review was not requested. These measurements verify a narrow demonstration path, not independent reasoning accuracy, field impact or production latency. Source hashes identify the tested source files.

Reproduce the deterministic regression checks with `npm test` and `npm run evaluate`. Live reproduction requires your own configured services and credentials; export variables from `.env.example`, then run `npm run investigate -- SR-101 --zetaris --live-model`. Do not commit those credentials.
