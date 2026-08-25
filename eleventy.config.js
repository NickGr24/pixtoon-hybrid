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
import { readFileSync, existsSync } from "node:fs";

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
  /*
    \u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u0441\u0442\u0440\u043E\u043A\u0438 \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0442\u0435\u043A\u0441\u0442\u0435 \u2014 \u044D\u0442\u043E \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u043D\u043E\u0441, \u0430 \u043D\u0435 \u043F\u0440\u043E\u0431\u0435\u043B.
    \u0421\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u043A\u0435\u0439\u0441\u043E\u0432 \u0434\u0435\u043B\u044F\u0442 \u043F\u043E\u0434\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0433\u0435\u0440\u043E\u044F \u0438 \u043A\u0440\u0443\u043F\u043D\u0443\u044E \u0444\u0440\u0430\u0437\u0443 \u043D\u0430\u0434\u0432\u043E\u0435 \u0440\u043E\u0432\u043D\u043E
    \u0442\u0430\u043C, \u0433\u0434\u0435 \u044D\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u043D\u043E \u0432 \u043C\u0430\u043A\u0435\u0442\u0435 (\u00ABAcelea\u0219i personaje. / Mai mult
    con\u021Binut.\u00BB), \u0430 \u043F\u043E\u043B\u0435 break \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u0435\u0436\u0434\u0443 \u043A\u0443\u0441\u043A\u0430\u043C\u0438 a \u0438 outline \u2014
    \u0432\u043D\u0443\u0442\u0440\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u043A\u0443\u0441\u043A\u0430 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C \u0431\u044B\u043B\u043E \u043D\u0435\u0447\u0435\u043C.
  */
  const bindOrphans = (text) =>
    String(text)
      .split("\n")
      .map((line) => {
        const words = line.split(/\s+/).filter(Boolean);
        return words.reduce((acc, word, i) =>
          i === 0
            ? word
            : acc + (/^\p{L}$/u.test(words[i - 1]) ? NBSP : " ") + word
        , "");
      })
      .join("<br>");

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

  /**
   * Набор для srcset по имени базового кадра.
   *
   * `{{ shot | srcset | safe }}` → `…/hero-400.jpg 400w, …/hero-800.jpg 800w,
   * …/hero.jpg 1600w`. Ширины уменьшенных копий берутся из имени файла, а
   * ширина базового — из его заголовка тем же читателем, что и dims.
   *
   * Копии перечисляются, только если они есть на диске: tools/crop-cases.mjs
   * не делает копию шире базы, и кадры вроде мозаичных плиток в 600 px
   * существуют без -800. Записанный вручную srcset обещал бы браузеру файл,
   * которого нет, и тот получил бы 404 вместо картинки.
   */
  const STEPS = [400, 800];

  eleventyConfig.addFilter("srcset", function (webPath) {
    if (!webPath) return "";

    const web = String(webPath);
    const stem = web.replace(/\.jpg$/, "");
    const entries = [];

    for (const step of STEPS) {
      if (existsSync("src" + stem + `-${step}.jpg`)) {
        entries.push(`${stem}-${step}.jpg ${step}w`);
      }
    }

    try {
      const size = readImageSize("src" + web);
      if (size) entries.push(`${web} ${size.w}w`);
    } catch {
      /* Базового файла нет — валидация слотов в cases.js уронит сборку
         раньше и с внятным сообщением; здесь молчим. */
    }

    return entries.join(", ");
  });

  /**
   * Префикс для набора в imagesrcset. HtmlBasePlugin знает про href, src и
   * srcset, но не про imagesrcset у <link rel="preload">, и на GitHub Pages
   * предзагрузка уходила в корень домена вместо подпапки.
   */
  eleventyConfig.addFilter("srcsetUrl", function (value) {
    if (!value) return "";
    const base = PATH_PREFIX === "/" ? "" : PATH_PREFIX.replace(/\/$/, "");
    return String(value)
      .split(",")
      .map((part) => {
        const tokens = part.trim().split(/\s+/);
        if (tokens[0].startsWith("/")) tokens[0] = base + tokens[0];
        return tokens.join(" ");
      })
      .join(", ");
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
