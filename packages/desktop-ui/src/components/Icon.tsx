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
  | "work"
  | "cockpit"
  | "activity"
  | "attention"
  | "access"
  | "documents"
  | "meetings"
  | "relationships"
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
    work: <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" />,
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
