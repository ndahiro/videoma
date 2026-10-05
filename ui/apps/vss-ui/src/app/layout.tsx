import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { WebsiteBaseUrl, WebsiteDescription, WebsiteName } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(WebsiteBaseUrl),
  title: {
    default: `${WebsiteName} — Video Intelligence Console`,
    template: `%s · ${WebsiteName}`,
  },
  description: WebsiteDescription,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}