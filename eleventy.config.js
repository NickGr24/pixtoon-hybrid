/**
 * Eleventy — инструмент разработки, а не зависимость прода.
 *
 * На выходе dist/ — плоский HTML + CSS + JS без следов сборщика. Именно этот
 * каталог передаётся разработчику Pixtoon для заведения в MODX: разметка
 * секций становится чанками, layout — шаблоном.
 *
 * Зачем генератор вообще: 10 страниц (лендинг + 4 кейса) x 2 языка растут из
 * двух шаблонов и трёх JSON. Правка шапки — одно место, а не десять.
 */

import { HtmlBasePlugin } from "@11ty/eleventy";

/*
  На GitHub Pages сайт живёт в подпапке /<repo>/, а все ссылки в шаблонах
  абсолютные (/assets/..., /hybrid-production/...). PATH_PREFIX подставляет
  префикс на этапе сборки, HtmlBasePlugin переписывает href/src в готовом HTML.

  Для боевой сборки под MODX переменная не задаётся — пути остаются
  корневыми, как и нужно на pixtoon.com.
*/
const PATH_PREFIX = process.env.PATH_PREFIX || "/";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);

  /*
    Демо-сборка на GitHub Pages содержит кадры ещё не опубликованных работ
    клиента, поэтому закрывается от поисковиков. В боевой сборке под MODX
    флаг выключен и noindex не попадает в HTML.
  */
  eleventyConfig.addGlobalData("isDemo", PATH_PREFIX !== "/");

  // CSS не копируется как есть — его склеивает build-css.mjs в один файл.
  // Иначе в dist уехали бы и модули, и собранный файл.
  eleventyConfig.addPassthroughCopy({ "src/assets/js": "assets/js" });
  // GitHub Pages иначе прогоняет вывод через Jekyll и выбрасывает файлы с _
  eleventyConfig.addPassthroughCopy({ "src/.nojekyll": ".nojekyll" });
  eleventyConfig.addPassthroughCopy({ "src/assets/img": "assets/img" });
  eleventyConfig.addWatchTarget("src/assets/");

  /*
    Односимвольное слово не имеет права остаться в конце строки — замечание
    клиента: «litera O nu poate fi așa în aer». Оно связывается со следующим
    словом неразрывным пробелом.

    Почему только односимвольные. В румынском полно двухбуквенных слов (ce,
    ai, de, la, pe, cu), и связывание их превратило бы «Tot ce ai nevoie» в
    одну неразрывную цепочку из четырнадцати символов, которая на 390px
    вылезает за экран. Лекарство оказалось бы хуже болезни.

    text-wrap: balance на .hyb-title эту задачу не решает и решать не может:
    он выравнивает длины строк, а одинокая буква в конце строки его цели не
    противоречит.
  */
  // Escape, а не литерал: невидимый U+00A0 в исходнике редактор способен
  // молча заменить обычным пробелом, и дефект вернётся, не оставив следа в дифе.
  const NBSP = "\u00A0";
  const bindOrphans = (text) => {
    const words = String(text).split(/\s+/).filter(Boolean);
    return words.reduce((acc, word, i) =>
      i === 0
        ? word
        : acc + (/^\p{L}$/u.test(words[i - 1]) ? NBSP : " ") + word
    , "");
  };

  /** Последнее слово куска — одинокая буква? Тогда и склейка кусков неразрывна. */
  const endsWithSingleLetter = (text) =>
    /(^|\s)\p{L}$/u.test(String(text).trim());

  /**
   * Заголовок с outline-словом — подпись Hybrid-линии.
   * Данные хранят {a, outline, b}, разметка собирается здесь, чтобы приём
   * нельзя было применить случайно дважды в одной секции.
   */
  eleventyConfig.addShortcode("title", function (t, tag = "h2", cls = "") {
    if (!t) return "";

    const parts = [];
    if (t.a)
      parts.push({
        html: `<span class="hyb-title__plain">${bindOrphans(t.a)}</span>`,
        raw: t.a,
      });
    if (t.outline)
      parts.push({
        html: `<span class="hyb-title__outline">${bindOrphans(t.outline)}</span>`,
        raw: t.outline,
      });
    if (t.b)
      parts.push({
        html: `<span class="hyb-title__plain">${bindOrphans(t.b)}</span>`,
        raw: t.b,
      });

    // Куски склеиваются пробелом, кроме двух случаев: следующий начинается со
    // знака препинания (иначе «rezultatul , nu toolul»), либо предыдущий
    // кончается одинокой буквой — тогда неразрывным.
    const html = parts.reduce((acc, part, i) => {
      if (i === 0) return part.html;
      if (/^<span[^>]*>[,.;:!?]/.test(part.html)) return acc + part.html;
      const glue = endsWithSingleLetter(parts[i - 1].raw) ? NBSP : " ";
      return acc + glue + part.html;
    }, "");

    return `<${tag} class="hyb-title ${cls}">${html}</${tag}>`;
  });

  /** Ссылка внутри текущей локали: /hybrid-production/ или /ro/hybrid-production/ */
  eleventyConfig.addFilter("localeUrl", function (path, t) {
    const base = t.dir === "/" ? "/" : t.dir;
    return (base + String(path).replace(/^\//, "")).replace(/\/{2,}/g, "/");
  });

  /** Локализованная ветка кейса: c | loc("ro") -> объект с title/tags/... */
  eleventyConfig.addFilter("loc", (item, locale) => item[locale] || item.en);

  return {
    pathPrefix: PATH_PREFIX,
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
  };
}
