/**
 * Перекодирование роликов кейсов под веб.
 *
 * Исходники приходят мастерами: 4K ProRes-подобные .mov по 100–180 МБ и
 * выгрузки с YouTube. В репозиторий они не кладутся — коммитятся результаты,
 * а этот скрипт остаётся рецептом.
 *
 *   node tools/encode-videos.mjs
 *   node tools/encode-videos.mjs --only=drive-gas
 *   node tools/encode-videos.mjs --src=/путь/к/мастерам
 *   node tools/encode-videos.mjs --pkg=/путь/к/пакету   # только клипы
 *
 * На кейс делается два файла, и это не дублирование:
 *   <slug>.mp4          — полный ролик со звуком для страницы кейса;
 *   <slug>-preview.mp4  — 8 секунд без звука для наведения на карточку в
 *                         сетке работ. Одним файлом обойтись нельзя: наведение
 *                         на карточку тянуло бы весь мастер.
 *
 * Третий вид — закулисные клипы, таблица CLIPS ниже. Это не ролики кейса, а
 * куски записей экрана из продакшена (моделирование по референсу, playblast,
 * риггинг): они лежат в папке кадров кейса и играют беззвучно по кругу.
 *
 * Ограничение битрейта, а не только CRF: у ролика Drive Gas 57 секунд, и на
 * чистом CRF 23 он выходил под 20 МБ. Потолок в 2 Мбит/с удерживает страницу
 * в разумном весе, оставаясь незаметным на анимации. Кейс может задать свои
 * crf и maxrate — так сделан Medpark, где ролик втрое длиннее прочих.
 *
 * faststart обязателен: без него индекс mp4 лежит в конце файла, и браузер
 * не начнёт воспроизведение, пока не скачает ролик целиком.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/assets/img/cases");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SRC_DIR = arg("src", join(homedir(), "Downloads"));
const ONLY = arg("only", null);

/* Пакет клиента «wep pagy hibrid» от 29.08.2026: закулисные записи экрана и
   новые кадры кампаний. Путь с пробелом на конце — так в архиве. */
const PKG_DIR = arg("pkg", join(homedir(), "Downloads/wep pagy hibrid "));
const pkg = (rel) => join(PKG_DIR, rel);

/* Ролики кейсов и закулисные клипы приходят из разных мест и переделываются
   в разное время. Полный прогон требует обе папки; --what позволяет иметь
   под рукой только ту, что нужна сейчас. */
const WHAT = arg("what", "all");
if (!["all", "videos", "clips"].includes(WHAT)) {
  throw new Error(`--what= принимает all, videos или clips, получено «${WHAT}»`);
}

/*
  У Medpark свои настройки. Ролик идёт 168 секунд — вчетверо дольше
  остальных, и на общих 1920/2 Мбит/с он весил бы под 40 МБ. При 1280 и
  700 кбит/с выходит 15 МБ, а кадр на статике неотличим от прежнего:
  мультипликация с плавными движениями и мягкими градиентами жмётся
  заметно лучше съёмки.
*/
const VIDEOS = {
  "drive-gas": {
    src: join(SRC_DIR, "DRIVE GAS FINAL .mov"),
    width: 1920,
  },
  "bere-chisinau": {
    src: join(SRC_DIR, "BEER CHISINAU NEW VERTICAL.mov"),
    /* Вертикальный мастер 2160x3840 — ширина по короткой стороне */
    width: 1080,
  },
  coccolino: {
    src: join(SRC_DIR, "LOCAL COCCOLINO.mov"),
    width: 1920,
  },

  "medpark-mafa-girafa": {
    src: join(SRC_DIR, "DOCTOR BUBA FINAL.mp4"),
    width: 1280,
    crf: 30,
    maxrate: "700k",
  },

  "microinvest-family": {
    /*
      Мастер лежал в архиве Anonymous+folder.zip той же поставки, что и
      остальные, и был найден не сразу — до этого на странице стоял ролик,
      снятый с канала студии через yt-dlp: горизонтальный спот про кредит,
      сделанный до гибридного этапа. Клиент это заметил.

      Разница не только в источнике. Страница рассказывает про новый этап
      («Am introdus un motan»), и кот есть только здесь. Формат тоже другой:
      вертикальный reel 1080x1916, а не 16:9, — отсюда портретный герой.
    */
    src: join(SRC_DIR, "REEL 2 MICROINVEST.mp4"),
    width: 1080,
  },
};

