// Dwa prymitywy współdzielone przez powierzchnie ładowane od razu i te
// ładowane leniwie: znacznik rodzaju rekordu i stan pusty.
//
// STOJĄ W OSOBNYM PLIKU Z POWODU ZMIERZONEGO, nie porządkowego. Kiedy leniwy
// chunk Biblioteki zaimportował je bezpośrednio z `Wave2Surfaces.tsx`,
// rolldown wyciągnął CAŁY ten moduł z chunka wejściowego do wspólnego chunka
// preładowanego: 28 340 B / 8 883 B gzip obok chunka wejściowego. Ścieżka
// gorąca zmalała wtedy o 3 306 B surowych i UROSŁA o 566 B po gzipie, bo
// dwadzieścia jeden chunków kompresuje się gorzej niż dwadzieścia — słownik
// kompresji nie przechodzi przez granicę pliku.
//
// Reguła dla całej fali: leniwa powierzchnia nie importuje wartości z modułu
// powierzchni ładowanej od razu. Albo bierze sam typ (import typu znika przy
// kompilacji), albo prymityw wyprowadza się do własnego małego modułu — tak
// jak tutaj. Wtedy wspólny chunk waży tyle, ile prymityw, a nie tyle, ile
// moduł, w którym akurat mieszkał.

export const Mark = ({ kind }: { readonly kind: string }) => (
  <span className={`record-mark mark-${kind}`} aria-hidden="true" />
);

// Tone separates a benign empty ("no open work this week") from a genuine
// warning. Amber is reserved for warnings only (tokens.md), so the default is
// neutral: a forgotten tone degrades to calm, never a false alarm.
export type InlineStateTone = "neutral" | "info" | "warning";

export const InlineState = ({
  title,
  detail,
  action,
  tone = "neutral",
  headingLevel = "h3",
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
  readonly tone?: InlineStateTone;
  readonly headingLevel?: "h2" | "h3";
}) => {
  const Heading = headingLevel;
  return (
    <div
      className={`empty-state empty-state--${tone}`}
      role={tone === "warning" ? "alert" : "status"}
    >
      <span className="empty-glyph">
        <Mark
          kind={
            tone === "warning" ? "warning" : tone === "info" ? "info" : "empty"
          }
        />
      </span>
      <div>
        <Heading>{title}</Heading>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
};
