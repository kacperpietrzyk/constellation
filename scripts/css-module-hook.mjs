// Pozwala testom na Node zaimportować komponent, który przynosi własny arkusz.
//
// Powód: powierzchnie pisane od 0.2.0 mają swoje style w CSS Modules, a Today
// jest powierzchnią STARTOWĄ, czyli ładowaną od razu — nie da się jej schować
// za leniwym importem tak, jak zrobiły to WorkSurface i ActivitySurface.
// Bez tego haka `node --test` przewraca się na rozszerzeniu `.css`, zanim
// wykona jedną asercję, a Vite i Vitest radzą sobie z tym same.
//
// Nazwy klas są CZYTANE Z PLIKU, nie zmyślane. Wersja zwracająca klucz dla
// czegokolwiek („Proxy oddający swoją nazwę") ukryłaby literówkę: `styles.tody`
// wyrenderowałoby klasę `tody`, a test przeszedłby na zielono. Tutaj nieznana
// nazwa jest `undefined`, więc literówka jest widoczna w wyniku.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLASS_NAME = /\.(-?[_a-zA-Z][\w-]*)/g;

const moduleSource = (url) => {
  const css = readFileSync(fileURLToPath(url), "utf8");
  const names = new Set();
  for (const match of css.matchAll(CLASS_NAME)) names.add(match[1]);
  const entries = [...names].map(
    (name) => `${JSON.stringify(name)}: ${JSON.stringify(name)}`,
  );
  return `export default { ${entries.join(", ")} };`;
};

// Skompilowany test leży w `build/ts/src`, a arkusz nigdy tam nie trafia —
// `tsc` przepisuje wyłącznie kod. Rozwiązujemy więc ścieżkę z powrotem do
// źródeł, bo to jedyne miejsce, gdzie ten plik istnieje.
export const resolve = async (specifier, context, nextResolve) => {
  if (!specifier.endsWith(".css")) return nextResolve(specifier, context);
  const url = new URL(specifier, context.parentURL).href;
  return {
    url: url.replace("/build/ts/src/", "/src/"),
    format: "module",
    shortCircuit: true,
  };
};

export const load = async (url, context, nextLoad) => {
  if (!url.endsWith(".css")) return nextLoad(url, context);
  return {
    format: "module",
    shortCircuit: true,
    source: url.endsWith(".module.css")
      ? moduleSource(url)
      : "export default undefined;",
  };
};
