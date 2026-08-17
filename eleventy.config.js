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
import { readFileSync } from "node:fs";

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
   *
   * Необязательное поле `break: true` переносит строку после первого куска.
   * В макете такой перенос проставлен вручную почти во всех заголовках
   * раздела: смысловое деление фразы там важнее ровности строк, и доверить
   * его ширине контейнера нельзя — на другой ширине оно распадётся.
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

    // Куски склеиваются пробелом, кроме трёх случаев: после первого куска
    // стоит запрошенный перенос; следующий начинается со знака препинания
    // (иначе «rezultatul , nu toolul»); предыдущий кончается одинокой буквой
    // — тогда неразрывным.
    const html = parts.reduce((acc, part, i) => {
      if (i === 0) return part.html;
      if (i === 1 && t.break) return acc + "<br>" + part.html;
      if (/^<span[^>]*>[,.;:!?]/.test(part.html)) return acc + part.html;
      const glue = endsWithSingleLetter(parts[i - 1].raw) ? NBSP : " ";
      return acc + glue + part.html;
    }, "");

    return `<${tag} class="hyb-title ${cls}">${html}</${tag}>`;
  });

  /*
    Размеры картинки читаются из заголовка файла и подставляются в разметку
    атрибутами width/height. Без них браузер не знает пропорций до загрузки и
    сдвигает вёрстку, когда картинка приезжает, — Lighthouse считает это
    отдельным дефектом даже при нулевом CLS.

    Заголовок разбирается вручную, а не библиотекой: нужны два числа из
    первых байт, и ради них тянуть sharp в зависимости прода незачем.
    Результат кэшируется — одна и та же картинка встречается в двадцати
    страницах, а файл меняется только между сборками.
  */
  const sizeCache = new Map();

  function readImageSize(file) {
    const buf = readFileSync(file);

    /* PNG: ширина и высота лежат в IHDR, сразу после восьмибайтовой сигнатуры */
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }

    /* JPEG: идём по сегментам до маркера SOF, в нём размеры кадра. Маркеры
       C4/C8/CC — это таблицы Хаффмана и арифметики, не кадр, их пропускаем. */
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) {
          off += 1;
          continue;
        }
        const marker = buf[off + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          off += 2;
          continue;
        }
        const len = buf.readUInt16BE(off + 2);
        const isFrame =
          marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isFrame) return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
        off += 2 + len;
      }
    }

    return null;
  }

  /** `{{ "/assets/img/x.jpg" | dims | safe }}` → `width="1600" height="900"` */
  eleventyConfig.addFilter("dims", function (webPath) {
    if (!webPath) return "";
    if (sizeCache.has(webPath)) return sizeCache.get(webPath);

    let attrs = "";
    try {
      const size = readImageSize("src" + String(webPath).replace(/^(?!\/)/, "/"));
      if (size) attrs = `width="${size.w}" height="${size.h}"`;
    } catch {
      /* Файла нет — молча пропускаем: сборка не должна падать из-за атрибута,
         а отсутствующая картинка и без того видна в проверке ссылок. */
    }

    sizeCache.set(webPath, attrs);
    return attrs;
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
