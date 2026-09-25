// Phones only: a bar pinned to the bottom of the screen with one primary,
// Get a Free Quote, and a round call button beside it. The CSS hides it
// above 640px, where the header already carries Get a Quote.
//
// It stays out of the way while the page's own buttons or the quote form are
// on screen, so it never doubles up on an action the reader can already see:
//   - the hero's buttons (or the hero itself when it has none)
//   - any other quote button on the page
//   - the quote form (#get-quote, homepage only)
//
// The quote link reuses the page's own quote href, so it goes exactly where
// the page's buttons go. On the homepage the arrow points at the form, up or
// down; everywhere else it points right, because it opens another page.
(function () {
  if (!("IntersectionObserver" in window)) return;

  var own = document.querySelector('a[href$="#get-quote"]');
  var href = own ? own.getAttribute("href") : "/#get-quote";
  var form = document.getElementById("get-quote");

  var bar = document.createElement("div");
  bar.className = "quote-bar";
  bar.innerHTML =
    '<a class="quote-bar-call" href="tel:5197214969" aria-label="Call or text (519) 721-4969">' +
      '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
    '</a>' +
    '<a class="quote-bar-go" href="">Get a Free Quote' +
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>' +
    '</a>';
  var go = bar.querySelector(".quote-bar-go");
  go.setAttribute("href", href);

  // GA4: one event name per button, so each shows in the Events report by
  // name with no custom dimension to register. Off the homepage the quote
  // tap leaves the page, so it goes out as a beacon that survives the unload.
  function track(name) {
    if (typeof window.gtag === "function") window.gtag("event", name, { transport_type: "beacon" });
  }
  go.addEventListener("click", function () { track("quote_bar_quote"); });
  bar.querySelector(".quote-bar-call").addEventListener("click", function () { track("quote_bar_call"); });

  document.body.appendChild(bar);
  document.documentElement.classList.add("has-quote-bar");

  var blockers = [];
  var heroes = document.querySelectorAll(".hero");
  for (var i = 0; i < heroes.length; i++) {
    blockers.push(heroes[i].querySelector(".hero-actions") || heroes[i]);
  }
  var buttons = document.querySelectorAll('a.btn[href$="#get-quote"]');
  for (var j = 0; j < buttons.length; j++) blockers.push(buttons[j]);
  if (form) blockers.push(form);

  // Arrow toward the form: up once it's behind the reader, down before it.
  function aim() {
    if (!form) return;
    var above = form.getBoundingClientRect().bottom < 0;
    go.classList.toggle("is-up", above);
    go.classList.toggle("is-down", !above);
  }

  var inView = [];
  var ticking = false;
  function update() {
    ticking = false;
    var show = inView.length === 0;
    if (show) aim();
    bar.classList.toggle("is-shown", show);
  }

  // Only the strip between the sticky header and the bar counts as "on
  // screen" — a button tucked under either one can't be tapped anyway.
  var io = new IntersectionObserver(function (entries) {
    for (var k = 0; k < entries.length; k++) {
      var el = entries[k].target;
      var at = inView.indexOf(el);
      if (entries[k].isIntersecting && at < 0) inView.push(el);
      if (!entries[k].isIntersecting && at >= 0) inView.splice(at, 1);
    }
    update();
  }, { rootMargin: "-56px 0px -80px 0px" });
  for (var b = 0; b < blockers.length; b++) io.observe(blockers[b]);

  // A jump (nav link, back button) can cross the form without ever touching
  // a blocker, so re-aim on scroll too.
  if (form) {
    window.addEventListener("scroll", function () {
      if (ticking || !bar.classList.contains("is-shown")) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
  }
})();
