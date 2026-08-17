/**
 * Сборка JS: рядом с читаемым hybrid.js кладётся hybrid.min.js, он и
 * подключается в HTML. Разделение то же, что у стилей: комментарии в этом
 * файле объясняют, почему код такой, и нужны разработчику, который будет
 * заводить раздел в MODX, — но не браузеру посетителя.
 *
 * Минификация нарочно неглубокая: убираются комментарии и отступы, переводы
 * строк остаются на месте. Сжимать дальше — переименовывать переменные,
 * склеивать строки — без разбора синтаксиса нельзя: JavaScript расставляет
 * точки с запятой сам, и удаление перевода строки меняет смысл программы.
 * Экономия и так выходит около половины файла.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "src/assets/js/hybrid.js";
const OUT_DIR = "dist/assets/js";

/**
 * Удаляет комментарии, не трогая их двойников внутри строк и регулярных
 * выражений: `"// не комментарий"` должно уцелеть.
 */
function stripComments(source) {
  let out = "";
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }

    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

const source = readFileSync(SRC, "utf8");
const min = stripComments(source)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .join("\n");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/hybrid.min.js`, min);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1);
console.log(
  `JS собран: hybrid.js ${kb(source)} КБ (читаемый), hybrid.min.js ${kb(min)} КБ (подключается)`
);
