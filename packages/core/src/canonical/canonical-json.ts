export type CanonicalJsonPrimitive = string | number | boolean | null;
export type CanonicalJsonValue = CanonicalJsonPrimitive | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue | undefined };

export interface CanonicalJsonOptions {
  allowNonIntegerNumbers?: boolean;
}

export function compareUnicodeCodePointStrings(a: string, b: string): number {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const max = Math.min(ac.length, bc.length);
  for (let i = 0; i < max; i += 1) {
    const ap = ac[i]?.codePointAt(0) ?? 0;
    const bp = bc[i]?.codePointAt(0) ?? 0;
    if (ap !== bp) return ap - bp;
  }
  return ac.length - bc.length;
}

function assertCanonicalNumber(value: number, options: CanonicalJsonOptions): void {
  if (!Number.isFinite(value)) {
    throw new TypeError("canonical JSON does not support non-finite numbers");
  }
  if (!options.allowNonIntegerNumbers && !Number.isInteger(value)) {
    throw new TypeError("canonical JSON numbers must be integers unless explicitly permitted");
  }
  if (Object.is(value, -0)) {
    throw new TypeError("canonical JSON does not support negative zero");
  }
}

function serialize(value: unknown, options: CanonicalJsonOptions): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    const numericValue = value as number;
    assertCanonicalNumber(numericValue, options);
    return JSON.stringify(numericValue);
  }
  if (type === "undefined") {
    throw new TypeError("top-level undefined is not a canonical JSON value");
  }
  if (type === "bigint" || type === "function" || type === "symbol") {
    throw new TypeError(`unsupported canonical JSON value type: ${type}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => {
      if (item === undefined) throw new TypeError("array undefined values are not canonical JSON values");
      return serialize(item, options);
    }).join(",")}]`;
  }
  if (value instanceof Date) {
    throw new TypeError("canonical JSON timestamps must be schema-validated strings, not Date objects");
  }
  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue)
    .filter((key) => objectValue[key] !== undefined)
    .sort(compareUnicodeCodePointStrings);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(objectValue[key], options)}`).join(",")}}`;
}

export function canonicalJson(value: unknown, options: CanonicalJsonOptions = {}): string {
  return serialize(value, options);
}

export function canonicalJsonBytes(value: unknown, options: CanonicalJsonOptions = {}): Buffer {
  return Buffer.from(canonicalJson(value, options), "utf8");
}
