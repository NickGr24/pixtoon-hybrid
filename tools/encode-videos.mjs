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
 *
 * На кейс делается два файла, и это не дублирование:
 *   <slug>.mp4          — полный ролик со звуком для страницы кейса;
 *   <slug>-preview.mp4  — 8 секунд без звука для наведения на карточку в
 *                         сетке работ. Одним файлом обойтись нельзя: наведение
 *                         на карточку тянуло бы весь мастер.
 *
 * Ограничение битрейта, а не только CRF: у ролика Drive Gas 57 секунд, и на
 * чистом CRF 23 он выходил под 20 МБ. Потолок в 2 Мбит/с удерживает страницу
 * в разумном весе, оставаясь незаметным на анимации.
 *
 * faststart обязателен: без него индекс mp4 лежит в конце файла, и браузер
 * не начнёт воспроизведение, пока не скачает ролик целиком.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
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

/*
  Medpark не перекодируется: рабочий файл уже лежит в репозитории, а мастер
  идёт в HEVC на 168 секунд и 430 МБ — перегонять его заново незачем.
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

  "microinvest-family": {
    /* Мастера нет: ролик снят с канала студии (youtu.be/UvWq7Vk_aF4,
       «Microinvest RO Family 30 sec») через yt-dlp. */
    src: "/tmp/pixvid/microinvest-src.mp4",
    width: 1920,
  },
};

function run(label, args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg упал на ${label}\n${r.stderr.slice(-600)}`);
}

const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(1);

for (const [slug, cfg] of Object.entries(VIDEOS)) {
  if (ONLY && slug !== ONLY) continue;
  if (!existsSync(cfg.src)) {
    throw new Error(`Нет исходника: ${cfg.src}\nУкажите папку через --src=`);
  }

  const full = join(OUT, `${slug}.mp4`);
  const preview = join(OUT, `${slug}-preview.mp4`);

  run(`${slug}.mp4`, [
    "-y", "-loglevel", "error", "-i", cfg.src,
    "-vf", `scale=${cfg.width}:-2:flags=lanczos`,
    "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
    "-crf", "24", "-maxrate", "2M", "-bufsize", "4M",
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

console.log("\nГотово. Кнопка воспроизведения включается сама: cases.js считает");
console.log("hasVideo по факту наличия файла на диске.");
