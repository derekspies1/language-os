import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Language OS mission chamber", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Language OS/);
  assert.match(html, /What do you need to be able to say/);
  assert.match(html, /Attempt first/);
  assert.match(html, /Korean/);
  assert.match(html, /Enter the chamber/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("server-renders the Repeat Studio route and social metadata", async () => {
  const response = await render("/repeat");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /K-pop Repeat Studio/);
  assert.match(html, /K-POP REPEAT STUDIO/);
  assert.match(html, /Opening your listening room/);
  assert.match(html, /\/og\.png/);
});

test("server-renders the Learning Universe route", async () => {
  const response = await render("/learn");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Learning Universe/);
  assert.match(html, /Opening your learning universe/);
  assert.match(html, /Local Memory Graph|evidence-backed language knowledge/i);
});

test("server-renders the Daily Exposure route", async () => {
  const response = await render("/exposure");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Daily Exposure/);
  assert.match(html, /DAILY EXPOSURE/);
  assert.match(html, /Opening today.s neighborhood/);
  assert.match(html, /NO STREAKS · NO MASTERY SCORE/);
});

test("server-renders the learner-supplied Source Packs route", async () => {
  const response = await render("/sources");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Source Packs/);
  assert.match(html, /SOURCE PACKS/);
  assert.match(html, /Opening your source shelf/);
});
