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
    initCarousel();
    initCasePlayer();
    initBurger();
    initShowreel();
    initStickyHeader();
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

      seek.addEventListener("input", function () {
        scrubbing = true;
        if (video.duration) video.currentTime = (seek.value / 1000) * video.duration;
        paintTrack();
        paintTime();
      });

      seek.addEventListener("change", function () {
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

  /* --- Showreel ---------------------------------------------------------- */

  /**
   * Пока файла шоурила нет, кнопка ведёт к секции работ — вместо кнопки,
   * которая ничего не делает. Когда придёт видео, сюда встанет модалка.
   */
  function initShowreel() {
    var btn = document.querySelector("[data-hyb-showreel]");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var target = document.getElementById("work");
      if (target) {
        target.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start",
        });
      }
    });
  }
})();
