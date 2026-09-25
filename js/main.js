/* AUV project platform — page behaviour.
   1. Section index: dropdown on narrow screens, scroll-spy on all screens.
   2. Status lens: highlights items by status (Confirmed, Conceptual, …).
   Plain script, no dependencies; the page still reads fine without it. */
(function () {
  "use strict";

  /* ---------- Section index ---------- */

  var menuBtn = document.getElementById("menu-btn");
  var index = document.getElementById("site-index");
  var links = Array.prototype.slice.call(index.querySelectorAll("a"));

  function setMenu(open) {
    index.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }

  menuBtn.addEventListener("click", function () {
    setMenu(!index.classList.contains("is-open"));
  });
  links.forEach(function (link) {
    link.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && index.classList.contains("is-open")) {
      setMenu(false);
      menuBtn.focus();
    }
  });

  // Scroll-spy: mark the section that is crossing a band near the top of the viewport.
  var sections = links
    .map(function (link) { return document.getElementById(link.getAttribute("href").slice(1)); })
    .filter(Boolean);

  function setCurrent(id) {
    links.forEach(function (link) {
      if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  if ("IntersectionObserver" in window) {
    var visible = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      var current = sections.find(function (section) { return visible[section.id]; });
      if (current) setCurrent(current.id);
    }, { rootMargin: "-20% 0px -65% 0px" });
    sections.forEach(function (section) { observer.observe(section); });
  }

  /* ---------- Status lens ---------- */

  var lensButtons = Array.prototype.slice.call(document.querySelectorAll("[data-lens-btn]"));
  var lensStatus = document.getElementById("lens-status");
  var labels = {
    confirmed: "Confirmed",
    conceptual: "Conceptual",
    planned: "Planned / Prototype",
    placeholder: "Placeholder"
  };

  function setLens(name) {
    if (name) document.body.setAttribute("data-lens", name);
    else document.body.removeAttribute("data-lens");
    lensButtons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-lens-btn") === name));
    });
    lensStatus.textContent = name
      ? "Highlighting " + labels[name] + " items. Other items are dimmed."
      : "Showing everything.";
  }

  lensButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var name = button.getAttribute("data-lens-btn");
      setLens(document.body.getAttribute("data-lens") === name ? "" : name);
    });
  });
  document.getElementById("lens-reset").addEventListener("click", function () { setLens(""); });
})();
