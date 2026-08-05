import type { LearningItemType } from "./contracts";

export interface LanguageNormalizationAdapter {
  readonly language: string;
  normalizeForm(value: string, itemType: LearningItemType): string;
  normalizeMeaning(value: string): string;
  suggestSurfaceKind(surface: string, canonical: string): "surface" | "conjugated" | "spacing_variant" | "politeness_variant" | "contraction";
}

function cleanUnicode(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function stripEdgePunctuation(value: string): string {
  return value.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");
}

const languageNeutralAdapter: LanguageNormalizationAdapter = {
  language: "und",
  normalizeForm(value) {
    return stripEdgePunctuation(cleanUnicode(value)).toLocaleLowerCase("und");
  },
  normalizeMeaning(value) {
    return stripEdgePunctuation(cleanUnicode(value)).toLocaleLowerCase("en");
  },
  suggestSurfaceKind(surface, canonical) {
    return cleanUnicode(surface) === cleanUnicode(canonical) ? "surface" : "conjugated";
  },
};

const KOREAN_EXACT_CONTRACTIONS: Record<string, string> = {
  "거": "것",
  "거야": "것이야",
  "거예요": "것이에요",
  "건": "것은",
  "걸": "것을",
  "난": "나는",
  "널": "너를",
  "넌": "너는",
  "뭘": "무엇을",
  "이건": "이것은",
  "저건": "저것은",
  "그건": "그것은",
};

export function expandKoreanContraction(value: string): string {
  const clean = cleanUnicode(value);
  return KOREAN_EXACT_CONTRACTIONS[clean] ?? clean;
}

const koreanAdapter: LanguageNormalizationAdapter = {
  language: "ko",
  normalizeForm(value, itemType) {
    const clean = stripEdgePunctuation(cleanUnicode(value));
    const expanded = itemType === "inflected_form" ? expandKoreanContraction(clean) : clean;
    // Korean spacing is often variable, especially at expression boundaries. The
    // display form is retained separately, while the identity key ignores spacing.
    return expanded.replace(/\s+/g, "");
  },
  normalizeMeaning(value) {
    return stripEdgePunctuation(cleanUnicode(value)).toLocaleLowerCase("en");
  },
  suggestSurfaceKind(surface, canonical) {
    const cleanSurface = cleanUnicode(surface);
    const cleanCanonical = cleanUnicode(canonical);
    if (cleanSurface.replace(/\s+/g, "") === cleanCanonical.replace(/\s+/g, "") && cleanSurface !== cleanCanonical) return "spacing_variant";
    if (expandKoreanContraction(cleanSurface) !== cleanSurface) return "contraction";
    if (/(요|습니다|ㅂ니다)$/.test(cleanSurface) && !/(요|습니다|ㅂ니다)$/.test(cleanCanonical)) return "politeness_variant";
    return cleanSurface === cleanCanonical ? "surface" : "conjugated";
  },
};

const adapters = new Map<string, LanguageNormalizationAdapter>([["ko", koreanAdapter]]);

export function getNormalizationAdapter(language: string): LanguageNormalizationAdapter {
  return adapters.get(language.toLocaleLowerCase("und").split("-")[0]) ?? languageNeutralAdapter;
}

export function normalizeLearningForm(language: string, itemType: LearningItemType, value: string): string {
  return getNormalizationAdapter(language).normalizeForm(value, itemType);
}

export function normalizeMeaning(language: string, value: string): string {
  return getNormalizationAdapter(language).normalizeMeaning(value);
}

export function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function makeLearningItemId(language: string, itemType: LearningItemType, canonicalForm: string): string {
  const normalized = normalizeLearningForm(language, itemType, canonicalForm);
  return `item_${stableHash(`${language.toLowerCase()}\u0000${itemType}\u0000${normalized}`)}`;
}

export function makeSenseId(itemId: string, language: string, gloss: string): string {
  return `sense_${stableHash(`${itemId}\u0000${normalizeMeaning(language, gloss)}`)}`;
}

export function makeRelationshipId(sourceItemId: string, type: string, targetItemId: string): string {
  return `rel_${stableHash(`${sourceItemId}\u0000${type}\u0000${targetItemId}`)}`;
}

export function makeEvidenceId(dedupeKey: string): string {
  return `event_${stableHash(dedupeKey)}`;
}
