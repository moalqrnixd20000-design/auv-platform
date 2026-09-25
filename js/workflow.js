/* AUV project platform — workflow stepper (Figure 4).
   Turns the list of steps into an accessible tab set: one panel shows the
   selected step. Without JavaScript every step's detail is simply shown
   inline (see components.css). Arrow keys, Home and End move between steps. */
(function () {
  "use strict";

  var list = document.getElementById("steps");
  var panel = document.getElementById("step-panel");
  if (!list || !panel) return;

  var items = Array.prototype.slice.call(list.querySelectorAll(".step"));
  var buttons = items.map(function (item) { return item.querySelector(".step-btn"); });

  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Workflow steps");

  items.forEach(function (item, i) {
    item.setAttribute("role", "presentation");
    buttons[i].setAttribute("role", "tab");
    buttons[i].id = "step-tab-" + (i + 1);
    buttons[i].setAttribute("aria-controls", "step-panel");
  });

  function select(i, moveFocus) {
    buttons.forEach(function (button, j) {
      var selected = j === i;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    var detail = items[i].querySelector(".step-detail").cloneNode(true);
    panel.replaceChildren.apply(panel, Array.prototype.slice.call(detail.childNodes));
    panel.setAttribute("aria-labelledby", buttons[i].id);
    if (moveFocus) buttons[i].focus();
  }

  buttons.forEach(function (button, i) {
    button.addEventListener("click", function () { select(i, false); });
    button.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (i + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (i - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      if (next !== null) {
        event.preventDefault();
        select(next, true);
      }
    });
  });

  select(0, false);
})();
