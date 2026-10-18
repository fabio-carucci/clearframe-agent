import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PUBLISHED_SIGNING_KEYS, verifySignedManifest } from "@clearframe/contracts/certificate";

/**
 * Verifies a downloaded manifest with the keys committed to this checkout, without the website:
 * the site's page and keys are deployed by CI, so they are only as trustworthy as the pipeline.
 * Exits 0 only for a valid signature over an unchanged manifest.
 */
const file = process.argv[2];
if (!file) {
  console.error("Usage: pnpm verify-manifest <manifest file>");
  process.exit(2);
}

// pnpm runs root scripts from the repository root; the path is relative to where it was typed.
const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const result = await verifySignedManifest(await readFile(path, "utf8"), PUBLISHED_SIGNING_KEYS);

switch (result.status) {
  case "valid": {
    const { certificate, manifest } = result;
    console.log(`valid: signed ${certificate.issuedAt} with key ${certificate.keyId}`);
    console.log(
      `run ${manifest.runId}, ${manifest.clips.length} clips, catalog ${manifest.catalogVersion}`,
    );
    console.log(`manifest digest ${certificate.digests.manifest}`);
    break;
  }
  case "content_changed": {
    const { changes } = result;
    console.log("content_changed: the signature is genuine, the manifest is not what it signed");
    if (changes.manifest) console.log("- the request or fields outside the clips changed");
    if (changes.clipCount) {
      console.log(
        `- ${changes.clipCount.signed} clips signed, ${changes.clipCount.received} in the file`,
      );
    }
    for (const { index, clipId } of changes.clips) {
      console.log(`- clip ${index + 1}${clipId ? ` (${clipId})` : ""} changed`);
    }
    break;
  }
  case "malformed":
    console.log(`malformed: ${result.reason}`);
    break;
  case "unknown_key":
    console.log(`unknown_key: ${result.certificate.keyId} is not in signing-keys.json`);
    break;
  case "signature_invalid":
    console.log("signature_invalid: the certificate was altered or forged");
    break;
  case "unsigned":
    console.log("unsigned: the file has no certificate, so nothing shows Clearframe issued it");
}
process.exit(result.status === "valid" ? 0 : 1);
