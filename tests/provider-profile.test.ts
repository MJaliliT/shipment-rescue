import test from "node:test";
import assert from "node:assert/strict";
import { Nightshift } from "../src/providers.ts";
test("non-thinking compatibility profile preserves the bounded completion budget", async () => {
  const priorFetch = globalThis.fetch,
    prior = process.env.NIGHTSHIFT_THINKING;
  let captured: any;
  process.env.NIGHTSHIFT_THINKING = "off";
  globalThis.fetch = (async (_url: any, init: any) => {
    captured = init;
    return new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;
  try {
    await new Nightshift("test-token").request("chat/completions", {
      model: "test",
      max_tokens: 24,
      messages: [],
    });
    const body = JSON.parse(captured.body);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.chat_template_kwargs.enable_thinking, false);
    assert.equal(body.max_tokens, 24);
    assert.equal(captured.redirect, "error");
  } finally {
    globalThis.fetch = priorFetch;
    if (prior === undefined) delete process.env.NIGHTSHIFT_THINKING;
    else process.env.NIGHTSHIFT_THINKING = prior;
  }
});
