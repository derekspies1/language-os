import { stableHash } from "../learner-memory/normalization";
import type { PronunciationLayer } from "./contracts";

const objectUrls = new Map<string, string>();

async function cachedResponse(key: string): Promise<Response | null> {
  if (!("caches" in globalThis)) return null;
  return (await (await caches.open("language-os-pronunciation-v1")).match(`/__language-os-audio/${key}`)) ?? null;
}

async function storeResponse(key: string, response: Response) {
  if (!("caches" in globalThis)) return;
  await (await caches.open("language-os-pronunciation-v1")).put(`/__language-os-audio/${key}`, response);
}

export async function playPronunciation(text: string, layer: PronunciationLayer): Promise<void> {
  const memoryKey = `${layer}\u0000${text}`;
  const cacheKey = `${stableHash(memoryKey)}/${encodeURIComponent(text)}`;
  let objectUrl = objectUrls.get(memoryKey);
  if (!objectUrl) {
    let response = await cachedResponse(cacheKey);
    if (!response) {
      response = await fetch("/api/pronunciation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, layer, language: "ko" }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(message?.error || "Natural Korean audio is unavailable.");
      }
      await storeResponse(cacheKey, response.clone());
    }
    objectUrl = URL.createObjectURL(await response.blob());
    objectUrls.set(memoryKey, objectUrl);
  }
  const audio = new Audio(objectUrl);
  await audio.play();
}
