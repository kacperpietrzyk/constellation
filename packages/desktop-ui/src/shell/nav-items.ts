import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

export const navItems = desktopSurfaceRegistry.map(
  ({ shortcut, ...surface }) => ({
    ...surface,
    ...(shortcut === null ? undefined : { shortcut: String(shortcut) }),
  }),
);

/**
 * Cele, które rysują się w LEWEJ KOLUMNIE — czyli wszystkie oprócz trybu
 * Ustawień.
 *
 * `navItems` zostaje pełne, i to jest różnica, która ma znaczenie: paleta,
 * rozwiązywanie `?destination=` i odczyt etykiety celu potrzebują KAŻDEGO
 * wpisu rejestru, łącznie z Ustawieniami. Tylko lewa kolumna ich nie rysuje.
 * Rozróżnienie niesie pole `chrome` w rejestrze — nie `shortcut`, przez który
 * ten sam filtr przez dwie fale nie odsiewał niczego.
 */
export const sidebarNavItems = navItems.filter(
  (item) => item.chrome === "navigation",
);
