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
  wide: 16 / 9, //  картинка split, карточки кампаний
  portrait: 9 / 16, //  герой сбоку, когда весь материал кейса вертикальный
  land: 16 / 10, //  превью в «Alte case studies»
  photo: 3 / 4, //  картинка split, когда материал вертикальный
  tall: 3 / 5, //  вертикальная карточка кампании

  /* Обмер второй раскладки клиента (pagina test.png, 864 px): контент 750,
     то есть масштаб к контейнеру 1280 равен 1.71. Пропорции ниже сняты по
     нему и округлены до второго знака. */
  pano: 2.9, //  панорамный герой
  story: 2.2, //  кадр рядом с рассказом о кейсе
  step: 4 / 3, //  шаг процесса
  /* В раскладке карточка персонажа 8:5, но наши портреты вертикальные, и
     при 1.6 голова обрезается ровно по линии бровей — читается как дефект.
     4:3 показывает лицо целиком; карточка выходит чуть выше макетной. */
  person: 4 / 3, //  карточка персонажа с подписью под ней
  strip: 2.4, //  боковая плитка у секции персонажей
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
  "microinvest-family": {
    /* Единственный кейс без своих скриншотов: исходники уже в репозитории
       после прошлой сборки. Они мельче остальных — отсюда потолок ширины. */
    thumb: { src: repo("cases/microinvest-family.jpg"), r: R.land, w: 640, focus: [0.5, 0.55] },
    hero: { src: repo("cases/microinvest-family.jpg"), r: R.pano, w: 1600, focus: [0.5, 0.52] },

    /* ЗАГЛУШКА. В раскладке здесь кадр со всеми тремя персонажами разом;
       такого исходника нет ни в одном присланном наборе. */
    "story-1": { src: repo("cases/microinvest-family.jpg"), r: R.story, w: 1100, focus: [0.5, 0.5] },

    /* ЗАГЛУШКА. Шаг 01 — контурный скетч семьи, производственный материал.
       Заменить: положить скетч и перенарезать --only=microinvest-family. */
    "step-1": { src: repo("microinvest/tatal.jpg"), r: R.step, w: 520, focus: [0.5, 0.28] },
    "step-2": { src: repo("microinvest/mama.jpg"), r: R.step, w: 520, focus: [0.5, 0.36] },
    "step-3": { src: repo("microinvest/mama-bucatarie.jpg"), r: R.step, w: 520, focus: [0.5, 0.22] },
    "step-4": { src: repo("microinvest/fiica.jpg"), r: R.step, w: 520, focus: [0.5, 0.4] },
    "step-5": { src: repo("cases/microinvest-family.jpg"), r: R.step, w: 520, focus: [0.5, 0.52] },

    "person-1": { src: repo("microinvest/mama.jpg"), r: R.person, w: 800, focus: [0.5, 0.34] },
    "person-2": { src: repo("microinvest/tatal.jpg"), r: R.person, w: 800, focus: [0.5, 0.24] },

    /* Вторая плитка «Detaliu producție» из раскладки убрана по решению
       клиента: там был wireframe поверх модели, а такого материала нет. */
    "strip-1": { src: repo("microinvest/fiica.jpg"), r: R.strip, w: 900, focus: [0.5, 0.34] },
  },

  "drive-gas": {
    thumb: { src: shot(25), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: shot(25), r: R.pano, w: 1600, focus: [0.5, 0.48] },
    "story-1": { src: shot(24), r: R.story, w: 1100, focus: [0.5, 0.5] },
    "card-1": { src: shot(23), r: R.wide, w: 840, focus: [0.5, 0.5] },
    "card-2": { src: shot(22), r: R.wide, w: 840, focus: [0.5, 0.5] },
    /* Тот же кадр, что и в герое, — так в макете. Крупный план на персонаже
       отличает карточку от героя, стоящего двумя экранами выше. */
    "card-3": { src: shot(25), r: R.wide, w: 840, focus: [0.68, 0.5], zoom: 0.6 },
  },

  "medpark-doctor-buba": {
    thumb: { src: shot(18), r: R.land, w: 640, focus: [0.5, 0.42], trim: 0.14 },
    hero: { src: shot(18), r: R.pano, w: 1600, focus: [0.5, 0.46], trim: 0.17 },
    "story-1": { src: shot(15), r: R.story, w: 1100, focus: [0.5, 0.46], trim: 0.14 },

    /* Карточка абонемента на лендинге. Раньше там стоял скриншот интерфейса
       YouTube — тёмная панель браузера вместо кадра из работы. */
    pack: { src: shot(18), r: R.land, w: 1200, focus: [0.5, 0.44], trim: 0.14 },

    "person-1": { src: shot(12), r: R.person, w: 800, focus: [0.52, 0.42], trim: 0.14 },
    "person-2": { src: shot(13), r: R.person, w: 800, focus: [0.46, 0.4], trim: 0.14 },

    "strip-1": { src: shot(17), r: R.strip, w: 900, focus: [0.48, 0.44] },
    "strip-2": { src: shot(16), r: R.strip, w: 900, focus: [0.44, 0.46] },
  },

  coccolino: {
    thumb: { src: shot(21), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: shot(21), r: R.pano, w: 1600, focus: [0.5, 0.52] },
    "story-1": { src: shot(19), r: R.story, w: 1100, focus: [0.45, 0.5] },
    /* Карточка абонемента: медведь крупно выразительнее баннера с текстом —
       блок называется «контент с персонажем». */
    pack: { src: shot(19), r: R.land, w: 1200, focus: [0.42, 0.44] },
    /* Три исходника на несколько слотов: карточки берут те же кадры другой
       рамкой. Разный кроп читается как разный кадр, повтор целого — нет. */
    "card-1": { src: shot(21), r: R.wide, w: 840, focus: [0.72, 0.55], zoom: 0.55 },
    "card-2": { src: shot(19), r: R.wide, w: 840, focus: [0.36, 0.42], zoom: 0.6 },
    "card-3": { src: shot(20), r: R.wide, w: 840, focus: [0.5, 0.5] },
  },

  "bere-chisinau": {
    /* Весь материал кейса вертикальный, поэтому герой остаётся портретным:
       панорамная обрезка 2.9 из кадра 1104x1990 оставила бы от бутылки
       поясок в середине. Мета у портретного героя идёт сбоку, а не под
       кадром. */
    thumb: { src: shot(10), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: shot(10), r: R.portrait, w: 900, focus: [0.5, 0.5] },
    "story-1": { src: shot(9), r: R.photo, w: 900, focus: [0.5, 0.52] },
    "card-1": { src: shot(8), r: R.tall, w: 640, focus: [0.44, 0.56], zoom: 0.52 },
    "card-2": { src: shot(10), r: R.tall, w: 640, focus: [0.66, 0.46], zoom: 0.72 },
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
function computeCrop(sw, sh, ratio, [fx, fy], trim = 0, zoom = 1) {
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
  return {
    w: cw,
    h: ch,
    x: clamp(fx * sw - cw / 2, sw - cw),
    y: clamp(fy * usableH - ch / 2, usableH - ch),
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
    const crop = computeCrop(sw, sh, s.r, s.focus, s.trim, s.zoom);

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
