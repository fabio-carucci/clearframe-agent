import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { SignCommand } from "@aws-sdk/client-kms";
import { describe, expect, it } from "vitest";
import { KmsManifestSigner, derToRaw, keyIdFromArn } from "./kms-signer";

const bytes = (length: number, first: number, fill = 0x11) => {
  const value = new Uint8Array(length).fill(fill);
  value[0] = first;
  return value;
};

/** Minimal DER for an integer: no leading zeros, plus 0x00 when the top bit is set. */
function derInteger(value: Uint8Array): number[] {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  const minimal = [...value.subarray(start)];
  if (minimal[0]! & 0x80) minimal.unshift(0);
  return [0x02, minimal.length, ...minimal];
}

const derSignature = (r: Uint8Array, s: Uint8Array) => {
  const body = [...derInteger(r), ...derInteger(s)];
  return new Uint8Array([0x30, body.length, ...body]);
};

const padded = (value: Uint8Array) => {
  const out = new Uint8Array(32);
  out.set(value, 32 - value.length);
  return out;
};

describe("derToRaw", () => {
  it("drops the 0x00 DER adds before an integer whose top bit is set", () => {
    const r = bytes(32, 0x80);
    const s = bytes(32, 0x7f);
    const der = derSignature(r, s);
    expect(der[3]).toBe(33);
    expect(derToRaw(der)).toEqual(new Uint8Array([...r, ...s]));
  });

  it("left-pads integers DER wrote in fewer than 32 bytes", () => {
    const r = bytes(32, 0x00, 0x00);
    r[31] = 0x05;
    const s = padded(bytes(30, 0x01));
    const raw = derToRaw(derSignature(r, s));
    expect(raw).toHaveLength(64);
    expect(raw.subarray(0, 32)).toEqual(r);
    expect(raw.subarray(32)).toEqual(s);
  });

  it("converts signatures Node signs in DER into ones it verifies raw", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    for (let attempt = 0; attempt < 300; attempt++) {
      const message = Buffer.from(`manifest ${attempt}`);
      const der = sign("sha256", message, privateKey);
      const raw = derToRaw(der);
      expect(verify("sha256", message, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(
        true,
      );
    }
  });

  it.each([
    ["not a sequence", [0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]],
    ["a sequence length that does not match", [0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]],
    ["an integer longer than its bytes", [0x30, 0x06, 0x02, 0x05, 0x01, 0x02, 0x01, 0x01]],
    ["an empty integer", [0x30, 0x05, 0x02, 0x00, 0x02, 0x01, 0x01]],
    [
      "an integer longer than 32 bytes",
      [0x30, 0x26, 0x02, 0x21, ...bytes(33, 0x01), 0x02, 0x01, 0x01],
    ],
  ])("refuses %s", (_case, der) => {
    expect(() => derToRaw(new Uint8Array(der))).toThrow("Malformed DER signature");
  });
});

describe("keyIdFromArn", () => {
  it("takes the key's UUID, leaving the account id out of certificates", () => {
    expect(
      keyIdFromArn("arn:aws:kms:eu-west-1:327137642576:key/1234abcd-12ab-34cd-56ef-1234567890ab"),
    ).toBe("1234abcd-12ab-34cd-56ef-1234567890ab");
    expect(() => keyIdFromArn("alias/clearframe-dev-manifest-signing")).toThrow();
  });
});

describe("KmsManifestSigner", () => {
  it("asks KMS to sign the SHA-256 of the input as a digest, and returns raw r‖s", async () => {
    const arn = "arn:aws:kms:eu-west-1:327137642576:key/1234abcd-12ab-34cd-56ef-1234567890ab";
    const r = bytes(32, 0x90);
    const s = bytes(32, 0x10);
    const sent: SignCommand[] = [];
    const kms = {
      send: async (command: SignCommand) => {
        sent.push(command);
        return { Signature: derSignature(r, s) };
      },
    };
    const signer = new KmsManifestSigner(kms as never, arn);
    const input = new TextEncoder().encode('{"v":1}');

    expect(await signer.sign(input)).toEqual(new Uint8Array([...r, ...s]));
    expect(sent[0]).toBeInstanceOf(SignCommand);
    expect(sent[0]!.input).toMatchObject({
      KeyId: arn,
      MessageType: "DIGEST",
      SigningAlgorithm: "ECDSA_SHA_256",
    });
    expect(Buffer.from(sent[0]!.input.Message!)).toEqual(
      createHash("sha256").update(input).digest(),
    );
    expect(signer.keyId).toBe("1234abcd-12ab-34cd-56ef-1234567890ab");
  });
});
