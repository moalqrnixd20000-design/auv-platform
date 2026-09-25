/* AUV project site — page behaviour: the top navigation (mobile menu and
   a highlight for the section being read). Plain script, no dependencies. */
(function () {
  "use strict";

  var menuBtn = document.getElementById("menu-btn");
  var nav = document.getElementById("site-nav");
  var links = Array.prototype.slice.call(nav.querySelectorAll("a"));

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }

  menuBtn.addEventListener("click", function () {
    setMenu(!nav.classList.contains("is-open"));
  });
  links.forEach(function (link) {
    link.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
      menuBtn.focus();
    }
  });

  /* Mark the section that crosses a band near the top of the viewport. */
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
    }, { rootMargin: "-15% 0px -70% 0px" });
    sections.forEach(function (section) { observer.observe(section); });
  }
})();
