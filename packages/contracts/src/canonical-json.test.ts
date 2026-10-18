import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";

describe("canonicalJson (RFC 8785)", () => {
  it("sorts members by UTF-16 code units, as in the RFC's own example", () => {
    const input = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      ö: "Latin Small Letter O With Diaeresis",
    };
    expect(canonicalJson(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control",' +
        '"ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
        '"😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it("writes numbers as ECMAScript does, with -0 as 0", () => {
    expect(canonicalJson([1e21, 1e-7, -0, 0.002267, 333333333.33333329, 4.5, 2e-3])).toBe(
      "[1e+21,1e-7,0,0.002267,333333333.3333333,4.5,0.002]",
    );
  });

  it("escapes only what JSON requires", () => {
    expect(canonicalJson('quote " backslash \\ line\n tab\t \u000f   é')).toBe(
      '"quote \\" backslash \\\\ line\\n tab\\t \\u000f   é"',
    );
  });

  it("sorts nested objects, keeps array order and leaves undefined members out", () => {
    expect(canonicalJson({ b: [3, { z: 1, a: undefined, m: null }], a: true })).toBe(
      '{"a":true,"b":[3,{"m":null,"z":1}]}',
    );
  });

  it("refuses values JSON cannot represent", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(undefined)).toThrow();
  });
});
