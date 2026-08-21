import { Storage } from "happy-dom";

// Node 24 exposes experimental storage globals that are undefined unless the
// process receives --localstorage-file. Those own globals shadow happy-dom in a
// full multi-worker run. Give every isolated browser worker concrete in-memory
// stores; focused and full runs then exercise the same device-state contract.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new Storage(),
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: new Storage(),
});
