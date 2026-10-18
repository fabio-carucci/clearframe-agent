import type { Metadata } from "next";
import { VerifyScreen } from "@/features/verify/verify-screen";
import { SITE_IMAGE } from "@/lib/site";

const title = "Verify a manifest";
const description =
  "Check a Clearframe manifest's signature in your browser, without an account, and see which clip changed if one did.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { url: "/verify", title: `${title} | Clearframe`, description, images: [SITE_IMAGE] },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Clearframe`,
    description,
    images: [SITE_IMAGE],
  },
  alternates: { canonical: "/verify" },
};

export default function VerifyPage() {
  return <VerifyScreen />;
}
