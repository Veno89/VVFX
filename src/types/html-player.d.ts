declare module "virtual:vvfx-html-player" {
  /** Minified IIFE that defines window.VvfxHtmlPlayer.mount(config). */
  export const playerScript: string;
  /** Exact Phaser version the player was built against. */
  export const phaserVersion: string;
  /** Subresource Integrity hash of that version's dist/phaser.min.js. */
  export const phaserIntegrity: string;
}
