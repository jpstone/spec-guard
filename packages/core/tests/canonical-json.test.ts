import { describe, expect, it } from "vitest";
import { canonicalJson, sha256HexCanonical, sha256LowerHex } from "../src/index.ts";

describe("canonical JSON", () => {
  it("sorts object keys by Unicode code point and emits compact JSON", () => {
    const value = { "😀": 1, b: 2, "\uE000": 3, A: 4 };
    expect(canonicalJson(value)).toBe('{"A":4,"b":2,"":3,"😀":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it("omits absent optional fields represented as undefined", () => {
    expect(canonicalJson({ present: true, optional: undefined })).toBe('{"present":true}');
  });

  it("hashes canonical bytes with SHA-256 lower hex golden values", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(sha256HexCanonical({ b: 2, a: 1 })).toBe("43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
    expect(sha256LowerHex(Buffer.from("abc", "utf8"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("rejects non-integer canonical numbers by default", () => {
    expect(() => canonicalJson({ n: 1.5 })).toThrow(/integers/);
  });
});
