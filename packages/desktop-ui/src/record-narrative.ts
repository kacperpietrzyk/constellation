export type RecordNarrativeKind = "area" | "initiative" | "project";

export interface RecordNarrativeGap {
  readonly marker: string;
  readonly detail: string;
  readonly action: string;
  readonly field: string;
}

// Obszar, Inicjatywa i Projekt mogą powstać bez zapisanej intencji — import
// pracy, która wyprzedza rekord, nie ma jej skąd wziąć, a wymuszony tekst
// produkuje wiarygodnie wyglądającą zmyśloną treść. Ta luka musi więc czytać
// się jako brak do uzupełnienia, a nie jako pusty wiersz.
export const recordNarrativeGaps: {
  readonly [kind in RecordNarrativeKind]: RecordNarrativeGap;
} = {
  area: {
    marker: "Odpowiedzialność do napisania",
    detail:
      "Ten obszar powstał bez opisanej odpowiedzialności. Napisz, za co stale odpowiadasz.",
    action: "Napisz odpowiedzialność",
    field: "Stała odpowiedzialność",
  },
  initiative: {
    marker: "Wynik do napisania",
    detail:
      "Ta inicjatywa powstała bez zapisanego wyniku. Napisz, co pozwoli ją zamknąć.",
    action: "Napisz wynik",
    field: "Zamierzony wynik",
  },
  project: {
    marker: "Wynik do napisania",
    detail:
      "Ten projekt powstał bez zapisanego wyniku. Napisz, po czym poznasz, że praca jest skończona.",
    action: "Napisz wynik",
    field: "Zamierzony wynik",
  },
};

export type RecordNarrativeView =
  | { readonly written: true; readonly text: string }
  | ({ readonly written: false } & RecordNarrativeGap);

// Projekcje sprowadzają nienapisaną intencję do "" i zgłaszają lukę osobną
// flagą needsReview. Czytamy obie: pusty tekst przy needsReview === false
// oznaczałby starszą projekcję, a wtedy nadal nie ma czego pokazać.
export const readRecordNarrative = (
  kind: RecordNarrativeKind,
  narrative: { readonly text: string; readonly needsReview: boolean },
): RecordNarrativeView =>
  narrative.needsReview || narrative.text.trim() === ""
    ? { written: false, ...recordNarrativeGaps[kind] }
    : { written: true, text: narrative.text };
