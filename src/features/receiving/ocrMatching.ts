export type OcrSupplierMatch =
  | { kind: "match"; value: string; score: number }
  | { kind: "ambiguous"; options: Array<{ value: string; score: number }> }
  | { kind: "none"; text: string };

export const normalizeSupplierCodeForOcr = (value: unknown) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("en-US")
  .replace(/[^A-Z0-9]+/g, "");

const levenshtein = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, row[rightIndex - 1], row[rightIndex]) + 1;
      diagonal = previous;
    }
  }
  return row[right.length];
};

const similarity = (observed: string, expected: string) => {
  if (!observed || !expected) return 0;
  if (observed === expected) return 1;
  if (observed.includes(expected)) return 0.98;
  const length = Math.max(observed.length, expected.length);
  return Math.max(0, 1 - levenshtein(observed, expected) / length);
};

export function matchOcrSupplierCode(rawText: string, candidates: string[]): OcrSupplierMatch {
  const observedValues = [...new Set([
    rawText,
    ...rawText.split(/[\r\n]+/),
  ].map(normalizeSupplierCodeForOcr).filter((value) => value.length >= 2))];
  const ranked = [...new Set(candidates.map((value) => value.trim()).filter(Boolean))]
    .map((value) => ({
      value,
      score: Math.max(0, ...observedValues.map((observed) => similarity(observed, normalizeSupplierCodeForOcr(value)))),
    }))
    .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value));
  const best = ranked[0];
  if (!best || best.score < 0.82) return { kind: "none", text: rawText.trim() };
  const close = ranked.filter((item) => item.score >= 0.82 && best.score - item.score < 0.08);
  if (close.length > 1) return { kind: "ambiguous", options: close.slice(0, 5) };
  return { kind: "match", value: best.value, score: best.score };
}
