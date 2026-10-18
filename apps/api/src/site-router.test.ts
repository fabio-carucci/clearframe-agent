import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../infra/modules/web/site-router.js", import.meta.url),
  "utf8",
);
const handler = new Function(`"use strict";\n${source}\nreturn handler;`)() as (event: {
  request: { uri: string };
}) => { uri: string };

const route = (uri: string) => handler({ request: { uri } }).uri;

describe("site router (CloudFront Function)", () => {
  it("serves an exported page from its .html object", () => {
    expect(route("/verify")).toBe("/verify.html");
    expect(route("/verify/")).toBe("/verify.html");
  });

  it("leaves the root to default_root_object", () => {
    expect(route("/")).toBe("/");
  });

  it("leaves files with an extension alone", () => {
    for (const uri of ["/config.json", "/icon.svg", "/_next/static/chunks/app.js", "/404.html"]) {
      expect(route(uri)).toBe(uri);
    }
  });
});
