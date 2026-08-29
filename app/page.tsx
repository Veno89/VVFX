import type { Metadata } from "next";
import { VfxEditor } from "../src/editor/VfxEditor";

export const metadata: Metadata = {
  title: "Vvfx — 2D VFX Playground",
  description:
    "A friendly, powerful visual editor for creating 2D game effects with images.",
};

export default function Home() {
  return <VfxEditor />;
}
