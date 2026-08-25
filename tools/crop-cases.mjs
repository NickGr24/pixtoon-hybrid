/**
 * Нарезка кадров для страниц кейсов.
 *
 * Исходники — скриншоты кадров из роликов, присланные клиентом в Telegram
 * (`Captură de ecran din 2026-08-13 la *.png`, 25 файлов), и две HQ-раскладки
 * макета. В репозиторий они не кладутся: 25 файлов по 2–9 МБ, а нужны из них
 * прямоугольники. Коммитятся результаты, а этот скрипт — рецепт, по которому
 * их можно получить заново.
 *
 *   node tools/crop-cases.mjs                     # исходники из Telegram Desktop
 *   node tools/crop-cases.mjs --src=/путь/к/папке
 *   node tools/crop-cases.mjs --only=drive-gas
 *
 * Резать через ffmpeg, а не библиотекой: он и так стоит у всех, кто трогал
 * превью кейсов, и README уже отсылает к нему за уменьшенными копиями. Любая
 * npm-зависимость здесь попала бы в дерево проекта, который уезжает в MODX.
 *
 * Прямоугольники не выписаны руками. У слота есть пропорция и точка интереса
 * (доли ширины и высоты), а рамку считает computeCrop: из кадра берётся
 * наибольший прямоугольник нужной пропорции, сдвинутый так, чтобы точка
 * интереса оказалась в центре, насколько позволяют края. Сорок рукописных
 * четвёрок чисел разъехались бы при первой же замене исходника.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = join(ROOT, "src/assets/img/cases");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SRC_DIR = arg("src", join(homedir(), "Downloads/Telegram Desktop"));
const ONLY = arg("only", null);

/* ------------------------------------------------------------------ */
/* Исходники                                                           */
/* ------------------------------------------------------------------ */

/**
 * Скриншоты кадров лежат под именами с временем съёмки, а не с названием
 * кейса. Порядок сортировки совпадает с порядком отправки, поэтому номер
 * кадра — устойчивый адрес: shot(25) это «500 lei în puncte» Drive Gas.
 */
let shotsCache = null;
function shot(n) {
  if (!shotsCache) {
    shotsCache = readdirSync(SRC_DIR)
      .filter((f) => /^Captur.* 2026-08-13 la .*\.png$/.test(f))
      .sort()
      .map((f) => join(SRC_DIR, f));
    if (shotsCache.length !== 25) {
      throw new Error(
        `Ожидалось 25 кадров в ${SRC_DIR}, найдено ${shotsCache.length}. ` +
          `Укажите папку через --src=`
      );
    }
  }
  return shotsCache[n - 1];
}

/** Кадр, уже лежащий в репозитории (у Microinvest своего исходника нет). */
const repo = (p) => join(ROOT, "src/assets/img", p);

/* ------------------------------------------------------------------ */
/* Пропорции слотов — сняты с макетов, см. spec                        */
/* ------------------------------------------------------------------ */

const R = {
  wide: 16 / 9, //  герой, картинка split, карточки кампаний
  portrait: 9 / 16, //  герой, когда весь материал кейса вертикальный
  land: 16 / 10, //  кадр рассказа, превью «Alte case studies», карточка абонемента
  photo: 3 / 4, //  картинка рассказа, когда материал вертикальный
  tall: 3 / 5, //  вертикальная карточка кампании

  /*
    Пропорции ниже подобраны под реальный материал, а не срисованы с
    раскладки. У клиента под каждый слот был свой кадр; у нас исходники
    Microinvest вертикальные (600x1075), и голова занимает в них 54% высоты.
    Слот 4:3 отдаёт под кадр 42% — макушка срезалась не из-за промаха в
    фокусе, а потому что не помещалась в принципе.
  */
  person: 4 / 5, //  карточка персонажа: 70% высоты портрета — голова и плечи
  step: 1, //  шаг процесса: квадрат вмещает голову любого из наших портретов
  strip: 4 / 3, //  боковая плитка секции персонажей
};

/* ------------------------------------------------------------------ */
/* Таблица: кейс → слот → кадр                                         */
/* ------------------------------------------------------------------ */

