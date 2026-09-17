// Roof Colour Studio — an in-browser shingle colour visualizer.
//
// Why this exists: CertainTeed's own ColorView tool is good, but it makes
// people leave the site and create a free account before it'll even take
// their photo. This does the same job — try a real Landmark colour on your
// own roof — without either. The photo is never uploaded anywhere; it's
// read straight into a <canvas> and every pixel operation happens on the
// visitor's own device.
//
// How the recolour works (no AI, no server, just pixel math):
//   1. The visitor taps around the roofline to trace it — a plain polygon.
//   2. That polygon is rasterised to a soft-edged mask.
//   3. For every masked pixel we convert to HSL, swap in the target
//      colour's hue/saturation, nudge lightness a little toward the target
//      tone, and convert back — so the shadows, granule texture and glare
//      already in the photo carry straight through. Flat photo areas
//      outside the mask are never touched.
(function () {
  "use strict";

  var stageUpload = document.getElementById("csUpload");
  var stageEditor = document.getElementById("csEditor");
  if (!stageUpload || !stageEditor) return; // not on this page

  var drop = document.getElementById("csDrop");
  var fileInput = document.getElementById("csFileInput");
  var sampleBtn = document.getElementById("csSampleBtn");

  var stepLabel = document.getElementById("csStepLabel");
  var undoBtn = document.getElementById("csUndo");
  var newSectionBtn = document.getElementById("csNewSection");
  var resetBtn = document.getElementById("csReset");

  var canvasWrap = document.getElementById("csCanvasWrap");
  var canvas = document.getElementById("csCanvas");
  var hint = document.getElementById("csHint");
  var recolouring = document.getElementById("csRecolouring");
  var ctx = canvas.getContext("2d");

  var continueWrap = document.getElementById("csContinueWrap");
  var continueBtn = document.getElementById("csContinueBtn");

  var coloursPanel = document.getElementById("csColours");
  var swatchesEl = document.getElementById("csSwatches");
  var compareBtn = document.getElementById("csBeforeAfter");
  var downloadBtn = document.getElementById("csDownload");
  var quoteBtn = document.getElementById("csQuoteBtn");

  var SAMPLE_IMAGE = "../images/finished-reroof.jpg";
  var MAX_EDGE = 1400; // caps pixel-math cost; plenty for a screen preview
  var CLOSE_RADIUS = 16; // px (canvas space) — tap near the first point to close a shape
  var POINT_HIT_RADIUS = 14;

  // CertainTeed Landmark — the line quoted in the guide above as "our
  // standard for most homes." Hex values are a calibrated approximation for
  // an on-screen preview, not a colour-matched swatch — the copy on this
  // page already says as much, and the tool repeats it.
  var COLOURS = [
    { name: "Weathered Wood", hex: "#8A7A63" },
    { name: "Moire Black", hex: "#2B2B2E" },
    { name: "Colonial Slate", hex: "#5C6670" },
    { name: "Georgetown Gray", hex: "#8C8D88" },
    { name: "Driftwood", hex: "#A79C8A" },
    { name: "Resawn Shake", hex: "#6E6154" },
    { name: "Heather Blend", hex: "#75695C" },
    { name: "Burnt Sienna", hex: "#6B4A3C" },
    { name: "Cobblestone Gray", hex: "#706F6A" },
    { name: "Atlantic Blue", hex: "#4A5560" },
  ];

  var state = {
    sourceCanvas: null, // full-res decoded photo, drawn once
    sections: [], // array of closed polygons: [[{x,y}, ...], ...]
    active: [], // the polygon currently being traced (open)
    dragPoint: null, // {section, index} while dragging an existing point
    activeColour: null,
    showingOriginal: false,
    recolourToken: 0, // cancels a stale async recolour if a newer one starts
  };

  // ---------- small helpers ----------

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
  }

  // The site header is position:sticky and sits on top of the page at
  // scroll-top 0 — a plain scrollIntoView({block:"start"}) lands content
  // right under the *document* top, which the sticky header then visually
  // covers. Scoped to this tool only (no shared CSS touched) rather than
  // adding scroll-margin site-wide.
  function scrollBelowHeader(el) {
    var header = document.querySelector("header");
    var headerH = header ? header.getBoundingClientRect().height : 0;
    var rect = el.getBoundingClientRect();
    var targetY = window.pageYOffset + rect.top - headerH - 14;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  }

  function canvasPointFromEvent(evt) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var clientX = evt.touches && evt.touches.length ? evt.touches[0].clientX : evt.clientX;
    var clientY = evt.touches && evt.touches.length ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      var v = l * 255;
      return [v, v, v];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [
      hue2rgb(p, q, h + 1 / 3) * 255,
      hue2rgb(p, q, h) * 255,
      hue2rgb(p, q, h - 1 / 3) * 255,
    ];
  }

  // ---------- image loading ----------

  function loadImageFile(file) {
    if (!file || file.type.indexOf("image/") !== 0) return;
    var url = URL.createObjectURL(file);
    loadImageUrl(url, true);
  }

  function loadImageUrl(url, revokeAfter) {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      installImage(img);
      if (revokeAfter) {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }
    };
    img.onerror = function () {
      if (revokeAfter) {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }
    };
    img.src = url;
  }

  function installImage(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);

    var source = document.createElement("canvas");
    source.width = cw;
    source.height = ch;
    var sctx = source.getContext("2d");
    sctx.drawImage(img, 0, 0, cw, ch);
    state.sourceCanvas = source;
    state.sections = [];
    state.active = [];
    state.activeColour = null;

    canvas.width = cw;
    canvas.height = ch;

    show(stageUpload, false);
    show(stageEditor, true);
    show(coloursPanel, false);
    show(continueWrap, false);
    show(hint, true);
    setStep(1);
    drawScene();
    // Scroll the whole editor stage into view, not just the canvas — the
    // canvas alone would push the toolbar (Undo / Add section / Start over)
    // off the top of the screen, right when those controls matter most.
    scrollBelowHeader(stageEditor);
  }

  // ---------- tracing UI ----------

  function setStep(n) {
    stepLabel.textContent = n === 1 ? "Step 1 of 2 — Trace your roof" : "Step 2 of 2 — Try a colour";
  }

  function drawScene() {
    if (!state.sourceCanvas) return;
    ctx.drawImage(state.sourceCanvas, 0, 0);
    drawPolygon(state.active, true);
    state.sections.forEach(function (poly) {
      drawPolygon(poly, false);
    });
  }

  function drawPolygon(poly, isActive) {
    if (!poly || !poly.length) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = isActive ? "#C9962E" : "rgba(201,150,46,0.9)";
    ctx.fillStyle = "rgba(201,150,46,0.16)";
    ctx.lineWidth = Math.max(2, canvas.width * 0.0028);

    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    if (!isActive) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();

    var r = Math.max(5, canvas.width * 0.007);
    poly.forEach(function (p, i) {
      ctx.beginPath();
      ctx.fillStyle = i === 0 && isActive && poly.length >= 3 ? "#ffffff" : "#C9962E";
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1C3350";
      ctx.stroke();
    });
    ctx.restore();
  }

  function closeActiveSection() {
    if (state.active.length < 3) return false;
    state.sections.push(state.active);
    state.active = [];
    return true;
  }

  function maybeShowContinue() {
    var ready = state.sections.length > 0 && state.active.length === 0;
    show(continueWrap, ready);
    if (ready) show(hint, false);
  }

  function pointerDown(evt) {
    if (!state.sourceCanvas) return;
    evt.preventDefault();
    var p = canvasPointFromEvent(evt);

    // Closing the shape takes priority over grabbing point 0 — once there
    // are enough points to close, tapping back near the start is how you
    // finish a shape, and it must win over "start dragging that point"
    // (which would otherwise always match first, since it's a distance-0 hit).
    if (state.active.length >= 3 && dist(p, state.active[0]) <= CLOSE_RADIUS) {
      closeActiveSection();
      drawScene();
      maybeShowContinue();
      return;
    }
    // Otherwise, check for grabbing an existing point on the still-open trace
    for (var i = 0; i < state.active.length; i++) {
      if (dist(p, state.active[i]) <= POINT_HIT_RADIUS) {
        state.dragPoint = { poly: state.active, index: i };
        return;
      }
    }
    state.active.push(p);
    drawScene();
    show(hint, state.active.length < 3);
    maybeShowContinue();
  }

  function pointerMove(evt) {
    if (!state.dragPoint) return;
    evt.preventDefault();
    var p = canvasPointFromEvent(evt);
    state.dragPoint.poly[state.dragPoint.index] = p;
    drawScene();
  }

  function pointerUp() {
    if (!state.dragPoint) return;
    state.dragPoint = null;
    // A drag could have happened after the colour stage was already open —
    // keep the recolour in sync with the adjusted outline.
    if (!coloursPanel.hidden && state.activeColour) applyColour(state.activeColour);
  }

  canvas.addEventListener("mousedown", pointerDown);
  canvas.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);
  canvas.addEventListener("touchstart", pointerDown, { passive: false });
  canvas.addEventListener("touchmove", pointerMove, { passive: false });
  canvas.addEventListener("touchend", pointerUp);

  undoBtn.addEventListener("click", function () {
    if (state.active.length) {
      state.active.pop();
    } else if (state.sections.length) {
      state.sections.pop();
    }
    drawScene();
    show(hint, state.sections.length === 0 && state.active.length < 3);
    maybeShowContinue();
  });

  newSectionBtn.addEventListener("click", function () {
    closeActiveSection();
    drawScene();
    maybeShowContinue();
  });

  resetBtn.addEventListener("click", function () {
    state.sections = [];
    state.active = [];
    state.activeColour = null;
    show(coloursPanel, false);
    show(continueWrap, false);
    setStep(1);
    drawScene();
    show(hint, true);
  });

  continueBtn.addEventListener("click", function () {
    if (state.active.length >= 3) closeActiveSection();
    if (!state.sections.length) return;
    setStep(2);
    show(continueWrap, false);
    show(coloursPanel, true);
    if (!state.activeColour) {
      selectSwatch(COLOURS[0], swatchesEl.children[0]);
    }
    scrollBelowHeader(coloursPanel);
  });

  // ---------- colour swatches ----------

  COLOURS.forEach(function (c) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cs-swatch";
    btn.setAttribute("aria-label", c.name);
    var chip = document.createElement("span");
    chip.className = "cs-swatch-chip";
    chip.style.background = c.hex;
    var label = document.createElement("span");
    label.className = "cs-swatch-name";
    label.textContent = c.name;
    btn.appendChild(chip);
    btn.appendChild(label);
    btn.addEventListener("click", function () { selectSwatch(c, btn); });
    swatchesEl.appendChild(btn);
  });

  function selectSwatch(colour, btnEl) {
    state.activeColour = colour;
    Array.prototype.forEach.call(swatchesEl.children, function (el) {
      el.classList.toggle("is-active", el === btnEl);
    });
    if (quoteBtn) {
      var base = "../index.html#get-quote";
      quoteBtn.href = base;
      quoteBtn.textContent = "Get a Free Estimate for " + colour.name;
    }
    applyColour(colour);
  }

  // ---------- the actual recolour ----------

  function buildMask() {
    var mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    var mctx = mask.getContext("2d");
    mctx.fillStyle = "#fff";
    state.sections.forEach(function (poly) {
      if (poly.length < 3) return;
      mctx.beginPath();
      mctx.moveTo(poly[0].x, poly[0].y);
      for (var i = 1; i < poly.length; i++) mctx.lineTo(poly[i].x, poly[i].y);
      mctx.closePath();
      mctx.fill();
    });

    // Soften the traced edge so the recolour doesn't look pasted on —
    // drawImage-with-filter reliably blurs raster content in every engine
    // that supports canvas filters (mask fills don't blur cleanly on their own).
    var soft = document.createElement("canvas");
    soft.width = canvas.width;
    soft.height = canvas.height;
    var sctx = soft.getContext("2d");
    sctx.filter = "blur(" + Math.max(2, Math.round(canvas.width * 0.004)) + "px)";
    sctx.drawImage(mask, 0, 0);
    return sctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function applyColour(colour) {
    if (!state.sourceCanvas || !state.sections.length) return;
    var token = ++state.recolourToken;
    show(recolouring, true);
    state.showingOriginal = false;

    // Deferred a tick so the "recolouring…" state actually paints before
    // the main thread gets busy with the pixel loop.
    window.setTimeout(function () {
      if (token !== state.recolourToken) return; // a newer swatch tap won
      var maskData = buildMask();
      var srcCtx = state.sourceCanvas.getContext("2d");
      var src = srcCtx.getImageData(0, 0, canvas.width, canvas.height);
      var out = ctx.createImageData(canvas.width, canvas.height);

      var target = hexToRgb(colour.hex);
      var tHsl = rgbToHsl(target.r, target.g, target.b);

      var sd = src.data, md = maskData.data, od = out.data;
      for (var i = 0; i < sd.length; i += 4) {
        var weight = md[i] / 255; // mask alpha (soft edge already baked in)
        if (weight <= 0.004) {
          od[i] = sd[i]; od[i + 1] = sd[i + 1]; od[i + 2] = sd[i + 2]; od[i + 3] = 255;
          continue;
        }
        var hsl = rgbToHsl(sd[i], sd[i + 1], sd[i + 2]);
        // Keep most of the photo's own lightness (so shadows/glare survive)
        // but pull it 22% toward the target colour's natural tone, or a
        // very dark original roof stays dark under a light colour choice
        // and reads as "wrong shingle," not "same shingle, new colour."
        var l = hsl[2] * 0.78 + tHsl[2] * 0.22;
        var rgb = hslToRgb(tHsl[0], tHsl[1], l);

        od[i] = sd[i] + (rgb[0] - sd[i]) * weight;
        od[i + 1] = sd[i + 1] + (rgb[1] - sd[i + 1]) * weight;
        od[i + 2] = sd[i + 2] + (rgb[2] - sd[i + 2]) * weight;
        od[i + 3] = 255;
      }

      if (token !== state.recolourToken) return;
      ctx.putImageData(out, 0, 0);
      drawOutlinesOverResult();
      show(recolouring, false);
    }, 10);
  }

  function drawOutlinesOverResult() {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, canvas.width * 0.0015);
    state.sections.forEach(function (poly) {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---------- compare / download ----------

  compareBtn.addEventListener("mousedown", showOriginal);
  compareBtn.addEventListener("touchstart", showOriginal, { passive: true });
  compareBtn.addEventListener("mouseup", showRecoloured);
  compareBtn.addEventListener("mouseleave", showRecoloured);
  compareBtn.addEventListener("touchend", showRecoloured);

  function showOriginal() {
    if (!state.sourceCanvas) return;
    ctx.drawImage(state.sourceCanvas, 0, 0);
    state.sections.forEach(function (poly) { drawPolygon(poly, false); });
  }
  function showRecoloured() {
    if (state.activeColour) applyColour(state.activeColour);
  }

  downloadBtn.addEventListener("click", function () {
    var link = document.createElement("a");
    var name = state.activeColour ? state.activeColour.name.toLowerCase().replace(/\s+/g, "-") : "roof-colour";
    link.download = "your-roof-" + name + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  // ---------- entry points ----------

  drop.addEventListener("click", function () { fileInput.click(); });
  drop.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) loadImageFile(e.target.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (evt) {
    drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.add("is-drag"); });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.remove("is-drag"); });
  });
  drop.addEventListener("drop", function (e) {
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });
  sampleBtn.addEventListener("click", function () { loadImageUrl(SAMPLE_IMAGE, false); });
})();
