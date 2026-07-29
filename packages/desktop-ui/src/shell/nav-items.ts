import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

export const navItems = desktopSurfaceRegistry.map(
  ({ shortcut, ...surface }) => ({
    ...surface,
    ...(shortcut === null ? undefined : { shortcut: String(shortcut) }),
  }),
);
