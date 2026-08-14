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

  /*
    В демо-сборке существует только раздел Hybrid Production, поэтому остальные
    пункты навигации ведут на живой pixtoon.com — иначе это четыре ссылки в 404.
    В боевой сборке база пустая и ссылки остаются относительными.
  */
  eleventyConfig.addGlobalData(
    "externalBase",
    PATH_PREFIX !== "/" ? "https://pixtoon.com" : ""
  );
  // CSS не копируется как есть — его склеивает build-css.mjs в один файл.
  // Иначе в dist уехали бы и модули, и собранный файл.
  eleventyConfig.addPassthroughCopy({ "src/assets/js": "assets/js" });
  // GitHub Pages иначе прогоняет вывод через Jekyll и выбрасывает файлы с _
  eleventyConfig.addPassthroughCopy({ "src/.nojekyll": ".nojekyll" });
  eleventyConfig.addPassthroughCopy({ "src/assets/img": "assets/img" });
  eleventyConfig.addWatchTarget("src/assets/");

  /**
   * Заголовок с outline-словом — подпись Hybrid-линии.
   * Данные хранят {a, outline, b}, разметка собирается здесь, чтобы приём
   * нельзя было применить случайно дважды в одной секции.
   */
  eleventyConfig.addShortcode("title", function (t, tag = "h2", cls = "") {
    if (!t) return "";

    const parts = [];
    if (t.a) parts.push(`<span class="hyb-title__plain">${t.a}</span>`);
    if (t.outline)
      parts.push(`<span class="hyb-title__outline">${t.outline}</span>`);
    if (t.b) parts.push(`<span class="hyb-title__plain">${t.b}</span>`);

    // Куски склеиваются пробелом, кроме случая, когда следующий начинается со
    // знака препинания: иначе «rezultatul , nu toolul» вместо «rezultatul, nu».
    const html = parts.reduce((acc, part, i) => {
      if (i === 0) return part;
      const startsWithPunctuation = /^<span[^>]*>[,.;:!?]/.test(part);
      return acc + (startsWithPunctuation ? "" : " ") + part;
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
