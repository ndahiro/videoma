/**
 * Site-wide configuration. Mirrors CMSaasStarter's `src/config.ts` so the
 * marketing pages, metadata, sitemap and emails all read from one place.
 */
export const WebsiteName: string =
  process.env.NEXT_PUBLIC_APP_NAME || "Videoma";

export const WebsiteBaseUrl: string =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const WebsiteDescription: string =
  "Video intelligence console — search, question and summarize your video library with semantic AI.";

/** When true, new accounts are sent through the onboarding/profile step. */
export const CreateProfileStep: boolean = true;

/** Support / contact inbox shown on the marketing site. */
export const SupportEmail: string =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@videoma.local";
