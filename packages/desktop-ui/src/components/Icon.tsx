/* Shared stroke-icon set of the desktop shell. Every surface uses the same
   close glyph and metrics; sizing comes from the global `svg` rule and the
   consuming control (e.g. `.icon-button`). */

export type IconName =
  | "capture"
  | "tasks"
  | "history"
  | "search"
  | "close"
  | "project"
  | "cockpit"
  | "activity"
  | "attention"
  | "access"
  | "documents"
  | "meetings"
  | "relationships"
  | "people"
  | "pipeline"
  | "renewals"
  | "settings";

export const Icon = ({ name }: { readonly name: IconName }) => {
  const paths = {
    capture: <path d="M12 5v14M5 12h14" />,
    tasks: <path d="m5 7 2 2 4-4M12 7h7M5 15l2 2 4-4M12 15h7" />,
    history: <path d="M4 6h16v12H4zM4 14h4l2 2h4l2-2h4" />,
    search: (
      <path d="m20 20-4.3-4.3M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    project: <path d="M4 5h6l2 2h8v12H4z" />,
    cockpit: <path d="M4 5h7v6H4zM13 5h7v10h-7zM4 13h7v6H4zM13 17h7v2h-7z" />,
    activity: <path d="M5 6h14M5 12h14M5 18h9M3 6h.01M3 12h.01M3 18h.01" />,
    attention: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.5 20h5" />
    ),
    access: (
      <path d="M16 19c0-3-2.2-5-5-5s-5 2-5 5M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8h4M19 6v4" />
    ),
    documents: <path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7" />,
    meetings: <path d="M5 5h14v14H5zM8 3v5M16 3v5M5 10h14M8 14h3M13 14h3" />,
    relationships: (
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 10a2.5 2.5 0 1 0 0-5M3 20c0-4 2-6 5-6s5 2 5 6M14 14c3 0 5 2 5 6M11 8h3" />
    ),
    // Dwie sylwetki obok siebie: „relationships" niesie graf powiązań, a to są
    // ludzie w nim. Ten sam cel w nawigacji nie może nosić tego samego znaku co
    // Organizations, bo obie pozycje stoją w tej samej grupie.
    people: (
      <path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16 7.5a2.5 2.5 0 1 1 0 5M17 15c2.5.6 4 2.4 4 5" />
    ),
    // Trzy kolumny malejącej wysokości: tablica, po której sprawa schodzi
    // w dół lejka. Nie może nosić znaku „relationships" ani „people" — wszystkie
    // trzy stoją w tej samej grupie nawigacji.
    pipeline: <path d="M4 5h4v14H4zM10 5h4v10h-4zM16 5h4v6h-4z" />,
    // Cykl, nie kalendarz i nie dokument: kontrakt wraca co okres, a klucz
    // cyklu znaczy dokładnie to. Strzałka zamyka pętlę, wskazówki mówią, że
    // pętla ma termin — obie pozycje CRM obok mają własne znaki, więc ten musi
    // się różnić od `relationships` i od `people`.
    renewals: (
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4v4.5H16M12 8v4.4l2.8 1.7" />
    ),
    settings: (
      <path d="M4 7h7M17 7h3M4 17h2M12 17h8M16 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    ),
  } as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};
