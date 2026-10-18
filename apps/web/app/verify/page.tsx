import type { Metadata } from "next";
import { VerifyScreen } from "@/features/verify/verify-screen";

export const metadata: Metadata = {
  title: "Verify a manifest | Clearframe",
  description: "Check a Clearframe manifest's signature in your browser, without an account.",
};

export default function VerifyPage() {
  return <VerifyScreen />;
}
