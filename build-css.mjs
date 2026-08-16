/**
 * Сборка CSS: модули из src/assets/css склеиваются в один dist/assets/css/hybrid.css.
 *
 * Оболочка (shell.css) едет вместе со всем остальным: после смены дизайна
 * шапка и футер стали нашими, а не темы сайта.
 *
 * Никакого препроцессора — только конкатенация в заданном порядке. Причина:
 * файл едет в чужой проект на MODX, и разработчик Pixtoon должен уметь
 * открыть его и прочитать, а не искать сорсмапы. Модули существуют для нас,
 * один файл — для прода.
 *
 * Порядок значим: токены объявляются раньше, чем к ним обращаются.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "src/assets/css";
const OUT = "dist/assets/css";

const modules = [
  "tokens.css",
  "base.css",
  "shell.css",
  "sections-site.css",
  "sections-landing.css",
  "sections-case.css",
];

mkdirSync(OUT, { recursive: true });

const header = `/*! Pixtoon — Hybrid Production
 * Стили раздела. Всё под .hyb-scope: тема сайта не затрагивается.
 * Собрано из: ${modules.join(", ")}
 */\n\n`;

const css = modules
  .map((f) => `/* ===== ${f} ===== */\n` + readFileSync(`${SRC}/${f}`, "utf8"))
  .join("\n\n");

writeFileSync(`${OUT}/hybrid.css`, header + css);

const kb = (Buffer.byteLength(header + css) / 1024).toFixed(1);
console.log(`CSS собран: ${OUT}/hybrid.css (${kb} КБ)`);
