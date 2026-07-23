import {
  readRecordNarrative,
  recordNarrativeGaps,
  type RecordNarrativeKind,
} from "../record-narrative.js";

// Wiersze list są jednym przyciskiem, więc luka może w nich być tylko
// znacznikiem — zagnieżdżona kontrolka byłaby niepoprawna, a aktywacja wiersza
// i tak prowadzi tam, gdzie intencję da się napisać. Znacznik jest zwykłym
// tekstem, więc wchodzi do dostępnej nazwy wiersza.
export const NarrativeText = ({
  kind,
  text,
  needsReview,
}: {
  readonly kind: RecordNarrativeKind;
  readonly text: string;
  readonly needsReview: boolean;
}) => {
  const narrative = readRecordNarrative(kind, { text, needsReview });
  return narrative.written ? (
    <>{narrative.text}</>
  ) : (
    <span className="narrative-gap">{narrative.marker}</span>
  );
};

// Tam, gdzie intencja jest treścią główną, luka dostaje własne działanie:
// albo otwiera edytor na miejscu, albo prowadzi do powierzchni rekordu.
export const NarrativeGap = ({
  kind,
  onWrite,
}: {
  readonly kind: RecordNarrativeKind;
  readonly onWrite: () => void;
}) => {
  const gap = recordNarrativeGaps[kind];
  return (
    <div className="narrative-gap-block" role="status">
      <p className="narrative-gap">{gap.marker}</p>
      <p>{gap.detail}</p>
      <button
        type="button"
        className="secondary-button compact"
        onClick={onWrite}
      >
        {gap.action}
      </button>
    </div>
  );
};
