// SCA-508 (S-2): shared types between server-safe (index.tsx) and client-only
// (client.tsx) app-shell modules. Pure data — no runtime side effects, no
// React imports — so both sides can import it without crossing the
// "use client" boundary.

export type CommandPaletteItem = {
  group: string;
  href: string;
  id: string;
  label: string;
};
