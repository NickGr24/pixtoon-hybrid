import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), "utf8"));

/**
 * Плоский список страниц кейсов: 4 проекта x 2 локали = 8 страниц.
 *
 * Eleventy умеет пагинировать только по одному измерению, поэтому пары
 * (кейс, локаль) разворачиваются здесь. Шаблон case.njk остаётся один.
 * Заодно тут считается «следующий кейс» — навигация по кругу, чтобы со
 * страницы последнего проекта был путь дальше, а не тупик.
 */
export default function () {
  const cases = read("cases.json");
  const locales = [read("i18n/en.json"), read("i18n/ro.json")];
  const featured = cases.featured;

  const pages = [];

  for (const t of locales) {
    featured.forEach((c, i) => {
      const next = featured[(i + 1) % featured.length];

      /* Поля локали разворачиваются в корень объекта намеренно: pagination
         отдаёт его шаблону под именем t, и тогда шапка с футером получают
         привычные t.dir / t.nav из layout без дополнительных проб. */
      pages.push({
        ...t,
        slug: c.slug,
        case: c,
        content: c[t.locale] || c.en,
        next: { slug: next.slug, title: (next[t.locale] || next.en).title },
      });
    });
  }

  return pages;
}
