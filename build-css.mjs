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
  "sections-legal.css",
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

/**
 * Минификация: убирает комментарии и лишние пробелы.
 *
 * Своя, а не пакетом: задача сводится к двум правилам, а любая зависимость
 * здесь попадёт в цепочку сборки чужого проекта на MODX.
 *
 * Строки в кавычках проходят нетронутыми — внутри content: "…" могут стоять
 * фигурные скобки и точки с запятой, и наивная замена по регулярному
 * выражению съела бы их вместе с разметкой правила.
 */
function minify(source) {
  let out = "";
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    /* Строка: копируем как есть до закрывающей кавычки того же вида */
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        out += source[i];
        if (source[i] === "\\") {
          out += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    /* Комментарий: пропускаем целиком. /*! — заголовок файла, он остаётся */
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      if (source[i + 2] === "!") out += source.slice(i, stop);
      i = stop;
      continue;
    }

    /* Пробельная последовательность схлопывается в один пробел */
    if (/\s/.test(ch)) {
      while (i < source.length && /\s/.test(source[i])) i += 1;
      out += " ";
      continue;
    }

    out += ch;
    i += 1;
  }

  return out
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    /* calc(100% - 4px) без пробелов вокруг минуса считается одним числом */
    .replace(/calc\(([^()]*)\)/g, (m, inner) => "calc(" + inner.replace(/([+\-*/])/g, " $1 ").replace(/\s+/g, " ") + ")")
    .trim();
}

const min = minify(header + css);
writeFileSync(`${OUT}/hybrid.min.css`, min);

const kb = (n) => (Buffer.byteLength(n) / 1024).toFixed(1);
console.log(
  `CSS собран: hybrid.css ${kb(header + css)} КБ (читаемый, для передачи), ` +
    `hybrid.min.css ${kb(min)} КБ (подключается в HTML)`
);