/*
  Закулисные клипы: слот → кусок записи экрана.

  Отрезки выбраны по раскадровке, а не с начала файла. У записи моделирования
  первые секунды — пустой вьюпорт, у playblast первые кадры почти чёрные, и
  клип, начинающийся оттуда, читался бы как незагрузившееся видео.

  Девять секунд — не круглое число, а предел, после которого петля начинает
  восприниматься как ролик, который зачем-то не даёт себя перемотать.

  Звука нет и не будет (-an): клипы стартуют сами, когда доезжают до экрана.
*/
const CLIPS = {
  "bere-chisinau": {
    "clip-model": {
      src: pkg("BEREA CHISINAU/Pings1 - 21 июня 2026 - 01-03-28 .mp4"),
      from: 17,
      len: 9,
    },
    "clip-previz": {
      src: pkg("BEREA CHISINAU/Beer_Playblast_v0022.mp4"),
      from: 8,
      len: 9,
    },
  },

  "medpark-mafa-girafa": {
    /*
      Мастер снят с экрана в 60 к/с. Половина кадров здесь ничего не
      добавляет — курсор и так дёргается, — а битрейт удваивает.

      Левая пятая часть записи — чёрный рабочий стол мимо окна программы.
      Без crop клип читался бы как наполовину незагрузившийся кадр.
    */
    "clip-rig": {
      src: pkg("MAFA GIRAFA /2024-12-19 10-16-34.mp4"),
      from: 2,
      len: 9,
      fps: 30,
      crop: "iw*0.8:ih:iw*0.2:0",
    },
  },

  coccolino: {
    /*
      Единственный клип не с экрана, а из рендера: тест действий персонажа.
      Медведь покрыт мелкими цветами, и на общих 900 кбит/с клип упирался в
      потолок битрейта — 1 МБ, который страница качает сама, без спроса.
      600 кбит/с срезают его до 700 КБ, а на мягком фоне и плавном движении
      разница не видна.
    */
    "clip-test": {
      src: pkg("COCOLINO/test cocolino.mov"),
      from: 4,
      len: 9,
      maxrate: "600k",
    },
  },
};

function run(label, args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg упал на ${label}\n${r.stderr.slice(-600)}`);
}

const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(1);
const kb = (f) => Math.round(statSync(f).size / 1024);

for (const [slug, cfg] of Object.entries(VIDEOS)) {
  if (ONLY && slug !== ONLY) continue;
  if (WHAT === "clips") continue;
  if (!existsSync(cfg.src)) {
    throw new Error(`Нет исходника: ${cfg.src}\nУкажите папку через --src=`);
  }

  const full = join(OUT, `${slug}.mp4`);
  const preview = join(OUT, `${slug}-preview.mp4`);

  run(`${slug}.mp4`, [
    "-y", "-loglevel", "error", "-i", cfg.src,
    "-vf", `scale=${cfg.width}:-2:flags=lanczos`,
    "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
    "-crf", String(cfg.crf ?? 24),
    "-maxrate", cfg.maxrate ?? "2M",
    "-bufsize", cfg.bufsize ?? "4M",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-movflags", "+faststart",
    full,
  ]);

  /* Превью снимается с начала ролика: первые секунды в этих работах — общий
     план, по которому кейс узнаётся. Звук вырезан (-an): карточка играет при
     наведении, и звук там был бы неожиданностью. */
  run(`${slug}-preview.mp4`, [
    "-y", "-loglevel", "error", "-i", cfg.src, "-t", "8",
    "-vf", `scale=${Math.round(cfg.width / 2)}:-2:flags=lanczos`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "30",
    "-pix_fmt", "yuv420p", "-an",
    "-movflags", "+faststart",
    preview,
  ]);

  console.log(`${slug}: ${mb(full)} МБ + превью ${mb(preview)} МБ`);
}

for (const [slug, clips] of Object.entries(CLIPS)) {
  if (ONLY && slug !== ONLY) continue;
  if (WHAT === "videos") continue;

  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });

  for (const [slot, cfg] of Object.entries(clips)) {
    if (!existsSync(cfg.src)) {
      throw new Error(`Нет исходника клипа: ${cfg.src}\nУкажите папку через --pkg=`);
    }

    const width = cfg.width ?? 1280;
    /* crop идёт до scale: иначе масштаб считался бы от полного кадра вместе
       с полями, и после обрезки клип оказался бы уже заявленной ширины. */
    const scale =
      (cfg.crop ? `crop=${cfg.crop},` : "") + `scale=${width}:-2:flags=lanczos`;
    const out = join(dir, `${slot}.mp4`);

    /* -ss перед -i, а не после: так ffmpeg прыгает по индексу вместо того,
       чтобы декодировать всё от начала файла. Точность до кадра здесь не
       нужна — отрезок и так выбран с запасом. */
    run(`${slug}/${slot}.mp4`, [
      "-y", "-loglevel", "error",
      "-ss", String(cfg.from), "-i", cfg.src, "-t", String(cfg.len),
      "-vf", cfg.fps ? `fps=${cfg.fps},${scale}` : scale,
      "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
      "-crf", String(cfg.crf ?? 28),
      "-maxrate", cfg.maxrate ?? "900k",
      "-bufsize", "1800k",
      "-pix_fmt", "yuv420p", "-an",
      "-movflags", "+faststart",
      out,
    ]);

    /*
      Постер к клипу — обычный кадр в той же папке, поэтому cases.js видит его
      как слот и валидирует наравне с остальными. Он же остаётся картинкой
      там, где клип не играет: prefers-reduced-motion, отключённый JS,
      экономия трафика.
    */
    run(`${slug}/${slot}.jpg`, [
      "-y", "-loglevel", "error",
      "-ss", String(cfg.from), "-i", cfg.src, "-frames:v", "1",
      "-vf", scale, "-q:v", "3",
      join(dir, `${slot}.jpg`),
    ]);

    console.log(`${slug}/${slot}: ${cfg.len} с, ${kb(out)} КБ`);
  }
}

console.log("\nГотово. Кнопка воспроизведения включается сама: cases.js считает");
console.log("hasVideo по факту наличия файла на диске, а клипы — по mp4 рядом");
console.log("с кадром того же имени.");
