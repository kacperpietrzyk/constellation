/// <reference types="node" />

import ts from "typescript";

/**
 * Zdanie, które człowiek przeczyta na ekranie, razem z miejscem i kontekstem,
 * w którym stoi.
 */
export type ProseCandidate = {
  readonly line: number;
  readonly text: string;
  /** Znacznik JSX, wewnątrz którego tekst stoi — do komunikatu błędu. */
  readonly within: string;
  /** Czy tekst jest w miejscu, gdzie długie zdanie jest dozwolone. */
  readonly exempt: boolean;
  /** Dlaczego jest dozwolone; puste, gdy nie jest. */
  readonly exemption: string;
};

// Skaner z `copy-scan.ts` jest maszyną stanu nad znakami i do szukania POLSKICH
// znaczników w zupełności wystarcza: nadmiarowe złapanie `a > b && c < d` jest
// tam nieszkodliwe, bo identyfikatory w repo są angielskie. Do LICZENIA DŁUGOŚCI
// zdań ta sama nadmiarowość jest zabójcza — kod złapany jako treść to zdanie,
// którego nikt nie napisał, a strażnik, który zgłasza wymyślone zdania, zostanie
// wyłączony po trzecim fałszywym alarmie. Dlatego tu jest prawdziwy parser: ten
// sam TypeScript, którym repo się kompiluje, więc zero nowych zależności.
const parse = (fileName: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** Atrybuty JSX, których wartość człowiek czyta. */
const COPY_ATTRIBUTES = new Set([
  "title",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "alt",
  "placeholder",
  "label",
  "description",
  "summary",
  "message",
  "hint",
  "help",
  "caption",
  "detail",
  "reason",
  "note",
  "explanation",
  "emptyLabel",
  "confirmLabel",
]);

// Miejsca, w których długie zdanie jest z założenia w porządku. Pusty stan ma
// prawo wyjaśnić, czego nie ma i co z tym zrobić; toast mówi, co się właśnie
// stało; blok kodu nie jest prozą. Rozpoznajemy je po KSZTAŁCIE drzewa (nazwa
// znacznika albo klasa), nie po liście plików — inaczej nowy ekran dostawałby
// wyjątek przez samo bycie nowym.
const EXEMPT_TAG = /^(code|pre|kbd|samp)$/;
const EXEMPT_NAME = /(empty|toast|placeholder|code|snippet)/i;
const EXEMPT_CLASS = /(empty-state|empty|toast|code|snippet)/i;

const attributeText = (
  attribute: ts.JsxAttribute,
): { readonly name: string; readonly value: string } | undefined => {
  const name = attribute.name.getText();
  const initializer = attribute.initializer;
  if (initializer === undefined) return undefined;
  if (ts.isStringLiteral(initializer)) {
    return { name, value: initializer.text };
  }
  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression !== undefined &&
    (ts.isStringLiteral(initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(initializer.expression))
  ) {
    return { name, value: initializer.expression.text };
  }
  return undefined;
};

const openingElementOf = (
  node: ts.Node,
): ts.JsxOpeningLikeElement | ts.JsxOpeningElement | undefined => {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return undefined;
};

const describeElement = (element: ts.JsxOpeningLikeElement): string =>
  element.tagName.getText();

const classNameOf = (element: ts.JsxOpeningLikeElement): string => {
  for (const property of element.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    if (property.name.getText() !== "className") continue;
    const initializer = property.initializer;
    if (initializer === undefined) continue;
    if (ts.isStringLiteral(initializer)) return initializer.text;
    // `className={`row ${x}`}` i `clsx(...)` — bierzemy cały tekst wyrażenia,
    // bo szukamy tu wyłącznie SŁOWA, nie dokładnej wartości.
    return initializer.getText();
  }
  return "";
};

/**
 * Idzie w górę drzewa i mówi, czy tekst stoi w miejscu, które ma prawo do
 * długiego zdania. Zwraca powód, żeby komunikat błędu mówił, dlaczego coś
 * przeszło — inaczej wyjątek jest niewidzialny i po roku nikt nie wie, czemu
 * jedno zdanie jest legalne, a drugie nie.
 */
const exemptionFor = (
  node: ts.Node,
): { readonly exempt: boolean; readonly exemption: string } => {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    const element = openingElementOf(current);
    if (element !== undefined) {
      const tag = describeElement(element);
      if (EXEMPT_TAG.test(tag)) {
        return { exempt: true, exemption: `<${tag}>` };
      }
      if (EXEMPT_NAME.test(tag)) {
        return { exempt: true, exemption: `<${tag}>` };
      }
      const className = classNameOf(element);
      if (className !== "" && EXEMPT_CLASS.test(className)) {
        return { exempt: true, exemption: `class ${className}` };
      }
    }
    // Komunikat rzucanego błędu i wpis do konsoli nie są interfejsem.
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const callee = current.expression.getText();
      if (/^(new )?(Error|TypeError|RangeError)$/.test(callee)) {
        return { exempt: true, exemption: "thrown error" };
      }
      if (/^console\./.test(callee)) {
        return { exempt: true, exemption: "console" };
      }
    }
    current = current.parent;
  }
  return { exempt: false, exemption: "" };
};

