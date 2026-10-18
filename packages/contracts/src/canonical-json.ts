/**
 * RFC 8785 (JSON Canonicalization Scheme) for JSON data: object members sorted by UTF-16 code
 * units, strings and numbers written as JSON.stringify writes them (which matches JCS for finite
 * numbers, with -0 as 0), undefined members left out. The bytes a manifest is signed over come
 * from here alone; JSON.stringify would follow key insertion order, which no verifier can redo.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${members.join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`JSON has no representation for ${value}`);
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error(`JSON has no representation for a ${typeof value}`);
  return encoded;
}
