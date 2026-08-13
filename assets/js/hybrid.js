/**
 * Pixtoon Hybrid Production — поведение раздела.
 *
 * Ванильный JS без зависимостей: на проде уже загружены jQuery, Swiper и
 * revealator, но раздел не должен от них зависеть — иначе порядок подключения
 * скриптов в MODX становится частью контракта. Файл самодостаточный, ~4 КБ.
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
  });

  /* --- Появление секций при скролле ------------------------------------- */

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
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
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

  function initCasePlayer() {
    var buttons = document.querySelectorAll("[data-hyb-play]");

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var figure = btn.closest(".hyb-cs__media");
        var video = figure && figure.querySelector("video");
        if (!video) return;

        if (!video.src) video.src = video.dataset.src;
        figure.classList.add("is-playing");
        video.play();
        video.focus();
      });
    });
  }

  /* --- Мобильное меню ---------------------------------------------------- */

  function initBurger() {
    var burger = document.querySelector(".header-nav__burger");
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
