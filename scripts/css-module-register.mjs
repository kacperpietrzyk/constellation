// Rejestracja haka ładowania arkuszy dla `node --test`. Osobny plik, bo
// `register` musi wykonać się w wątku głównym, zanim cokolwiek zaimportuje
// komponent — a same hooki żyją w wątku ładowarki.
import { register } from "node:module";

register("./css-module-hook.mjs", import.meta.url);
