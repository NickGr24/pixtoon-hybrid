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

/* Пакет клиента «wep pagy hibrid» от 29.08.2026: посты кампаний, листы
   персонажей, снимки продакшена. Путь с пробелом на конце — так в архиве. */
const PKG_DIR = arg("pkg", join(homedir(), "Downloads/wep pagy hibrid "));

/* Мастера роликов — там же, где их берёт encode-videos.mjs. Кадр героя
   вырезается из самого ролика, а не из отдельной картинки. */
const MASTER_DIR = arg("masters", join(homedir(), "Downloads"));

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

/**
 * Кадр мастера по времени: `frame("REEL 2 MICROINVEST.mp4", 1)`.
 *
 * Раньше герой и превью Microinvest резались из афиши кампании, лежащей в
 * репозитории, — постер играющего ролика показывал не тот ролик. Здесь
 * источник и постер по определению совпадают.
 *
 * ffmpeg читает видео тем же вызовом, что и картинку, поэтому вся разница —
 * в `-ss` перед `-i`; за это отвечает поле `at`.
 */
const frame = (name, at) => ({ file: join(MASTER_DIR, name), at });

/**
 * Файл из пакета клиента — по его собственному имени из архива, с пробелами
 * и заглавными как есть. Переименовать было бы приятнее, но тогда рецепт
 * перестал бы совпадать с тем, что лежит в присланном zip, и следующая
 * поставка потребовала бы сверять два списка имён вместо одного.
 */
