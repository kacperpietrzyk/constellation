import { lazy } from "react";

import { type LazyDesktopSurface } from "@constellation/desktop-preload/surface-registry";

import { type SurfaceId } from "../client/wave2-fixtures.js";

// TRZY CELE, JEDEN CHUNK, I TO JEST WYBÓR (lot D3). Notatki, Źródła i Historia
// wrzutek są od tego lotu osobnymi pozycjami nawigacji, ale dalej dzielą jeden
// komponent powłoki (`KnowledgeSurface`) i jeden arkusz modułowy, więc trzy
// osobne wejścia rozcięłyby ten kod na trzy chunki z wydzielonym wspólnym
// czwartym — dokładnie ta pułapka, którą `client/shell-navigation.ts` opisuje
// pomiarem: ścieżka pocięta na więcej kawałków kompresuje się GORZEJ, nawet gdy
// sumarycznie maleje. Trzy klucze mapy wołają więc TEN SAM loader, a co się
// narysuje, rozstrzyga props `reading` w `RealApp`.
const loadKnowledgeSurface = () => import("../library/LibraryShell.js");
export const KnowledgeSurface = lazy(() =>
  loadKnowledgeSurface().then((module) => ({
    default: module.KnowledgeSurface,
  })),
);
export const TaskAttachmentsSection = lazy(() =>
  import("../TaskAttachmentsSection.js").then((module) => ({
    default: module.TaskAttachmentsSection,
  })),
);
const loadMeetingsSurface = () => import("../MeetingsSurface.js");
export const MeetingsSurface = lazy(() =>
  loadMeetingsSurface().then((module) => ({ default: module.MeetingsSurface })),
);
const loadSettingsSurface = () => import("../SettingsSurface.js");
export const SettingsSurface = lazy(() =>
  loadSettingsSurface().then((module) => ({ default: module.SettingsSurface })),
);
// Arkusz przychodzi z samym komponentem (CSS Module importuje się w nim),
// więc loader nie musi go dociągać osobno — inaczej niż `organizations`,
// który niesie arkusz globalny jako efekt uboczny i jest po wycofaniu
// `access` JEDYNYM takim loaderem, czyli jedynym, który robi DWA importy po
// kolei.
const loadCalendarSurface = () => import("../CalendarSurface.js");
export const CalendarSurface = lazy(() =>
  loadCalendarSurface().then((module) => ({ default: module.CalendarSurface })),
);
// Plain loader shape: the sheet is a CSS Module imported by the component, so
// it travels with the chunk and never needs a second request or a second
// globally unique name.
const loadPeopleSurface = () => import("../people/PeopleSurface.js");
export const PeopleSurface = lazy(() =>
  loadPeopleSurface().then((module) => ({ default: module.PeopleSurface })),
);
const loadPipelineSurface = () => import("../pipeline/PipelineSurface.js");
export const PipelineSurface = lazy(() =>
  loadPipelineSurface().then((module) => ({ default: module.PipelineSurface })),
);
const loadRenewalsSurface = () => import("../renewals/RenewalsSurface.js");
export const RenewalsSurface = lazy(() =>
  loadRenewalsSurface().then((module) => ({
    default: module.RenewalsSurface,
  })),
);
const loadStrategicDepthSurface = async () => {
  await import("../organization-context.css");
  return import("../StrategicDepthSurface.js");
};
export const StrategicDepthSurface = lazy(() =>
  loadStrategicDepthSurface().then((module) => ({
    default: module.StrategicDepthSurface,
  })),
);
export const OrganizationContextLoader = lazy(() =>
  loadStrategicDepthSurface().then((module) => ({
    default: module.OrganizationContextLoader,
  })),
);
// Onboarding i recovery są modalne oraz rzadkie; ich kod nie należy do
// wejściowego chunku renderera.
export const OnboardingFlow = lazy(() =>
  import("../OnboardingFlow.js").then((module) => ({
    default: module.OnboardingFlow,
  })),
);
export const WorkspaceRecovery = lazy(() =>
  import("../WorkspaceRecovery.js").then((module) => ({
    default: module.WorkspaceRecovery,
  })),
);

// Eksportowane wyłącznie po to, żeby test mógł sprawdzić KOMPLETNOŚĆ tej mapy
// bez czytania pliku źródłowego. Klauzula `satisfies` niżej pilnuje jej dziś na
// etapie kompilacji, ale pilnuje jej TYLKO TUTAJ — gdyby ktoś ją przy rozbiciu
// powłoki zgubił, nic by nie padło. Nie wołaj tych loaderów w teście na Node:
// `organizations` robi `await import("./*.css")`, czego `node --test`
// nie rozwiąże. Sprawdzaj obecność klucza, nie wynik wywołania.
export const lazySurfaceLoaders = {
  calendar: loadCalendarSurface,
  notes: loadKnowledgeSurface,
  sources: loadKnowledgeSurface,
  captures: loadKnowledgeSurface,
  meetings: loadMeetingsSurface,
  settings: loadSettingsSurface,
  organizations: loadStrategicDepthSurface,
  people: loadPeopleSurface,
  pipeline: loadPipelineSurface,
  renewals: loadRenewalsSurface,
} satisfies Record<LazyDesktopSurface, () => Promise<unknown>>;

export const preloadSurface = (surface: SurfaceId) => {
  const loader = lazySurfaceLoaders[surface as LazyDesktopSurface];
  if (loader !== undefined) void loader().catch(() => undefined);
};
