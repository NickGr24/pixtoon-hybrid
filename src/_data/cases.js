import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");

/**
 * Кейсы раздела Hybrid Production.
 *
 * Состав и тексты лежат в casesData.json, а флаги наличия видео считаются
 * здесь — по факту существования файла на диске. Раньше они были записаны
 * в JSON руками, и это врало: комментарий в шаблоне обещал проверку при
 * сборке, а на деле нужно было не забыть переставить false на true. Теперь
 * достаточно положить mp4 в src/assets/img/cases/, и кнопка включится сама.
 *
 * Два файла на кейс, а не один:
 *   <slug>-preview.mp4 — 6–10 секунд без звука, подставляется при наведении
 *                        на карточку в сетке работ;
 *   <slug>.mp4         — полный ролик со звуком для страницы кейса.
 * Одним путём обойтись нельзя: наведение на карточку тянуло бы весь мастер.
 */
const data = JSON.parse(readFileSync(join(here, "casesData.json"), "utf8"));

/** Веб-путь (/assets/...) → путь на диске внутри src/ */
const onDisk = (webPath) =>
  Boolean(webPath) && existsSync(join(srcRoot, webPath.replace(/^\//, "")));

for (const c of data.featured) {
  c.media.hasVideo = onDisk(c.media.video);
  c.media.hasPreview = onDisk(c.media.preview);
}

export default data;
