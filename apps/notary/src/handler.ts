import { KMSClient } from "@aws-sdk/client-kms";
import { CatalogSchema } from "@clearframe/core/catalog/schema";
import { catalogVersion } from "@clearframe/core/catalog/version";
import { notarize } from "@clearframe/core/notary/notarize";
import catalogJson from "../../../data/catalog.json";
import { KmsManifestSigner } from "./kms-signer";

const keyArn = process.env.SIGNING_KEY_ARN;
if (!keyArn) throw new Error("SIGNING_KEY_ARN is not set");

// Bundled when an administrator builds the notary, never read from the data bucket: CI writes
// that bucket, and the licenses the notary checks against must be ones CI cannot change.
const clips = CatalogSchema.parse(catalogJson);
const catalog = {
  clipsById: new Map(clips.map((clip) => [clip.id, clip])),
  version: catalogVersion(clips),
};
const signer = new KmsManifestSigner(new KMSClient({}), keyArn);

const log = (event: string, fields: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));

/** Invoked by the agent role with `{ manifest }`; answers a NotaryResponse. */
export async function handler(event: { manifest?: unknown }) {
  const response = await notarize(event.manifest, { catalog, signer, now: () => new Date() });
  if ("refused" in response) log("refused", response.refused);
  else log("signed", { runId: response.certificate.runId, keyId: signer.keyId });
  return response;
}
