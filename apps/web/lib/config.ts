import { z } from "zod";

export const WebConfigSchema = z.object({
  region: z.string().min(1),
  issuer: z.url(),
  clientId: z.string().min(1),
  authDomain: z.string().min(1),
});

export type WebConfig = z.infer<typeof WebConfigSchema>;

/**
 * Written by Terraform next to the static files, so one build serves any environment. Null when
 * it is absent, as in local development, where the page shows a recorded run instead.
 */
export async function loadWebConfig(): Promise<WebConfig | null> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`config.json returned ${response.status}`);
  return WebConfigSchema.parse(await response.json());
}
