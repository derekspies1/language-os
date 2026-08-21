import { PronunciationRequestSchema, type PronunciationService } from "../../lib/pronunciation/contracts";
import { resolvePronunciationService } from "../../lib/pronunciation/server/elevenlabs";

type HandlerOptions = { resolveService?: () => PronunciationService | null };

export function createPronunciationHandler(options: HandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const parsed = PronunciationRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Pronunciation requires a short Korean word or phrase." }, { status: 400 });
    const service = (options.resolveService ?? resolvePronunciationService)();
    if (!service) return Response.json({
      error: "Natural Korean audio is not configured on this server.",
      code: "pronunciation_unavailable",
    }, { status: 503 });
    try {
      const audio = await service.synthesize(parsed.data, request.signal);
      const body = new Uint8Array(audio.bytes.byteLength);
      body.set(audio.bytes);
      return new Response(body.buffer, {
        status: 200,
        headers: {
          "content-type": audio.contentType,
          "cache-control": "private, max-age=604800",
          "x-language-os-audio-cache": audio.cacheHit ? "hit" : "miss",
        },
      });
    } catch {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      return Response.json({ error: "Natural Korean audio is temporarily unavailable.", code: "pronunciation_failed" }, { status: 502 });
    }
  };
}

export const POST = createPronunciationHandler();

export async function GET(): Promise<Response> {
  const service = resolvePronunciationService();
  return Response.json({ available: Boolean(service), provider: service?.provider ?? null, model: service?.model ?? null });
}