const enclosingTag = (node: ts.Node): string => {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    const element = openingElementOf(current);
    if (element !== undefined) return describeElement(element);
    current = current.parent;
  }
  return "";
};

/** Prettier łamie dłuższą treść JSX na wiele linii — sklejamy ją z powrotem. */
const collapse = (text: string): string => text.replace(/\s+/gu, " ").trim();

/**
 * Wyciąga z pliku wszystko, co człowiek przeczyta: treść JSX i wartości
 * atrybutów niosących copy. Świadomie NIE bierze każdego literału tekstowego —
 * identyfikatory, klucze i ścieżki nie są prozą, a strażnik liczący je mierzyłby
 * co innego, niż nazywa.
 */
export const extractVisibleProse = (
  fileName: string,
  source: string,
): ProseCandidate[] => {
  const file = parse(fileName, source);
  const found: ProseCandidate[] = [];

  const record = (node: ts.Node, raw: string, within: string): void => {
    const text = collapse(raw);
    if (text === "") return;
    const { exempt, exemption } = exemptionFor(node);
    found.push({
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      text,
      within,
      exempt,
      exemption,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      record(node, node.text, enclosingTag(node));
    } else if (ts.isJsxAttribute(node)) {
      const attribute = attributeText(node);
      if (attribute !== undefined && COPY_ATTRIBUTES.has(attribute.name)) {
        record(
          node,
          attribute.value,
          `${enclosingTag(node)}[${attribute.name}]`,
        );
      }
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      // Copy nie mieszka wyłącznie w JSX-ie: wykład równie dobrze siedzi
      // w `const explanation = "…"` wyrenderowanym przez `{explanation}`.
      // Ścieżki importu i wartości atrybutów są tu pomijane, bo pierwsze nie
      // są tekstem, a drugie zostały już policzone wyżej.
      const parent = node.parent;
      const isModulePath =
        parent !== undefined &&
        (ts.isImportDeclaration(parent) ||
          ts.isExportDeclaration(parent) ||
          ts.isImportTypeNode(parent) ||
          ts.isExternalModuleReference(parent));
      const isAttributeValue =
        parent !== undefined &&
        (ts.isJsxAttribute(parent) ||
          (ts.isJsxExpression(parent) &&
            parent.parent !== undefined &&
            ts.isJsxAttribute(parent.parent)));
      if (!isModulePath && !isAttributeValue) {
        record(node, node.text, "literal");
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return found;
};

// Kształty, które bywają długie i mają spacje, a nie są zdaniem: selektory
// CSS, ścieżki, wzorce dat, listy klas. Strażnik, który je liczy, zgłasza
// zdania, których nikt nie napisał — i po trzecim fałszywym alarmie zostaje
// wyłączony, czyli kosztuje dokładnie tyle, ile miał chronić.
const NOT_PROSE =
  /(\[data-|\bvar\(|--[a-z]|\{|\}|\bhttps?:|\/\/|\.\w+\s*\(|;\s)/u;

/**
 * Czy tekst jest ZDANIEM, a nie etykietą? Trzy słowa to minimum, plus odsiew
 * kształtów technicznych. Bez tego progu strażnik liczyłby ścieżki, klasy
 * i klucze jako prozę.
 */
export const isSentence = (text: string): boolean =>
  /[A-Za-z]/.test(text) &&
  text.split(/\s+/u).filter(Boolean).length >= 3 &&
  !NOT_PROSE.test(text);

/**
 * Próg z planu: angielskie zdanie dłuższe niż ~96 znaków poza pustym stanem,
 * toastem i blokiem kodu jest wykładem. Liczba jest z prototypu — najdłuższy
 * przyjęty nagłówek ekranu ma 83 znaki.
 */
export const PROSE_LIMIT = 96;

/** Zdania, które łamią próg i nie mają wyjątku. */
export const lecturesIn = (
  fileName: string,
  source: string,
): ProseCandidate[] =>
  extractVisibleProse(fileName, source).filter(
    (candidate) =>
      !candidate.exempt &&
      isSentence(candidate.text) &&
      candidate.text.length > PROSE_LIMIT,
  );
