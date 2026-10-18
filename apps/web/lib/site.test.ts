import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION, SITE_IMAGE, SITE_TITLE, SITE_URL } from "./site";

describe("link preview metadata", () => {
  it("points at the domain the dev stack serves", () => {
    const stack = readFileSync(new URL("../../../infra/env/dev/main.tf", import.meta.url), "utf8");
    const domain = stack.match(/domain_name\s*=\s*"([^"]+)"/)?.[1];
    expect(SITE_URL).toBe(`https://${domain}`);
  });

  it("fits what search results and link previews show", () => {
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("declares the preview image's real size", () => {
    const png = readFileSync(new URL(`../public${SITE_IMAGE.url}`, import.meta.url));
    // A PNG's IHDR chunk holds the width and height at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      SITE_IMAGE.width,
      SITE_IMAGE.height,
    ]);
  });
});
