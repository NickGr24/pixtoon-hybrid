/**
 * Кадры, нарезанные из роликов кейсов.
 *
 *   node tools/reel-frames.mjs
 *
 * В отличие от tools/crop-cases.mjs, которому нужны присланные клиентом
 * исходники, здесь источники лежат в самом репозитории — это мастера кейсов
 * из `src/assets/img/cases/*.mp4`. Скрипт запускается на чистом клоне и даёт
 * ровно те же файлы, что закоммичены.
 *
 * Резать через ffmpeg, а не библиотекой: он и так стоит у всех, кто трогал
 * превью кейсов, и README уже отсылает к нему за уменьшенными копиями.
 *
 * Окно кадра задаётся явно, а не точкой интереса: роликов здесь два, слотов
 * шесть, и подбирать их всё равно приходится глазами по стоп-кадру.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const master = (name) => join(ROOT, "src/assets/img/cases", name);
const out = (dir) => join(ROOT, "src/assets/img", dir);

/**
 * Слот: из какого ролика, на какой секунде, каким окном и какой ширины.
 *
 * `crop` — окно в пикселях исходника: [ширина, высота, x, y].
 * `width` — ширина готового файла; уменьшенные копии считаются от неё.
 */
const SLOTS = [
  /* --- Microinvest: триптих и портреты ---------------------------------- */

  /*
    Ролик вертикальный 1080×1916, и плитки триптиха стоят в той же пропорции.
    Обрезать нечего — окно совпадает с кадром.

    Показывают не персонажей по отдельности (их показывает ряд портретов
    ниже), а сцены: ту же семью в кадре и крупный план.
  */
  { src: "microinvest-family.mp4", dir: "microinvest", name: "reel-scene", at: 13.5, crop: [1080, 1916, 0, 0], width: 900 },
  { src: "microinvest-family.mp4", dir: "microinvest", name: "reel-closeup", at: 10.2, crop: [1080, 1916, 0, 0], width: 900 },

  /* Портреты 3:4. Кот заменил четвёртый кадр с мамой: в ряду она уже есть
     первой, а кот — тот самый персонаж, которого в кейсе «привели» позже. */
  { src: "microinvest-family.mp4", dir: "microinvest", name: "pisica", at: 6.0, crop: [1080, 1440, 0, 380], width: 600 },

  /*
    Отец: окно от самого верха. Лицо у него в первой четверти кадра, и кроп
    по центру, который делает object-fit, срезал ему голову.

    Имя со словом «portret», а не просто `tatal`: файл `tatal.jpg` рядом —
    исходник шага процесса на странице кейса (см. CASES в crop-cases.mjs), и
    два рецепта на одно имя перезаписывали бы друг друга по очереди.
  */
  { src: "microinvest-family.mp4", dir: "microinvest", name: "tatal-portret", at: 17.5, crop: [1080, 1440, 0, 60], width: 600 },

  /* --- Drive Gas: кадр в карточке кастомного пакета --------------------- */

  /*
    Карточка кастомного пакета расколота кадром пополам, и высоту её колонки
    задаёт текст рядом — от 1.0 до 1.3 по пропорции. Прежний кадр был
    горизонтальный 16:10 с надписью «500 lei în puncte»: в почти квадратную
    колонку он влезал средней третью, разрезая и надпись, и лицо.

    Здесь окно почти квадратное и по центру — маскот. Такой кадр переживает
    любую пропорцию около единицы, а текста в нём нет вовсе.
  */
  { src: "drive-gas.mp4", dir: "drive-gas", name: "mascot", at: 45, crop: [1188, 1080, 732, 0], width: 900 },

  /*
    Слоты кейса Drive Gas.

    Оба раньше резались из одного файла ключевого арта — `post-33.png`, — и
    страница показывала одну и ту же композицию на белом дважды подряд:
    в блоке «Что мы построили» её верх, в первой карточке кампании её же
    середину. Здесь это два разных кадра ролика: механика промо календарём и
    сам маскот на станции.
  */
  { src: "drive-gas.mp4", dir: "cases/drive-gas", name: "brief", at: 14, crop: [1728, 1080, 96, 0], width: 1100 },
  { src: "drive-gas.mp4", dir: "cases/drive-gas", name: "card-1", at: 5, crop: [810, 1080, 250, 0], width: 810 },

  /* --- Berea Chișinău: карточки «Спот, кадр за кадром» ------------------ */

  /*
    Два слота из трёх режутся здесь, а не в tools/crop-cases.mjs: там
    исходником служат присланные клиентом скриншоты, а эти кадры клиент
    выбрал по самому ролику. Мастер лежит в репозитории, так что и рецепт
    честнее держать от него. Слот card-2 остался в crop-cases.mjs — его
    исходник тот же, что и у героя.

    Пропорция 3:5 — та же, что у R.tall в crop-cases.mjs: карточки кампании
    стоят в ряд, и слот, выпадающий из пропорции, ломает ряд.
  */
  { src: "bere-chisinau.mp4", dir: "cases/bere-chisinau", name: "card-1", at: 4.6, crop: [1080, 1800, 0, 60], width: 640 },
  { src: "bere-chisinau.mp4", dir: "cases/bere-chisinau", name: "card-3", at: 19.4, crop: [1080, 1800, 0, 60], width: 640 },
];

/* Уменьшенные копии для srcset. Список тот же, что в фильтре srcset. */
const STEPS = [400, 800];

const run = (args) => {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || `ffmpeg: ${args.join(" ")}`);
};

let made = 0;

for (const s of SLOTS) {
  const dir = out(s.dir);
  mkdirSync(dir, { recursive: true });

  const [cw, ch, cx, cy] = s.crop;

  /* Шире окна не растягиваем: апскейл добавит килобайты и ни одного пикселя
     резкости. Та же оговорка, что и в tools/crop-cases.mjs. */
  const base = Math.min(s.width, cw);

  /* -ss перед -i: перемотка по ключевым кадрам, иначе ffmpeg декодирует
     ролик с начала — минуту ради одного кадра. */
  const render = (file, width, q) =>
    run([
      "-v", "error",
      "-ss", String(s.at),
      "-i", master(s.src),
      "-frames:v", "1",
      "-vf", `crop=${cw}:${ch}:${cx}:${cy},scale=${width}:-2:flags=lanczos`,
      "-q:v", String(q),
      "-y", join(dir, file),
    ]);

  render(`${s.name}.jpg`, base, 3);
  made += 1;

  for (const step of STEPS) {
    if (step >= base) continue;
    render(`${s.name}-${step}.jpg`, step, 5);
    made += 1;
  }

  console.log(`${s.dir}/${s.name}: ${s.src} @${s.at}s, окно ${cw}×${ch} @${cx},${cy} → ${base}px`);
}

console.log(`\nГотово: ${made} файлов`);