const pkg = (rel) => join(PKG_DIR, rel);

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
    Две пропорции ниже подобраны под реальный материал, а не срисованы с
    раскладки: исходники шагов процесса у Microinvest вертикальные
    (600x1075), и голова занимает в них 54% высоты — прямоугольный слот
    срезал бы макушку не из-за промаха в фокусе, а потому что она в него не
    помещается.
  */
  step: 1, //  шаг процесса: квадрат вмещает голову любого из наших портретов
  strip: 4 / 3, //  кадр 4:3 — снимок площадки, афиша кампании
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
    /*
      Кадр на первой секунде ролика: мама с дочерью за столом и кот на стуле.
      Кот здесь не случайность — кейс говорит «Am introdus un motan», и это
      единственный кадр, где новый персонаж виден вместе со старыми.

      Герой берёт кадр целиком (9:16), а не режет его: мастер вертикальный,
      и горизонтальная рамка оставила бы от кухни полосу.
    */
    thumb: { src: frame("REEL 2 MICROINVEST.mp4", 1), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: frame("REEL 2 MICROINVEST.mp4", 1), r: R.portrait, w: 900, focus: [0.5, 0.5] },

    "step-1": { src: repo("microinvest/tatal.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.03 },
    "step-2": { src: repo("microinvest/mama.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.01 },
    "step-3": { src: repo("microinvest/mama-bucatarie.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.15 },
    "step-4": { src: repo("microinvest/fiica.jpg"), r: R.step, w: 600, focus: [0.5, 0], top: 0.08 },
    "step-5": { src: frame("REEL 2 MICROINVEST.mp4", 1), r: R.step, w: 800, focus: [0.5, 0], top: 0.28 },


    /*
      Четыре turnaround-листа из пакета: отец, мать, дочь и кот, добавленный
      в новом этапе кампании. Исходники ровно 16:9 (1672x941), поэтому режем
      их не по содержимому, а только по размеру — шесть ракурсов в ряду
      нельзя тронуть рамкой, не потеряв половину.
    */
    "sheet-1": { src: pkg("MICROINVEST/characters9.png"), r: R.wide, w: 900, focus: [0.5, 0.5] },
    "sheet-2": { src: pkg("MICROINVEST/characters10.png"), r: R.wide, w: 900, focus: [0.5, 0.5] },
    "sheet-3": { src: pkg("MICROINVEST/characters11.png"), r: R.wide, w: 900, focus: [0.5, 0.5] },
    "sheet-4": { src: pkg("MICROINVEST/characters12.png"), r: R.wide, w: 900, focus: [0.5, 0.5] },

    /* Снимок сцены в 3D-пакете: сетка, панели, таймлайн. Кейс утверждает,
       что семью строили руками задолго до генеративных инструментов, и это
       единственный кадр, который утверждение показывает, а не повторяет. */
    craft: { src: pkg("MICROINVEST/post 3D clasic.jpg"), r: R.wide, w: 1100, focus: [0.5, 0.5] },

    green: { src: pkg("MICROINVEST/AFTERMOVIE .png"), r: R.strip, w: 1100, focus: [0.5, 0.5] },
  },

  /*
    Карточки кампании больше не кадры из ролика, а три реальные публикации
    из пакета: ключевой арт, сеть станций, заправка. Пропорция 3:4 у всех
    трёх, потому что ряд плиток берёт высоту из файла: смешай 3:4 и 16:10 —
    и низ у карточек разъедется.
  */
  "drive-gas": {
    thumb: { src: shot(25), r: R.land, w: 640, focus: [0.5, 0.5] },
    hero: { src: shot(25), r: R.wide, w: 1600, focus: [0.5, 0.5] },
    story: { src: shot(24), r: R.land, w: 1100, focus: [0.5, 0.5] },

    /* brief и card-1 режутся из ролика — tools/reel-frames.mjs. Оба брались
       из одного `post-33.png`, и страница дважды показывала одну композицию
       на белом: сначала её верх, потом середину. */
    /* Аэросъёмка вертикальная (3072x5504): 3:4 берёт 74% высоты, и top
       поднимает рамку так, чтобы станция стояла в середине, а не тонула
       между небом и передним планом дороги. */
    "card-2": { src: pkg("DRIVE GAS/post10.jpg"), r: R.photo, w: 840, focus: [0.5, 0], top: 0.08 },
    "card-3": { src: pkg("DRIVE GAS/post9.png"), r: R.photo, w: 840, focus: [0.5, 0], top: 0.12 },
  },

  "medpark-mafa-girafa": {
    thumb: { src: shot(18), r: R.land, w: 640, focus: [0.5, 0], top: 0, trim: 0.14 },
    hero: { src: shot(18), r: R.wide, w: 1600, focus: [0.5, 0.5], trim: 0.14 },
    story: { src: shot(15), r: R.land, w: 1100, focus: [0.5, 0], top: 0, trim: 0.14 },
    pack: { src: shot(18), r: R.land, w: 1200, focus: [0.5, 0], top: 0, trim: 0.14 },


    /*
      Три возраста маскота в одном ряду: лист персонажа, 3D-модель, ростовая
      кукла в коридоре больницы. Пропорция у всех 3:4 — ряд плиток берёт
      высоту из файла.

      У рендера head и trim: его прислали кадром вертикального видео, где
      содержимое занимает 13–86.5% высоты, а остальное — чёрные поля. Доли
      сняты профилем яркости по 200 строкам: на глазок взятые 12% оставляли
      сверху чёрную полоску в пару пикселей, заметную на светлой плитке.
    */
    sheet: { src: pkg("MAFA GIRAFA /mafa girafa3.jpg"), r: R.photo, w: 840, focus: [0.5, 0], top: 0.03 },
    render: {
      src: pkg("MAFA GIRAFA /mafa girfa 2.jpg"),
      r: R.photo, w: 840, focus: [0.5, 0], top: 0, head: 0.135, trim: 0.14,
    },
    mascot: { src: pkg("MAFA GIRAFA /mafa girafa4.jpg"), r: R.photo, w: 840, focus: [0.5, 0], top: 0.06 },
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

    /*
      personaj-.png из пакета не берём. Это не готовый визуал акции, а
      рабочая сборка: слово COCCOLINO наполовину закрыто лапой медведя, а
      под ним стоит зелёная подложка хромакея. Показать целиком нельзя —
      обрезанное слово читается как брак; вырезать медведя без слова тоже
      нельзя — по горизонтали они перекрываются. Механику кампании на этой
      странице несёт clip-test: тест действий персонажа из того же пакета.
    */
  },

  "bere-chisinau": {
    /* Весь материал кейса вертикальный, поэтому герой остаётся портретным:
       горизонтальная обрезка оставила бы от бутылки поясок в середине. */
    thumb: { src: shot(10), r: R.land, w: 640, focus: [0.5, 0], top: 0.2 },
    hero: { src: shot(10), r: R.portrait, w: 900, focus: [0.5, 0.5] },
    /* card-1 и card-3 режутся из самого ролика — tools/reel-frames.mjs.
       Клиент выбрал эти два кадра по мастеру, а не по скриншотам, и держать
       им рецепт от скриншота значило бы переписывать выбор при первом же
       перезапуске скрипта. */
    "card-2": { src: shot(10), r: R.tall, w: 640, focus: [0.55, 0], top: 0.1, zoom: 0.88 },
  },
};

/*
  Картинки карточек в сетке работ: assets/img/cases/<slug>.jpg. Лежат не в
  папке кадров, а рядом с ней, потому что адресуются из данных кейса
  (media.poster) и служат ещё og:image.

  До сих пор они были готовыми файлами без рецепта, и это вышло боком:
  карточка Microinvest показывала кадр одного ролика, а по наведению играл
  другой. Здесь их источник — тот же мастер, что и у самого ролика.

  Кадрирования нет: карточка вписывает картинку через object-fit: cover и
  сама решает, что показать. Обрезать заранее значило бы решить это дважды.
*/
const POSTERS = {
  "microinvest-family": { src: frame("REEL 2 MICROINVEST.mp4", 1), w: 1080 },
};

/* ------------------------------------------------------------------ */
/* Расчёт рамки и запуск ffmpeg                                        */
/* ------------------------------------------------------------------ */

/**
 * Наибольший прямоугольник пропорции `ratio`, помещающийся в кадр и
 * сдвинутый к точке интереса.
 */
function computeCrop(sw, sh, ratio, [fx, fy], trim = 0, zoom = 1, top = null, head = 0) {
  /* head и trim снимают долю сверху и снизу ДО расчёта рамки. У trim повод
     был один — выжженные субтитры внизу кадров Doctor Buba. У head другой:
     рендер жирафа прислали кадром вертикального видео, и содержимое в нём
     занимает 12–86% высоты, остальное — чёрные поля. Без head любая рамка
     тащила бы их внутрь и слот выглядел бы недокрашенным. */
  const y0 = Math.round(sh * head);
  const usableH = Math.round(sh * (1 - trim - head));

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
    y: y0 + clamp(y, usableH - ch),
  };
}

/* Источник — либо путь к картинке, либо {file, at} для кадра из ролика.
   Разворачиваем в одном месте, чтобы probeSize и render не знали разницы. */
const srcFile = (src) => (typeof src === "string" ? src : src.file);
const srcSeek = (src) => (typeof src === "string" ? [] : ["-ss", String(src.at)]);

function probeSize(src) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-of", "csv=p=0", srcFile(src)],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ffprobe не смог прочитать ${srcFile(src)}\n${r.stderr}`);
  const [w, h] = r.stdout.trim().split(",").map(Number);
  return { w, h };
}

function render(src, out, crop, width, quality) {
  const vf =
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` +
    `scale=${width}:-2:flags=lanczos,format=yuv420p`;
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", ...srcSeek(src), "-i", srcFile(src),
     "-frames:v", "1", "-vf", vf, "-q:v", String(quality), out],
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
    if (!existsSync(srcFile(s.src))) throw new Error(`Нет исходника: ${srcFile(s.src)}`);

    const { w: sw, h: sh } = probeSize(s.src);
    const crop = computeCrop(sw, sh, s.r, s.focus, s.trim, s.zoom, s.top ?? null, s.head);

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

for (const [slug, cfg] of Object.entries(POSTERS)) {
  if (ONLY && slug !== ONLY) continue;
  if (!existsSync(srcFile(cfg.src))) throw new Error(`Нет исходника: ${srcFile(cfg.src)}`);

  const { w: sw, h: sh } = probeSize(cfg.src);
  const whole = { w: sw, h: sh, x: 0, y: 0 };

  render(cfg.src, join(OUT_ROOT, `${slug}.jpg`), whole, cfg.w, 3);
  made += 1;

  for (const step of STEPS) {
    if (step >= cfg.w) continue;
    render(cfg.src, join(OUT_ROOT, `${slug}-${step}.jpg`), whole, step, 5);
    made += 1;
  }

  console.log(`${slug}.jpg (карточка): ${sw}x${sh} → ${cfg.w}px`);
}

console.log(`\nГотово: ${made} файлов в src/assets/img/cases/`);
