import { describe, expect, it, vi } from "vitest";
import { cachedFor } from "./cache";

describe("cachedFor", () => {
  it("reuses the value until the TTL passes, then loads again", async () => {
    let clock = 0;
    const load = vi.fn(async () => clock);
    const get = cachedFor(1000, load, () => clock);

    await expect(get()).resolves.toBe(0);
    clock = 999;
    await expect(get()).resolves.toBe(0);
    clock = 1001;
    await expect(get()).resolves.toBe(1001);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retries on the next call after a failed load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("S3 down")).mockResolvedValue("ok");
    const get = cachedFor(1000, load, () => 0);
    await expect(get()).rejects.toThrow("S3 down");
    await expect(get()).resolves.toBe("ok");
  });
});
