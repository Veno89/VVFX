import type { Metadata } from "next";
import "./globals.css";

// Inline brand mark so browsers never request a missing /favicon.ico.
const APP_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#73e7bb"/><stop offset="1" stop-color="#63ddf3"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="M18 5 8 18h7l-2 9 10-13h-7z" fill="#0b1620"/></svg>',
  );

export const metadata: Metadata = {
  title: "Vvfx — 2D VFX Playground",
  description:
    "Create layered, animated 2D game effects visually and export them for Phaser.",
  icons: { icon: APP_ICON },
  // Lets browsers install the hosted editor as an app (see public/sw.js).
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
