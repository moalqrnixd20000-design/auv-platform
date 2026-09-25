/* AUV project platform — inspection tools for the team's AUV design (Figure 2).
   The image itself is never changed. This script only:
     - highlights the sheet and shows a small information panel on hover / focus,
     - follows the mouse pointer with a magnifier (a round window onto the
       same image at 2x, 3x or 4x),
     - opens a full-size view (a <dialog>) on click, Enter, or the button.
   On touch screens there is no hover, so a tap opens the full-size view,
   where the browser's own pinch-zoom works. */
(function () {
  "use strict";

  var sheet = document.getElementById("auv-sheet");
  var layout = document.getElementById("design-grid");
  var view = document.getElementById("auv-view");
  var img = document.getElementById("auv-img");
  var loupe = document.getElementById("auv-loupe");
  var dialog = document.getElementById("auv-viewer");
  var openButton = document.getElementById("auv-open");
  if (!sheet || !layout || !view || !img || !loupe || !dialog) return;

  var zoom = 3;

  /* Hover exists only on devices with a fine pointer (mouse, trackpad). */
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  function applyPointerMode() {
    sheet.classList.toggle("sheet--live", finePointer.matches);
    sheet.classList.toggle("sheet--coarse", !finePointer.matches);
    layout.classList.toggle("design-grid--coarse", !finePointer.matches);
  }
  applyPointerMode();
  if (finePointer.addEventListener) finePointer.addEventListener("change", applyPointerMode);

  Array.prototype.forEach.call(document.querySelectorAll('input[name="zoom"]'), function (radio) {
    radio.addEventListener("change", function () { zoom = Number(radio.value); });
  });

  loupe.style.backgroundImage = 'url("' + img.src + '")';

  function moveLoupe(event) {
    var box = img.getBoundingClientRect();
    var x = event.clientX - box.left;
    var y = event.clientY - box.top;
    if (x < 0 || y < 0 || x > box.width || y > box.height) return;

    /* The vehicle runs corner to corner, so the top-right and bottom-left
       corners are empty. Keep the information panel in whichever of them is
       farther from the pointer, so the magnifier never covers it. */
    var toTopRight = Math.hypot(x - box.width, y);
    var toBottomLeft = Math.hypot(x, y - box.height);
    sheet.classList.toggle("sheet--panel-bl", toTopRight < toBottomLeft);

    var size = loupe.offsetWidth;
    var viewBox = view.getBoundingClientRect();
    loupe.style.backgroundSize = box.width * zoom + "px " + box.height * zoom + "px";
    loupe.style.backgroundPosition = -(x * zoom - size / 2) + "px " + -(y * zoom - size / 2) + "px";
    loupe.style.transform =
      "translate(" + (event.clientX - viewBox.left - size / 2) + "px," + (event.clientY - viewBox.top - size / 2) + "px)";
  }

  view.addEventListener("pointerenter", function (event) {
    if (event.pointerType !== "mouse") return;
    sheet.classList.add("is-inspecting", "is-magnifying");
    moveLoupe(event);
  });
  view.addEventListener("pointermove", function (event) {
    if (event.pointerType === "mouse") moveLoupe(event);
  });
  view.addEventListener("pointerleave", function (event) {
    if (event.pointerType !== "mouse") return;
    sheet.classList.remove("is-magnifying");
    if (!view.matches(":focus-visible")) sheet.classList.remove("is-inspecting");
  });

  /* Keyboard users get the highlight and the information panel on focus. */
  view.addEventListener("focus", function () {
    if (view.matches(":focus-visible")) sheet.classList.add("is-inspecting");
  });
  view.addEventListener("blur", function () {
    sheet.classList.remove("is-inspecting", "is-magnifying");
  });

  /* Full-size view */
  function openViewer() {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else window.open(img.src, "_blank", "noopener");
  }
  view.addEventListener("click", openViewer);
  view.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openViewer();
    }
  });
  if (openButton) openButton.addEventListener("click", openViewer);

  /* Clicking the dimmed area outside the dialog closes it. */
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) dialog.close();
  });
})();
