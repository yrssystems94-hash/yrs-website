// Header navigation. Two behaviours sharing one set of links:
//   desktop (>=900px) — Services / Guides / Areas open a small panel on click
//   mobile  (<900px)  — the three-line button opens a full-screen overlay
// Click rather than hover on the desktop panels: hover menus are unusable on
// touch laptops and fire by accident when the cursor crosses the bar.
(function () {
  var root = document.documentElement;
  var toggle = document.getElementById("navToggle");
  var overlay = document.getElementById("navOverlay");
  var scrollY = 0;

  function closeDropdowns(except) {
    var open = document.querySelectorAll(".nav-group.is-open");
    for (var i = 0; i < open.length; i++) {
      if (open[i] === except) continue;
      open[i].classList.remove("is-open");
      var t = open[i].querySelector(".nav-group-btn");
      if (t) t.setAttribute("aria-expanded", "false");
    }
  }

  function setOverlay(open) {
    if (!overlay || !toggle) return;
    overlay.classList.toggle("is-open", open);
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) {
      // Lock the page behind the overlay. Holding the scroll position and
      // restoring it matters on iOS, where simply setting overflow:hidden
      // loses the reader's place in the article.
      scrollY = window.pageYOffset || 0;
      root.classList.add("nav-locked");
      document.body.style.top = -scrollY + "px";
      var first = overlay.querySelector("a");
      if (first) first.focus({ preventScroll: true });
    } else {
      root.classList.remove("nav-locked");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
      toggle.focus({ preventScroll: true });
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".nav-group-btn") : null;
    if (btn) {
      e.preventDefault();
      var group = btn.parentNode;
      var wasOpen = group.classList.contains("is-open");
      closeDropdowns(group);
      group.classList.toggle("is-open", !wasOpen);
      btn.setAttribute("aria-expanded", wasOpen ? "false" : "true");
      return;
    }
    if (toggle && e.target.closest && e.target.closest("#navToggle")) {
      e.preventDefault();
      setOverlay(!overlay.classList.contains("is-open"));
      return;
    }
    if (overlay && e.target.closest && e.target.closest("#navOverlayClose")) {
      e.preventDefault();
      setOverlay(false);
      return;
    }
    // a click anywhere else closes any open desktop panel
    if (!e.target.closest || !e.target.closest(".nav-group")) closeDropdowns(null);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (overlay && overlay.classList.contains("is-open")) setOverlay(false);
    else closeDropdowns(null);
  });

  // Crossing the breakpoint with the overlay open would otherwise leave the
  // page scroll-locked with nothing visible holding it.
  var mq = window.matchMedia("(min-width: 900px)");
  var onChange = function (ev) {
    if (ev.matches && overlay && overlay.classList.contains("is-open")) setOverlay(false);
  };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange);
})();
