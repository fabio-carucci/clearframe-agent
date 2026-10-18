import { InvokeCommand, type LambdaClient } from "@aws-sdk/client-lambda";
import type { ClearanceCertificate, Manifest } from "@clearframe/contracts";
import { NotaryResponseSchema } from "@clearframe/core/notary/notarize";

export interface Notary {
  /** The manifest's clearance certificate; throws when the notary refuses or fails. */
  certify(manifest: Manifest): Promise<ClearanceCertificate>;
}

/**
 * The notary Lambda, deployed by an administrator where CI cannot change it. The agent role may
 * only invoke it, so code CI deploys can ask for a certificate but not make one.
 */
export class LambdaNotary implements Notary {
  constructor(
    private readonly lambda: Pick<LambdaClient, "send">,
    private readonly functionName: string,
  ) {}

  async certify(manifest: Manifest): Promise<ClearanceCertificate> {
    const { FunctionError, Payload } = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        Payload: new TextEncoder().encode(JSON.stringify({ manifest })),
      }),
    );
    if (FunctionError || !Payload) {
      throw new Error(`Notary failed: ${FunctionError ?? "empty response"}`);
    }
    const response = NotaryResponseSchema.parse(JSON.parse(new TextDecoder().decode(Payload)));
    if ("refused" in response) {
      throw new Error(`Notary refused (${response.refused.code}): ${response.refused.detail}`);
    }
    return response.certificate;
  }
}
