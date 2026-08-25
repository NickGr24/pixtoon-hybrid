import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Кейсы берутся из cases.js, а не из файлов _data/cases/ напрямую: там
   считаются флаги наличия видео и карта кадров, и чтение сырого JSON
   лишило бы страницу и кнопки воспроизведения, и картинок. */
import cases from "./cases.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), "utf8"));

/**
 * Плоский список страниц кейсов: 5 проектов x 2 локали = 10 страниц.
 *
 * Eleventy умеет пагинировать только по одному измерению, поэтому пары
 * (кейс, локаль) разворачиваются здесь. Шаблон case.njk остаётся один.
 *
 * Здесь же собирается блок «Alte case studies» — четыре остальных кейса.
 * Список начинается со следующего по счёту и идёт по кругу: если бы он
 * всегда начинался с первого, подборка выглядела бы одинаково на всех
 * страницах, а порядок — случайным именно там, где кейс сам стоит первым.
 */
export default function () {
  const locales = [read("i18n/en.json"), read("i18n/ro.json")];
  const featured = cases.featured;

  const pages = [];

  for (const t of locales) {
    featured.forEach((c, i) => {
      const related = [];
      for (let step = 1; step < featured.length; step += 1) {
        const other = featured[(i + step) % featured.length];
        const content = other[t.locale] || other.en;
        related.push({
          slug: other.slug,
          title: content.title,
          brand: other.brand,
          thumb: other.shots.thumb,
        });
      }

      /* Поля локали разворачиваются в корень объекта намеренно: pagination
         отдаёт его шаблону под именем t, и тогда шапка с футером получают
         привычные t.dir / t.nav из layout без дополнительных проб. */
      pages.push({
        ...t,
        slug: c.slug,
        case: c,
        content: c[t.locale] || c.en,
        related,
      });
    });
  }

  return pages;
}
