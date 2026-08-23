import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vvfx — 2D VFX Playground",
  description:
    "Create layered, animated 2D game effects visually and export them for Phaser.",
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
