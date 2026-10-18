/**
 * The public address. Link previews are read from the static HTML by crawlers that run no
 * scripts, so it is built in rather than read from config.json at runtime like the Cognito ids.
 */
export const SITE_URL = "https://clearframe.fabio-carucci.com";

export const SITE_TITLE = "Clearframe: rights-cleared video datasets for AI training";

export const SITE_DESCRIPTION =
  "An AI agent proposes clips for video training datasets and a deterministic rights rule decides each one. Every manifest is signed and verifiable in the browser.";

/** The link preview image, 1200 × 630, in public/. */
export const SITE_IMAGE = {
  url: "/opengraph.png",
  width: 1200,
  height: 630,
  alt: "Clearframe: a grid of video clips, eight marked cleared and one not cleared because its license expired.",
};
