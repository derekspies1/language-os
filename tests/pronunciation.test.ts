import assert from "node:assert/strict";
import test from "node:test";
import { createPronunciationHandler } from "../app/api/pronunciation/route.ts";
import type { PronunciationService } from "../app/lib/pronunciation/contracts.ts";
import { ElevenLabsPronunciationService, resolvePronunciationService } from "../app/lib/pronunciation/server/elevenlabs.ts";

function request(text = "아쉽다") {
  return new Request("http://localhost/api/pronunciation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, layer: "word", language: "ko" }),
  });
}

test("pronunciation is safely unavailable when the server key is missing", async () => {
  assert.equal(resolvePronunciationService({ NODE_ENV: "test" }), null);
  const response = await createPronunciationHandler({ resolveService: () => null })(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "pronunciation_unavailable");
});

test("pronunciation route validates Korean and returns injected audio bytes", async () => {
  const service: PronunciationService = {
    provider: "elevenlabs",
    model: "test-model",
    async synthesize() { return { bytes: new Uint8Array([73, 68, 51]), contentType: "audio/mpeg", cacheHit: false }; },
  };
  const handler = createPronunciationHandler({ resolveService: () => service });
  const invalid = await handler(request("hello"));
  assert.equal(invalid.status, 400);
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [73, 68, 51]);
});

test("ElevenLabs adapter keeps credentials server-side and reuses identical audio", async () => {
  let calls = 0;
  let observedKey = "";
  const fakeFetch: typeof fetch = async (_input, init) => {
    calls += 1;
    observedKey = new Headers(init?.headers).get("xi-api-key") ?? "";
    return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200, headers: { "content-type": "audio/mpeg" } });
  };
  const service = new ElevenLabsPronunciationService("secret-test-key", "voice-test", "eleven_multilingual_v2", fakeFetch);
  const input = { text: "캐시를 확인해요", layer: "phrase" as const, language: "ko" as const };
  const first = await service.synthesize(input);
  const second = await service.synthesize(input);
  assert.equal(calls, 1);
  assert.equal(observedKey, "secret-test-key");
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
});
