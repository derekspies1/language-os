import { z } from "zod";

export const PronunciationLayerSchema = z.enum(["word", "phrase", "micro_context"]);
export type PronunciationLayer = z.infer<typeof PronunciationLayerSchema>;

export const PronunciationRequestSchema = z.object({
  text: z.string().trim().min(1).max(160).refine((value) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(value), "Pronunciation text must contain Korean."),
  layer: PronunciationLayerSchema,
  language: z.literal("ko").default("ko"),
});
export type PronunciationRequest = z.infer<typeof PronunciationRequestSchema>;

export interface PronunciationService {
  readonly provider: "elevenlabs";
  readonly model: string;
  synthesize(input: PronunciationRequest, signal?: AbortSignal): Promise<{ bytes: Uint8Array; contentType: string; cacheHit: boolean }>;
}
