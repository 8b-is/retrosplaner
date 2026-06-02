// main.js — wire the engine to the chapters and launch.
import { Engine } from "./engine.js";
import { CHAPTERS } from "./chapters.js";

const canvas = document.getElementById("stage");

try {
  const engine = new Engine(canvas, CHAPTERS);
  // tiny delay so fonts/textures settle, then lift the loader veil
  window.addEventListener("load", () => setTimeout(() => engine.start(), 300));
  // if 'load' already fired
  if (document.readyState === "complete") setTimeout(() => engine.start(), 300);
  window.__book = engine; // handy for poking in the console
} catch (err) {
  console.error(err);
  const l = document.getElementById("loader");
  if (l) l.innerHTML = `<p style="max-width:30rem;text-align:center">Hmm, the universe wouldn't load.<br><small>${err.message}</small><br><br>Try a modern browser (Chrome / Safari / Firefox) and make sure you're serving this folder over <code>http://</code>, not opening the file directly.</p>`;
}
