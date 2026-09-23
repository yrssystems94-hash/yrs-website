/* Winter Prep — heat cable running-cost acknowledgement.
   "Start Winter Prep" stays locked until the homeowner confirms all three
   points about what the cables cost to run. The page must still make sense
   if this script never loads, so the link is a real anchor to #get-quote and
   the locked state is applied here rather than baked into the markup. */
(function () {
  var list = document.getElementById("ackTicks");
  var go = document.getElementById("ackGo");
  var status = document.getElementById("ackStatus");
  if (!list || !go || !status) return;

  var boxes = Array.prototype.slice.call(list.querySelectorAll('input[type="checkbox"]'));
  if (!boxes.length) return;

  function sync() {
    var done = 0;
    boxes.forEach(function (b) {
      if (b.checked) done++;
      var row = b.parentNode;
      if (row && row.classList) row.classList.toggle("is-on", b.checked);
    });

    var ready = done === boxes.length;
    go.classList.toggle("is-locked", !ready);
    go.setAttribute("aria-disabled", ready ? "false" : "true");
    status.classList.toggle("is-ready", ready);
    status.textContent = ready
      ? "Thanks — you know what it costs. Let's get started."
      : "Confirm all three to continue (" + done + " of " + boxes.length + ")";
  }

  boxes.forEach(function (b) {
    b.addEventListener("change", sync);
  });

  go.addEventListener("click", function (e) {
    if (go.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      list.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // The request form is a cross-origin iframe, so the tick cannot be written
    // into the lead from here. Ask for it in the description instead.
    status.classList.add("is-ready");
    status.textContent = 'Please write "winter prep — heat cable costs understood" in the description.';
  });

  // Browsers restore checkbox state on a back/bfcache return; re-read it.
  window.addEventListener("pageshow", sync);
  sync();
})();
