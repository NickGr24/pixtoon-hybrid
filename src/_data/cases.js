import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");

/**
 * Кейсы раздела Hybrid Production.
 *
 * Каждый кейс — свой файл в _data/cases/. Раньше все пять лежали в одном
 * casesData.json; после переноса страниц на макет в кейсе появилась ветка
 * page (герой, панель, секции, CTA) в двух локалях, и один файл вырос бы
 * почти до тысячи строк. README обещает «правку текста в JSON, не в
 * разметке» — по файлу на кейс это обещание остаётся выполнимым.
 *
 * Здесь же считается то, что нельзя записать руками, не соврав:
 *
 *   hasVideo / hasPreview — по факту наличия mp4 на диске. Записанные
 *   вручную флаги врали: комментарий обещал проверку при сборке, а на деле
 *   нужно было не забыть переставить false на true.
 *
 *   shots — карта «слот → путь к кадру», собранная обходом каталога
 *   assets/img/cases/<slug>/. Кадры нарезает tools/crop-cases.mjs.
 *
 * Два файла видео на кейс, а не один:
 *   <slug>-preview.mp4 — 6–10 секунд без звука, для наведения на карточку;
 *   <slug>.mp4         — полный ролик со звуком для страницы кейса.
 */

const casesDir = join(here, "cases");

const featured = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")))
  .sort((a, b) => a.order.localeCompare(b.order));

/** Веб-путь (/assets/...) → путь на диске внутри src/ */
const onDisk = (webPath) =>
  Boolean(webPath) && existsSync(join(srcRoot, webPath.replace(/^\//, "")));

for (const c of featured) {
  c.media.hasVideo = onDisk(c.media.video);
  c.media.hasPreview = onDisk(c.media.preview);

  /* Слоты кадров. Уменьшенные копии в карту не попадают: они адресуются не
     по имени, а через фильтр srcset — иначе каждый слот засветился бы в ней
     трижды и валидация ниже потеряла бы смысл.

     Ширины перечислены поимённо, а не как «дефис и цифры»: слоты сами
     кончаются номером (m-1, card-3, split-1), и общее правило вырезало бы
     их вместе с копиями. Список должен совпадать со STEPS в
     tools/crop-cases.mjs. */
  const shotsDir = join(srcRoot, "assets/img/cases", c.slug);
  c.shots = {};
  if (existsSync(shotsDir)) {
    for (const file of readdirSync(shotsDir)) {
      const m = file.match(/^(.+)\.jpg$/);
      if (!m || /-(400|800)$/.test(m[1])) continue;
      c.shots[m[1]] = `/assets/img/cases/${c.slug}/${file}`;
    }
  }

  /*
    Страница ссылается на слоты по имени, и опечатка в JSON дала бы молча
    битую картинку на живой странице. Дешевле уронить сборку здесь: имя
    слота и кейса видно сразу, а список доступных подсказывает, что имелось
    в виду.
  */
  for (const locale of ["en", "ro"]) {
    const page = c[locale]?.page;
    if (!page) continue;

    const used = ["hero", "thumb"];
    for (const s of page.sections || []) {
      if (s.slot) used.push(s.slot);
      for (const item of s.items || []) if (item.slot) used.push(item.slot);
      /* aside проверялся не с самого начала, и пропавший слот боковой плитки
         дошёл до страницы картинкой без адреса: секция перечисляет кадры в
         двух местах, а проверка смотрела в одно. */
      for (const item of s.aside || []) if (item.slot) used.push(item.slot);
      for (const slot of s.slots || []) used.push(slot);
    }

    for (const slot of used) {
      if (!c.shots[slot]) {
        throw new Error(
          `Кейс «${c.slug}» (${locale}) просит кадр «${slot}», которого нет в ` +
            `src/assets/img/cases/${c.slug}/. Есть: ${Object.keys(c.shots).join(", ") || "ни одного"}. ` +
            `Нарезать: node tools/crop-cases.mjs --only=${c.slug}`
        );
      }
    }
  }
}

export default { featured };
