export const desktopSurfaceRegistry = [
  {
    id: "cockpit",
    label: "Tydzień",
    icon: "cockpit",
    group: "Praca",
    shortcut: 1,
    loading: "eager",
  },
  {
    id: "meetings",
    label: "Spotkania",
    icon: "meetings",
    group: "Praca",
    shortcut: 2,
    loading: "lazy",
  },
  {
    id: "relationships",
    label: "Relacje",
    icon: "relationships",
    group: "Wiedza",
    shortcut: null,
    loading: "lazy",
  },
  {
    id: "work",
    label: "Praca",
    icon: "work",
    group: "Praca",
    shortcut: 3,
    loading: "lazy",
  },
  {
    id: "tasks",
    label: "Zadania",
    icon: "tasks",
    group: "Praca",
    shortcut: 4,
    loading: "eager",
  },
  {
    id: "projects",
    label: "Projekty",
    icon: "project",
    group: "Praca",
    shortcut: 5,
    loading: "eager",
  },
  {
    id: "history",
    label: "Historia Capture",
    icon: "history",
    group: "Wiedza",
    shortcut: 6,
    loading: "eager",
  },
  {
    id: "activity",
    label: "Aktywność",
    icon: "activity",
    group: "Administracja",
    shortcut: 7,
    loading: "lazy",
  },
  {
    id: "attention",
    label: "Do uwagi",
    icon: "attention",
    group: "Administracja",
    shortcut: 8,
    loading: "eager",
  },
  {
    id: "access",
    label: "Dostęp",
    icon: "access",
    group: "Administracja",
    shortcut: 9,
    loading: "lazy",
  },
  {
    id: "documents",
    label: "Dokumenty",
    icon: "documents",
    group: "Wiedza",
    shortcut: null,
    loading: "lazy",
  },
  {
    id: "settings",
    label: "Ustawienia",
    icon: "settings",
    group: "Administracja",
    shortcut: null,
    loading: "lazy",
  },
] as const;

export type DesktopSurfaceDescriptor = (typeof desktopSurfaceRegistry)[number];
export type DesktopSurface = DesktopSurfaceDescriptor["id"];
export type LazyDesktopSurface = Extract<
  DesktopSurfaceDescriptor,
  { readonly loading: "lazy" }
>["id"];
export type DesktopNavigationGroup = DesktopSurfaceDescriptor["group"];

export const desktopSurfaceIds: readonly DesktopSurface[] =
  desktopSurfaceRegistry.map((surface) => surface.id);

export const isDesktopSurface = (value: unknown): value is DesktopSurface =>
  typeof value === "string" &&
  desktopSurfaceIds.includes(value as DesktopSurface);