/*
  У кадров Doctor Buba внизу выжжены субтитры («Eu sunt Doctor BUBA»).
  trim снимает нижнюю долю кадра ДО расчёта рамки, иначе любой вертикальный
  слот утащил бы надпись внутрь.
*/
const CASES = {
  /*
    Значения top сняты по кадру с процентной сеткой, а не подобраны на глаз.
    У портретов Microinvest голова занимает: мама 3–57%, отец 5–92% (в рост),
    дочь 12–48%, мама на кухне 20–45%.
  */
  "microinvest-family": {
    thumb: { src: repo("cases/microinvest-family.jpg"), r: R.land, w: 640, focus: [0.5, 0], top: 0.32 },
    /* Панорама 2.9:1 из раскладки брала от вертикального кадра 19% высоты и
       резала сцену по пояс. 16:9 берёт 31% — стол с персонажами целиком. */
    hero: { src: repo("cases/microinvest-family.jpg"), r: R.wide, w: 1600, focus: [0.5, 0], top: 0.32 },
    story: { src: repo("cases/microinvest-family.jpg"), r: R.land, w: 1100, focus: [0.5, 0], top: 0.3 },

    "step-1": { src: repo("microinvest/tatal.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.03 },
    "step-2": { src: repo("microinvest/mama.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.01 },
    "step-3": { src: repo("microinvest/mama-bucatarie.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.15 },
    "step-4": { src: repo("microinvest/fiica.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.08 },
    "step-5": { src: repo("cases/microinvest-family.jpg"), r: R.step, w: 800, focus: [0.5, 0], top: 0.28 },

    "person-1": { src: repo("microinvest/mama.jpg"), r: R.person, w: 600, focus: [0.5, 0], top: 0 },
    "person-2": { src: repo("microinvest/tatal.jpg"), r: R.person, w: 600, focus: [0.5, 0], top: 0.02 },

    "strip-1": { src: repo("microinvest/fiica.jpg"), r: R.strip, w: 800, focus: [0.5, 0], top: 0.08 },
  },

  "drive-gas": {
    thumb: { src: shot(25), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: shot(25), r: R.wide, w: 1600, focus: [0.5, 0.5] },
    story: { src: shot(24), r: R.land, w: 1100, focus: [0.5, 0.5] },
    "card-1": { src: shot(23), r: R.wide, w: 840, focus: [0.5, 0.5] },
    "card-2": { src: shot(22), r: R.wide, w: 840, focus: [0.5, 0.5] },
    /* Тот же кадр, что и в герое. Приближение мягче прежнего 0.6: на нём
       надпись «500 lei» разрезалась пополам и читалась как брак. */
    /* Только персонаж, без надписи: любая рамка, задевающая «500 lei»,
       разрезает цифры и читается как брак. */
    "card-3": { src: shot(25), r: R.wide, w: 840, focus: [0.79, 0.5], zoom: 0.5 },
  },

  "medpark-doctor-buba": {
    thumb: { src: shot(18), r: R.land, w: 640, focus: [0.5, 0], top: 0, trim: 0.14 },
    hero: { src: shot(18), r: R.wide, w: 1600, focus: [0.5, 0.5], trim: 0.14 },
    story: { src: shot(15), r: R.land, w: 1100, focus: [0.5, 0], top: 0, trim: 0.14 },
    pack: { src: shot(18), r: R.land, w: 1200, focus: [0.5, 0], top: 0, trim: 0.14 },

    /* Исходники горизонтальные, поэтому 4:5 берёт всю доступную высоту и
       голова помещается целиком — двигать нужно только по горизонтали. */
    "person-1": { src: shot(12), r: R.person, w: 800, focus: [0.52, 0.5], trim: 0.14 },
    "person-2": { src: shot(13), r: R.person, w: 800, focus: [0.46, 0.5], trim: 0.14 },

    "strip-1": { src: shot(17), r: R.strip, w: 800, focus: [0.48, 0.5] },
    "strip-2": { src: shot(16), r: R.strip, w: 800, focus: [0.42, 0.5] },
  },

  coccolino: {
    thumb: { src: shot(21), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: shot(21), r: R.wide, w: 1600, focus: [0.5, 0.5] },
    story: { src: shot(19), r: R.land, w: 1100, focus: [0.45, 0.5] },
    pack: { src: shot(19), r: R.land, w: 1200, focus: [0.42, 0.5] },
    /* Три исходника на четыре слота: карточки берут те же кадры другой
       рамкой. Разный кроп читается как разный кадр, повтор целого — нет. */
    "card-1": { src: shot(21), r: R.wide, w: 840, focus: [0.68, 0.5], zoom: 0.72 },
    "card-2": { src: shot(19), r: R.wide, w: 840, focus: [0.4, 0.5], zoom: 0.8 },
    "card-3": { src: shot(20), r: R.wide, w: 840, focus: [0.5, 0.5] },
  },

  "bere-chisinau": {
    /* Весь материал кейса вертикальный, поэтому герой остаётся портретным:
       горизонтальная обрезка оставила бы от бутылки поясок в середине. */
    thumb: { src: shot(10), r: R.land, w: 640, focus: [0.5, 0], top: 0.2 },
    hero: { src: shot(10), r: R.portrait, w: 900, focus: [0.5, 0.5] },
    story: { src: shot(9), r: R.photo, w: 900, focus: [0.5, 0], top: 0.14 },
    "card-1": { src: shot(8), r: R.tall, w: 640, focus: [0.44, 0], top: 0.3, zoom: 0.52 },
    "card-2": { src: shot(10), r: R.tall, w: 640, focus: [0.55, 0], top: 0.1, zoom: 0.88 },
    "card-3": { src: shot(9), r: R.tall, w: 640, focus: [0.5, 0.45] },
  },
};

/* ------------------------------------------------------------------ */
/* Расчёт рамки и запуск ffmpeg                                        */
/* ------------------------------------------------------------------ */

/**
 * Наибольший прямоугольник пропорции `ratio`, помещающийся в кадр и
 * сдвинутый к точке интереса.
 */
function computeCrop(sw, sh, ratio, [fx, fy], trim = 0, zoom = 1, top = null) {
  const usableH = Math.round(sh * (1 - trim));

  let cw = Math.min(sw, usableH * ratio);
  let ch = cw / ratio;
  if (ch > usableH) {
    ch = usableH;
    cw = ch * ratio;
  }
  /* zoom < 1 берёт часть кадра вместо всего: несколько слотов на странице
     смотрят на один и тот же кадр, и без разного приближения они читаются
     как один повторённый снимок, а не как разные планы. */
  cw = Math.round(cw * zoom);
  ch = Math.round(ch * zoom);

  const clamp = (v, max) => Math.max(0, Math.min(Math.round(v), max));

  /*
    top задаёт верхнюю границу рамки долей высоты, вместо того чтобы
    центрировать её по точке интереса. Для портретов это единственный
    надёжный способ: голова начинается на известной высоте, и «прижать
    рамку сюда» проверяется глазом по кадру, а точка интереса требует
    пересчёта при каждой смене пропорции.
  */
  const y = top === null ? fy * usableH - ch / 2 : top * usableH;

  return {
    w: cw,
    h: ch,
    x: clamp(fx * sw - cw / 2, sw - cw),
    y: clamp(y, usableH - ch),
  };
}

function probeSize(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-of", "csv=p=0", file],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ffprobe не смог прочитать ${file}\n${r.stderr}`);
  const [w, h] = r.stdout.trim().split(",").map(Number);
  return { w, h };
}

function render(src, out, crop, width, quality) {
  const vf =
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` +
    `scale=${width}:-2:flags=lanczos,format=yuv420p`;
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", src, "-vf", vf, "-q:v", String(quality), out],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ffmpeg упал на ${out}\n${r.stderr}`);
}

/* Уменьшенные копии для srcset. Копия делается, только если она реально
   мельче базы: иначе в srcset попал бы апскейл, который телефон честно
   скачает вместо того, чтобы сэкономить. */
const STEPS = [400, 800];

let made = 0;
for (const [slug, slots] of Object.entries(CASES)) {
  if (ONLY && slug !== ONLY) continue;

  const dir = join(OUT_ROOT, slug);
  mkdirSync(dir, { recursive: true });

  for (const [slot, s] of Object.entries(slots)) {
    if (!existsSync(s.src)) throw new Error(`Нет исходника: ${s.src}`);

    const { w: sw, h: sh } = probeSize(s.src);
    const crop = computeCrop(sw, sh, s.r, s.focus, s.trim, s.zoom, s.top ?? null);

    /* Ширину слота не раздуваем сверх того, что есть в исходнике: апскейл
       добавит килобайты и ни одного пикселя резкости. */
    const base = Math.min(s.w, crop.w);

    render(s.src, join(dir, `${slot}.jpg`), crop, base, 3);
    made += 1;

    for (const step of STEPS) {
      if (step >= base) continue;
      render(s.src, join(dir, `${slot}-${step}.jpg`), crop, step, 5);
      made += 1;
    }

    console.log(
      `${slug}/${slot}: ${sw}x${sh} → crop ${crop.w}x${crop.h} @${crop.x},${crop.y} → ${base}px`
    );
  }
}

console.log(`\nГотово: ${made} файлов в src/assets/img/cases/<slug>/`);
