/**
 * Pixtoon Hybrid Production — поведение раздела.
 *
 * Ванильный JS без зависимостей: на проде уже загружены jQuery, Swiper и
 * revealator, но раздел не должен от них зависеть — иначе порядок подключения
 * скриптов в MODX становится частью контракта. Файл самодостаточный, ~7 КБ
 * после минификации: половину занимает плеер страницы кейса.
 *
 * Всё, что здесь есть, — прогрессивное улучшение. Без JS страница читается
 * целиком: видно текст, постеры и карусель (скроллится свайпом).
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Метка «JS есть» ставится до первой отрисовки: только под ней CSS прячет
     блоки для reveal-анимации. Без JS ничего не спрячется. */
  root.classList.add("hyb-js");

  document.addEventListener("DOMContentLoaded", function () {
    initReveal();
    initHoverVideo();
    initClips();
    initCarousel();
    initCasePlayer();
    initBurger();
    initForm();
    initStickyHeader();
    initLegal();
    initConsent();
  });

  /* --- Шапка при прокрутке ----------------------------------------------- */

  /**
   * Сверху шапка прозрачная и высокая, ниже — сжимается и становится матовым
   * стеклом. Это единственная анимация оболочки в макете.
   *
   * Порог в 32px, а не 0: без него шапка дёргается от инерционного скролла
   * трекпада у самого верха страницы. Класс снимается и ставится только при
   * смене состояния — присвоение на каждый кадр прокрутки заставляло бы
   * браузер пересчитывать стили впустую.
   */
  function initStickyHeader() {
    var header = document.querySelector("[data-hyb-header]");
    if (!header) return;

    var stuck = null;

    function sync() {
      var next = window.scrollY > 32;
      if (next === stuck) return;
      stuck = next;
      header.classList.toggle("is-stuck", next);
    }

    window.addEventListener("scroll", sync, { passive: true });
    sync();
  }

  /* --- Появление секций при скролле ------------------------------------- */

  /* Шаг каскада и потолок ступеней. Пять карточек по 80мс — это 320мс от
     первой до последней: заметно как волна, но не как ожидание. Потолок
     нужен ряду из шести и более плиток, иначе хвост появляется тогда,
     когда посетитель уже пролистал мимо. */
  var STAGGER_MS = 80;
  var STAGGER_MAX = 4;

  function initReveal() {
    var items = document.querySelectorAll(".hyb-reveal");
    if (!items.length) return;

    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        /*
          Соседи, попавшие в кадр одним движением, появляются волной, а не
          все разом. Индекс считается внутри пачки и по общему родителю:
          так карточки одного ряда получают ступени 0-1-2, а заголовок
          соседней секции, приехавший тем же кадром, начинает счёт заново.

          Задержка передаётся переменной, а не свойством animation-delay:
          инлайновое свойство перебило бы всю сокращённую запись анимации из
          CSS. Считать её здесь приходится потому, что она зависит от момента
          входа в кадр, а не от места элемента в разметке.
        */
        var seen = new Map();

        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var el = entry.target;
          var parent = el.parentNode;
          var step = seen.get(parent) || 0;
          seen.set(parent, step + 1);

          if (step > 0) {
            el.style.setProperty(
              "--hyb-reveal-delay",
              Math.min(step, STAGGER_MAX) * STAGGER_MS + "ms"
            );
          }

          el.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* --- Видео-превью по наведению ---------------------------------------- */

  /**
   * ТЗ раздел 14: «Case study image → subtle video preview on hover».
   * Источник подставляется только при первом наведении (data-src → src):
   * иначе шесть превью на первом экране тянут мегабайты до того, как
   * посетитель вообще что-то навёл.
   */
  function initHoverVideo() {
    var holders = document.querySelectorAll("[data-hyb-hover-video]");
    if (!holders.length || reduced) return;

    /* На тач-устройствах ховера нет, а автозапуск шести видео сажает батарею */
    if (window.matchMedia("(hover: none)").matches) return;

    holders.forEach(function (holder) {
      var video = holder.querySelector("video");
      if (!video) return;

      var loaded = false;

      holder.addEventListener("mouseenter", function () {
        if (!loaded) {
          video.src = video.dataset.src;
          loaded = true;
        }
        holder.classList.add("is-playing");
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      });

      holder.addEventListener("mouseleave", function () {
        holder.classList.remove("is-playing");
        video.pause();
      });
    });
  }

  /* --- Закулисные клипы --------------------------------------------------- */

  /**
   * Куски записей экрана из продакшена: моделирование по референсу, playblast,
   * риггинг. Играют беззвучно по кругу, пока видны, и останавливаются, когда
   * уезжают за экран — иначе четыре декодера работали бы всю прокрутку.
   *
   * Источник подставляется при первом появлении, а не в разметке: клип весит
   * до 750 КБ, а до него на странице ещё половина текста. Пока он не нужен,
   * виден постер — тот самый кадр, с которого клип и начинается.
   *
   * Ничего не делаем в трёх случаях, и во всех трёх постер остаётся картинкой:
   * запрошено уменьшение движения, включена экономия трафика, нет
   * IntersectionObserver.
   */
  function initClips() {
    var clips = document.querySelectorAll("[data-hyb-clip]");
    if (!clips.length || reduced || !("IntersectionObserver" in window)) return;

    var conn = navigator.connection;
    if (conn && conn.saveData) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var video = entry.target;
          if (!entry.isIntersecting) {
            video.pause();
            return;
          }
          if (!video.src) video.src = video.dataset.src;
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
        });
      },
      /* Четверть кадра, а не появление первого пикселя: клип, начавший
         играть краем у нижней границы окна, к моменту, когда его видно
         целиком, успевает пройти половину петли. */
      { threshold: 0.25 }
    );

    clips.forEach(function (video) {
      io.observe(video);
    });
  }

  /* --- Карусель More hybrid work ---------------------------------------- */

  /**
   * Прокрутка — нативный scroll-snap, кнопки только доводят до следующей
   * карточки. Так свайп и клавиатура работают без нашего участия.
   */
  function initCarousel() {
    var track = document.querySelector("[data-hyb-track]");
    if (!track) return;

    var buttons = document.querySelectorAll("[data-hyb-scroll]");

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dir = parseInt(btn.dataset.hybScroll, 10) || 1;
        var card = track.firstElementChild;
        var step = card ? card.getBoundingClientRect().width + 20 : 320;
        track.scrollBy({
          left: step * dir,
          behavior: reduced ? "auto" : "smooth",
        });
      });
    });

    /* Кнопка гаснет, когда дальше ехать некуда */
    function sync() {
      var max = track.scrollWidth - track.clientWidth - 2;
      buttons.forEach(function (btn) {
        var dir = parseInt(btn.dataset.hybScroll, 10) || 1;
        btn.disabled = dir < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max;
      });
    }

    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  }

  /* --- Плеер на странице кейса ------------------------------------------ */

  /**
   * Плеер страницы кейса.
   *
   * Свои органы управления вместо нативного controls: кадр кадрируется по
   * контейнеру (object-fit), и панель браузера, которая рисуется внутри
   * видео, уезжала за границу фигуры — перемотать ролик было нечем.
   *
   * Ползунок — обычный input[type=range]. Он бесплатно даёт перемотку с
   * клавиатуры, роль slider для скринридера и перетаскивание на тач-экране;
   * свой div из этого не умеет ничего без сотни строк кода.
   *
   * Иконки состояний лежат в разметке обеими парами, показ переключает CSS.
   * Скрипт трогает только классы и подписи — контуры остаются в icons.js и
   * не размножаются строками внутри JS.
   */
  function initCasePlayer() {
    document.querySelectorAll("[data-hyb-player]").forEach(function (figure) {
      var video = figure.querySelector("video");
      var bar = figure.querySelector("[data-hyb-controls]");
      if (!video || !bar) return;

      var big = figure.querySelector("[data-hyb-play]");
      var seek = bar.querySelector('[data-act="seek"]');
      var time = bar.querySelector("[data-hyb-time]");
      var toggleBtn = bar.querySelector('[data-act="toggle"]');
      var muteBtn = bar.querySelector('[data-act="mute"]');
      var fullBtn = bar.querySelector('[data-act="full"]');

      function mmss(sec) {
        if (!isFinite(sec)) return "0:00";
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
      }

      function paintTime() {
        time.textContent = mmss(video.currentTime) + " / " + mmss(video.duration);
      }

      function start() {
        if (!video.src) video.src = video.dataset.src;
        figure.classList.add("is-playing");
        bar.hidden = false;
        video.play();
      }

      function toggle() {
        if (video.paused) start();
        else video.pause();
      }

      if (big) big.addEventListener("click", start);
      toggleBtn.addEventListener("click", toggle);

      /*
        Пропорция контейнера подгоняется под ролик, а не наоборот. Кадр героя
        бывает панорамным 2.9:1, а ролик — 16:9 или вертикальным: без этого
        видео либо обрезалось бы по краям, либо висело в чёрных полях.
      */
      video.addEventListener("loadedmetadata", function () {
        if (video.videoWidth && video.videoHeight) {
          figure.style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
        }
        paintTime();
      });

      video.addEventListener("play", function () {
        figure.classList.add("is-running");
        toggleBtn.setAttribute("aria-label", big.dataset.labelPause);
      });

      video.addEventListener("pause", function () {
        figure.classList.remove("is-running");
        toggleBtn.setAttribute("aria-label", big.dataset.labelPlay);
      });

      /* Ползунок в тысячных долях, а не в секундах: у роликов разная длина,
         и шаг стрелкой должен ощущаться одинаково на всех. */
      var scrubbing = false;

      /* Пройденная часть дорожки заливается через переменную: у input[type=range]
         нет отдельного элемента для «уже проигранного», и залить его можно
         только градиентом, граница которого едет вместе со значением. */
      function paintTrack() {
        seek.style.setProperty("--hyb-seek", seek.value / 10 + "%");
      }

      video.addEventListener("timeupdate", function () {
        if (!scrubbing && video.duration) {
          seek.value = String((video.currentTime / video.duration) * 1000);
        }
        paintTrack();
        paintTime();
      });

      function applySeek() {
        scrubbing = true;
        if (video.duration) video.currentTime = (seek.value / 1000) * video.duration;
        paintTrack();
        paintTime();
      }

      seek.addEventListener("input", applySeek);

      /*
        Прыжок к точке нажатия считается вручную.

        Нативно это делают не все браузеры: у range с appearance: none Safari
        отдаёт нажатие по дорожке ползунку только после перетаскивания, и
        перемотка одним кликом там не работала вовсе. Chrome прыгает сам, и
        значение у него получается то же — обработчик ничего не ломает.

        Перетаскивание остаётся нативным: пока указатель зажат, браузер сам
        шлёт input, и его же слушает applySeek.
      */
      seek.addEventListener("pointerdown", function (e) {
        var box = seek.getBoundingClientRect();
        if (!box.width) return;
        var ratio = (e.clientX - box.left) / box.width;
        seek.value = String(Math.round(Math.min(1, Math.max(0, ratio)) * 1000));
        applySeek();
      });

      seek.addEventListener("change", function () {
        scrubbing = false;
      });

      /* Отпустили указатель — снова слушаем ролик. Слушаем окно, а не сам
         ползунок: указатель часто уводят за пределы дорожки и отпускают уже
         вне её. change тут не страховка — если значение не изменилось,
         браузер его не шлёт, и ползунок навсегда остался бы в режиме
         перетаскивания. */
      window.addEventListener("pointerup", function () {
        scrubbing = false;
      });

      muteBtn.addEventListener("click", function () {
        video.muted = !video.muted;
        figure.classList.toggle("is-muted", video.muted);
        muteBtn.setAttribute(
          "aria-label",
          video.muted ? muteBtn.dataset.labelOff : muteBtn.dataset.labelOn
        );
      });

      fullBtn.addEventListener("click", function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (figure.requestFullscreen) figure.requestFullscreen();
        /* Safari на iPhone не отдаёт fullscreen произвольному элементу, но
           умеет разворачивать сам <video>. */
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      });

      /*
        Клавиатура работает, когда фокус внутри кадра. Пробел и стрелки не
        перехватываются глобально: на странице есть другие прокручиваемые
        блоки, и отобрать у них пробел значило бы сломать прокрутку.
      */
      figure.setAttribute("tabindex", "-1");
      figure.addEventListener("keydown", function (e) {
        if (e.target === seek) return;
        var k = e.key.toLowerCase();
        if (k === " " || k === "k") { e.preventDefault(); toggle(); }
        else if (k === "arrowright") { e.preventDefault(); video.currentTime += 5; }
        else if (k === "arrowleft") { e.preventDefault(); video.currentTime -= 5; }
        else if (k === "m") muteBtn.click();
        else if (k === "f") fullBtn.click();
      });
    });
  }

  /* --- Форма брифа ------------------------------------------------------- */

  /**
   * Форма финального призыва.
   *
   * Обработчика на стороне сервера пока нет, поэтому отправка гасится, а
   * вместо неё показывается благодарность. Это не заглушка ради заглушки:
   * без перехвата браузер ушёл бы на `mailto:` из action и открыл почтовый
   * клиент прямо посреди страницы. Без JS такой уход как раз и остаётся
   * запасным путём — письмо уйдёт на тот же адрес, что и по кнопкам выше.
   *
   * Когда придёт адрес обработчика, снимать отсюда ничего не нужно: AjaxForm
   * на живом сайте вешается на сам элемент form.
   *
   * Проверка полей — нативная. checkValidity даёт разбор типа email и
   * обязательности бесплатно и на языке браузера; свои сообщения пришлось бы
   * держать в двух локалях ради того же результата.
   */
  function initForm() {
    document.querySelectorAll("[data-hyb-form]").forEach(function (form) {
      var status = form.querySelector("[data-hyb-form-status]");
      var message = status ? status.textContent : "";

      /* novalidate ставится скриптом, а не в разметке. Без него браузер
         отбивает пустую форму сам и до обработчика дело не доходит — тогда
         подсветка полей ниже не включилась бы никогда. А без JS проверка
         остаётся браузерной: атрибута в разметке нет. */
      form.setAttribute("novalidate", "");

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        /* Класс включает подсветку незаполненных полей. До первой попытки
           отправки её нет: пустое поле не ошибка, пока его не отправили. */
        form.classList.add("is-checked");

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        form.reset();
        form.classList.remove("is-checked");

        if (status) {
          status.hidden = false;
          /* Скринридер читает role="status" по изменению содержимого. Снятие
             hidden таким изменением не считается, поэтому текст ставится
             заново — из строки, снятой с разметки при инициализации. */
          status.textContent = message;
        }
      });
    });
  }

  /* --- Юридические страницы: оглавление и полоса чтения ------------------ */

  /**
   * Оглавление со скролл-спаем и полоса прочитанного. Работает только там,
   * где есть документ (data-hyb-doc) — на шести юридических страницах.
   *
   * Обе вещи считаются от одной линии чтения — 30% высоты окна: туда
   * смотрит читающий, а не на верхний край экрана. Текущий раздел — последний,
   * чей верх поднялся выше этой линии; полоса — доля документа, прошедшая
   * через неё. Одна линия, одно правило, и маркер с полосой не спорят.
   *
   * Считается на прокрутке, а не наблюдателем пересечений: наблюдатель
   * отдаёт «пересекает полосу» и для хвоста уходящего раздела, и для головы
   * приходящего, и выбрать между ними без геометрии нельзя. Восемнадцать
   * getBoundingClientRect на кадр — дешевле любого обходного правила.
   *
   * Маркер в оглавлении едет за активной ссылкой по двум переменным —
   * смещению и высоте; сам переход рисует CSS.
   */
  function initLegal() {
    var doc = document.querySelector("[data-hyb-doc]");
    if (!doc) return;

    var toc = document.querySelector("[data-hyb-toc]");
    var list = document.querySelector("[data-hyb-toc-list]");
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-hyb-toc-link]"));
    var sections = Array.prototype.slice.call(doc.querySelectorAll("[data-hyb-sec]"));
    var narrow = window.matchMedia("(max-width: 61.99rem)");

    /* <details> оглавления: на десктопе раскрыт всегда — summary там не
       кликается, и закрыть его нечем; на телефоне свёрнут, иначе восемнадцать
       пунктов отодвигают сам документ на экран вниз. */
    if (toc) {
      var syncToc = function () {
        toc.open = !narrow.matches;
      };
      syncToc();
      if (narrow.addEventListener) narrow.addEventListener("change", syncToc);
    }

    /* Плавный ход к разделу. Адрес обновляется заменой, а не записью: клик
       по оглавлению не должен плодить шаги в истории браузера. На телефоне
       оглавление после выбора сворачивается — оно уже сделало своё. */
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = document.getElementById(a.getAttribute("href").slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", "#" + target.id);
        if (toc && narrow.matches) toc.open = false;
      });
    });

    var marked = null;

    function mark(section) {
      if (section === marked) return;
      marked = section;

      var current = null;
      links.forEach(function (a) {
        var on = section !== null && a.getAttribute("href") === "#" + section.id;
        a.classList.toggle("is-current", on);
        if (on) current = a;
      });
      if (!list) return;
      if (!current) {
        list.style.setProperty("--hyb-toc-on", "0");
        return;
      }
      list.style.setProperty("--hyb-toc-y", current.offsetTop + "px");
      list.style.setProperty("--hyb-toc-h", current.offsetHeight + "px");
      list.style.setProperty("--hyb-toc-on", "1");
    }

    var bar = document.querySelector("[data-hyb-progress]");
    var queued = false;

    function paint() {
      queued = false;

      var line = window.innerHeight * 0.3;
      var atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      /* Последний раздел, чей верх выше линии. До первого раздела текущего
         нет и маркер спрятан; у самого низа страницы текущий — последний:
         короткий финальный раздел до линии может и не дойти. */
      var current = null;
      for (var i = 0; i < sections.length; i += 1) {
        if (sections[i].getBoundingClientRect().top <= line) current = sections[i];
      }
      if (atEnd && sections.length) current = sections[sections.length - 1];
      mark(current);

      /* Ноль, когда верх документа стоит на линии, единица — когда до неё
         дошёл его низ либо страница прокручена до конца. */
      if (bar) {
        var top = doc.getBoundingClientRect().top;
        var p = atEnd ? 1 : (line - top) / doc.offsetHeight;
        bar.style.setProperty("--hyb-progress", Math.min(1, Math.max(0, p)).toFixed(4));
      }
    }

    window.addEventListener(
      "scroll",
      function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(paint);
      },
      { passive: true }
    );
    window.addEventListener("resize", paint);
    paint();
  }

  /* --- Согласие на cookie ------------------------------------------------ */

  /**
   * Баннер согласия. Категории — по политике клиента: строго необходимые
   * (без переключателя), аналитика, маркетинг, функциональные.
   *
   * Решение хранится в cookie hyb_consent на 180 дней — это тот самый
   * «строго необходимый» cookie, который политика описывает как память о
   * выборе. Cookie, а не localStorage: его читает и Google Tag Manager, и
   * сервер, если понадобится.
   *
   * Наружу решение уходит тремя путями, и все три ничего не требуют от
   * страницы: window.hybConsent — прочитать текущее; событие hyb:consent на
   * document — узнать об изменении; запись в dataLayer и вызов gtag consent
   * update — для GTM и Consent Mode, когда их подключат. Самих скриптов
   * аналитики здесь нет и не будет: их место в MODX, за этими сигналами.
   *
   * Без сохранённого решения баннер выезжает через секунду после загрузки:
   * не на первой отрисовке, чтобы не спорить с главным кадром страницы, и
   * не позже, чтобы читатель не успел уйти вглубь. Фокус при этом остаётся
   * на странице; в панель он переносится только по кнопке посетителя.
   */
  var CONSENT_KEY = "hyb_consent";
  var CONSENT_CATS = ["analytics", "marketing", "functional"];
  var CONSENT_DAYS = 180;

  function readConsent() {
    var m = document.cookie.match(new RegExp("(?:^|; )" + CONSENT_KEY + "=([^;]*)"));
    if (!m) return null;
    try {
      var state = JSON.parse(decodeURIComponent(m[1]));
      return state && state.v === 1 ? state : null;
    } catch (e) {
      return null;
    }
  }

  function writeConsent(state) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      CONSENT_KEY + "=" + encodeURIComponent(JSON.stringify(state)) +
      "; Max-Age=" + CONSENT_DAYS * 24 * 3600 + "; Path=/; SameSite=Lax" + secure;
  }

  function applyConsent(state) {
    window.hybConsent = state;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "hyb_consent", consent: state });

    var grant = function (on) { return on ? "granted" : "denied"; };
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: grant(state.analytics),
        ad_storage: grant(state.marketing),
        ad_user_data: grant(state.marketing),
        ad_personalization: grant(state.marketing),
        functionality_storage: grant(state.functional),
        personalization_storage: grant(state.functional),
      });
    }

    document.dispatchEvent(new CustomEvent("hyb:consent", { detail: state }));
  }

  function initConsent() {
    var box = document.querySelector("[data-hyb-consent]");
    if (!box) return;

    var views = {};
    box.querySelectorAll("[data-hyb-consent-view]").forEach(function (v) {
      views[v.dataset.hybConsentView] = v;
    });
    var switches = box.querySelectorAll("[data-hyb-consent-cat]");

    var opener = null; /* кнопка, открывшая панель: туда вернётся фокус */
    var closing = null;

    function setView(name) {
      Object.keys(views).forEach(function (k) {
        views[k].hidden = k !== name;
      });
    }

    function fill(state) {
      switches.forEach(function (sw) {
        var key = sw.dataset.hybConsentCat;
        sw.setAttribute("aria-checked", state && state[key] ? "true" : "false");
      });
    }

    function show(view) {
      clearTimeout(closing);
      setView(view);
      box.hidden = false;
      /* Два кадра, не один: первый снимает hidden, и только на втором у
         перехода есть исходное состояние, от которого ехать. */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          box.classList.add("is-open");
        });
      });
    }

    function hide() {
      box.classList.remove("is-open");
      closing = setTimeout(function () {
        box.hidden = true;
      }, reduced ? 0 : 600);
      if (opener) {
        opener.focus();
        opener = null;
      }
    }

    function everything(value) {
      var state = {};
      CONSENT_CATS.forEach(function (key) {
        state[key] = value;
      });
      return state;
    }

    function decide(choice) {
      var state = { v: 1, necessary: true, at: new Date().toISOString() };
      CONSENT_CATS.forEach(function (key) {
        state[key] = Boolean(choice[key]);
      });
      writeConsent(state);
      applyConsent(state);
      fill(state);
      box.classList.add("has-choice");
      hide();
    }

    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.dataset.act;

      if (act === "accept") decide(everything(true));
      else if (act === "reject") decide(everything(false));
      else if (act === "save") {
        var picked = {};
        switches.forEach(function (sw) {
          picked[sw.dataset.hybConsentCat] = sw.getAttribute("aria-checked") === "true";
        });
        decide(picked);
      } else if (act === "settings") setView("prefs");
      else if (act === "back") setView("main");
      else if (act === "close") hide();
    });

    switches.forEach(function (sw) {
      sw.addEventListener("click", function () {
        var on = sw.getAttribute("aria-checked") === "true";
        sw.setAttribute("aria-checked", on ? "false" : "true");
      });
    });

    /* Esc закрывает панель, но только когда решение уже есть: до него
       закрыть баннер, ничего не выбрав, нельзя — как и крестиком. */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || box.hidden) return;
      if (box.classList.contains("has-choice")) hide();
    });

    document.querySelectorAll("[data-hyb-consent-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        opener = btn;
        fill(readConsent());
        show("prefs");
        box.focus();
      });
    });

    var saved = readConsent();
    if (saved) {
      applyConsent(saved);
      fill(saved);
      box.classList.add("has-choice");
    } else {
      fill(everything(false));
      setTimeout(function () {
        show("main");
      }, 900);
    }
  }

  /* --- Мобильное меню ---------------------------------------------------- */

  function initBurger() {
    /* Селектор через data-атрибут, а не через класс оформления: класс шапки
       уже менялся один раз при смене дизайна, и меню тогда молча перестало
       открываться — ошибок в консоли такой промах не даёт. */
    var burger = document.querySelector("[data-hyb-burger]");
    var nav = document.getElementById("hyb-nav");
    if (!burger || !nav) return;

    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });

    /* Esc закрывает меню и возвращает фокус на кнопку */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (burger.getAttribute("aria-expanded") !== "true") return;
      burger.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      burger.focus();
    });
  }
})();
