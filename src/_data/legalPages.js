import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), "utf8"));

/**
 * Плоский список юридических страниц: 3 документа x 2 локали = 6 страниц.
 *
 * Устроено как casePages.js: Eleventy пагинирует по одному измерению, поэтому
 * пары (документ, локаль) разворачиваются здесь, а шаблон legal.njk остаётся
 * один. Документы читаются из _data/legal/*.json — каждый несёт обе локали
 * и свои адреса в каждой из них: румынские адреса взяты из названий
 * документов клиента, английские — переведены.
 *
 * Тексты документов ссылаются друг на друга («Politica de confidențialitate»,
 * «Politica privind cookie-urile»). В JSON эти ссылки записаны плейсхолдерами
 * {privacy}, {cookies}, {terms}, а не адресами: адрес зависит от локали, и
 * записанный руками он разошёлся бы в шести местах при первом же
 * переименовании. Подстановка идёт здесь, по всему содержимому сразу.
 */
export default function () {
  const locales = [read("i18n/en.json"), read("i18n/ro.json")];

  const docs = readdirSync(join(here, "legal"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => read(join("legal", f)))
    .sort((a, b) => a.order - b.order);

  const pages = [];

  for (const t of locales) {
    /* Адреса всех документов в текущей локали — для плейсхолдеров в тексте
       и для карточек «другие документы» внизу страницы. */
    const urls = {};
    for (const d of docs) urls[d.key] = t.dir + d.paths[t.locale];

    for (const d of docs) {
      const content = d[t.locale] || d.en;
      const resolved = JSON.parse(
        JSON.stringify(content).replace(/\{(privacy|cookies|terms)\}/g, (m, key) => urls[key])
      );

      const related = docs
        .filter((o) => o.key !== d.key)
        .map((o) => {
          const oc = o[t.locale] || o.en;
          return { key: o.key, url: urls[o.key], title: oc.navTitle, text: oc.meta.description };
        });

      /* Поля локали разворачиваются в корень объекта, как у кейсов: pagination
         отдаёт его шаблону под именем t, и шапка с футером получают привычные
         t.dir / t.nav из layout без дополнительных проб. */
      pages.push({
        ...t,
        key: d.key,
        url: urls[d.key],
        altUrl: t.otherLocale.dir + d.paths[t.otherLocale.code],
        doc: resolved,
        related,
      });
    }
  }

  return pages;
}
