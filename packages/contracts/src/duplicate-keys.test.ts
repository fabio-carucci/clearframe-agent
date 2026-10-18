import { describe, expect, it } from "vitest";
import { findDuplicateKey } from "./duplicate-keys";

describe("findDuplicateKey", () => {
  it("finds a key repeated in one object, at any depth", () => {
    expect(findDuplicateKey('{"a":1,"a":2}')).toBe("a");
    expect(
      findDuplicateKey(
        '{"clips":[{"license":{"expiresAt":"2031-12-31","expiresAt":"2026-11-02"}}]}',
      ),
    ).toBe("expiresAt");
  });

  it("compares keys as JSON.parse decodes them", () => {
    expect(findDuplicateKey('{"a":1,"\\u0061":2}')).toBe("a");
  });

  it("allows the same key in different objects", () => {
    expect(findDuplicateKey('{"a":{"a":1},"b":[{"a":1},{"a":2}],"c":{"a":[]}}')).toBeNull();
    expect(findDuplicateKey('[{"id":1},{"id":2}]')).toBeNull();
  });

  it("is not misled by quotes, braces or commas inside strings", () => {
    expect(findDuplicateKey('{"a":"x\\",\\"a\\":{","b":"}],[{"}')).toBeNull();
    expect(findDuplicateKey('{"a":"\\\\","a":1}')).toBe("a");
  });

  it("returns null for values that are not objects", () => {
    expect(findDuplicateKey('"a"')).toBeNull();
    expect(findDuplicateKey("[1,2,3]")).toBeNull();
    expect(findDuplicateKey("{}")).toBeNull();
  });
});
