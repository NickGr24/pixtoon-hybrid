# Pixtoon — Hybrid Production

Раздел «AI Hybrid Video Production» для pixtoon.com: лендинг и четыре страницы
кейсов, на английском и румынском. Десять страниц.

**Демо:** https://nickgr24.github.io/pixtoon-hybrid/
(закрыто от индексации — на постерах ещё не опубликованные работы клиента)

Сборка отдаёт **плоский HTML + CSS + JS** — ровно то, что заводится в MODX как
шаблон и чанки. Eleventy нужен только нам, на прод он не едет.

## Запуск

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # сборка в dist/
```

## Что где

```
src/
  _data/
    site.json          контакты, соцсети, футер — сняты с живого pixtoon.com
    cases.json         тексты всех кейсов, EN + RO
    i18n/en.json       тексты лендинга
    i18n/ro.json
    casePages.js       разворачивает 4 кейса x 2 языка в 8 страниц
  _includes/
    layouts/base.njk   <head>, шапка, футер, подключение стилей
    partials/          header.njk, footer.njk — копии структуры сайта
  pages/
    landing.njk        лендинг, обе локали из одного шаблона
    case.njk           страница кейса, все восемь из одного шаблона
  assets/
    css/               модули; склеиваются в один hybrid.css
    js/hybrid.js       ~4 КБ, без зависимостей
    img/cases/         постеры кейсов
```

Правка текста — в JSON, не в разметке. Правка шапки — в одном `header.njk`,
а не в десяти файлах.

## Дизайн-система

Формула ТЗ «≈70% существующего Pixtoon + 30% Hybrid» разложена по токенам
в `src/assets/css/tokens.css`:

| Что | Значение | Откуда |
|---|---|---|
| Главная кнопка | `#fff028` жёлтый | pixtoon.com |
| Акцент раздела | `#8b6fa3` мов | линия Hybrid |
| Фон секций | `#ffffff` / `#f4f1f6` | линия Hybrid |
| Текст | `#231f29` | линия Hybrid |
| Золото (только микрометки) | `#b69a54` | линия Hybrid |
| Заголовки | Baloo 2 | линия Hybrid |
| Текст | Poppins | pixtoon.com |

Один outline-заголовок на секцию. Шорткод `title` принимает единственное поле
`outline`, поэтому продублировать приём внутри секции нельзя технически.

## Демо на GitHub Pages

Сайт собирается из ветки `gh-pages`. Обновить после правок:

```bash
PATH_PREFIX=/pixtoon-hybrid/ npm run build
cd dist && git add -A && git commit -m "update" && git push origin gh-pages
```

`PATH_PREFIX` обязателен: Pages отдаёт сайт из подпапки, без префикса ссылки
уедут в корень домена. Для боевой сборки переменная не задаётся.

В репозитории лежит и workflow `.github/workflows/deploy.yml` — он соберёт
всё автоматически, когда на аккаунте заработает GitHub Actions.

## Интеграция в MODX

1. `npm run build` → каталог `dist/`. **Без `PATH_PREFIX`** — на pixtoon.com
   пути должны быть корневыми.
2. **Удалить из `<head>` строку с `theme-shell.css`.** Этот файл существует
   только для автономного просмотра; на сайте шапку и футер одевает
   `main_update.min.css`. Если оставить — начнёт спорить со стилями темы.
3. `assets/css/hybrid.css`, `assets/js/hybrid.js`, `assets/img/cases/*`
   положить в те же пути на сервере.
4. Poppins уже загружен темой — из ссылки на Google Fonts оставить только
   Baloo 2.
5. Разметку `<header>` и `<footer>` заменить существующими чанками сайта.
   Структура и классы совпадают, поэтому замена дословная. В навигацию
   добавить пункт «Hybrid Production».
6. Секции `<main class="hyb-scope">` завести чанками. Класс `hyb-scope`
   обязателен — на нём объявлены все токены.
7. Ресурсы MODX: `hybrid-production` и четыре дочерних по slug кейсов,
   плюс те же в контексте `ro`.

Весь CSS раздела — под префиксом `.hyb-*`, стили темы не затрагиваются.

## Открытые пункты

См. `docs/CONTENT-REVIEW.md` — что нужно получить от клиента до публикации.
