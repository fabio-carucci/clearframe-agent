"use client";

import type { ClearanceCertificate, Manifest } from "@clearframe/contracts";
import {
  type SigningKey,
  type Verification,
  verifySignedManifest,
} from "@clearframe/contracts/certificate";
import { useEffect, useState } from "react";

/**
 * Verifies the manifest and certificate this page holds, which are what its download contains,
 * against `keys`. Null while the check runs. The page shows this result, never the mere presence
 * of a certificate.
 */
export function useSignatureCheck(
  manifest: Manifest | undefined,
  certificate: ClearanceCertificate | undefined,
  keys: readonly SigningKey[],
): Verification | null {
  const [checked, setChecked] = useState<{
    certificate: ClearanceCertificate;
    result: Verification;
  } | null>(null);

  useEffect(() => {
    if (!manifest || !certificate) return;
    let current = true;
    verifySignedManifest({ manifest, certificate }, keys)
      .catch((): Verification => ({
        status: "malformed",
        reason: "A signing key could not be read.",
      }))
      .then((result) => {
        if (current) setChecked({ certificate, result });
      });
    return () => {
      current = false;
    };
  }, [manifest, certificate, keys]);

  return checked && checked.certificate === certificate ? checked.result : null;
}
