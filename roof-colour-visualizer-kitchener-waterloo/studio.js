// Roof Colour Studio — the app around the projection engine.
//
// Flow: load a photo -> click the four corners of each roof face -> pick a
// colour from the real CertainTeed range -> play with light, distance and a
// three-way comparison until you have a shortlist worth a site visit.
//
// The projection maths lives in projection.js; the colour range comes from
// colours.js, which is a port of Summit's own catalog so the website offers
// exactly what we quote. This file is the studio around them.
(function () {
  "use strict";

  var root = document.getElementById("stRoot");
  if (!root || typeof YRSProjection === "undefined") return;

  var MAX_EDGE = 1400;      // working resolution — caps the per-pixel cost
  var CORNERS_PER_FACE = 4; // a roof face is a quad; that's what gives us perspective
  var MAX_SHORTLIST = 3;
  var STREET_SCALE = 0.13;  // how far down we resample to fake curb distance

  var el = {
    upload: document.getElementById("stUpload"),
    drop: document.getElementById("stDrop"),
    file: document.getElementById("stFile"),
    sample: document.getElementById("stSample"),
    error: document.getElementById("stError"),
    studio: document.getElementById("stStudio"),
    stage: document.getElementById("stStage"),
    holder: document.getElementById("stHolder"),
    canvas: document.getElementById("stCanvas"),
    hint: document.getElementById("stHint"),
    hintText: document.getElementById("stHintText"),
    busy: document.getElementById("stBusy"),
    busyText: document.getElementById("stBusyText"),
    step: document.getElementById("stStep"),
    undo: document.getElementById("stUndo"),
    addFace: document.getElementById("stAddFace"),
    restart: document.getElementById("stRestart"),
    lightSeg: document.getElementById("stLight"),
    viewSeg: document.getElementById("stView"),
    compareBtn: document.getElementById("stCompareBtn"),
    brickBtn: document.getElementById("stBrickBtn"),
    rail: document.getElementById("stRail"),
    railScroll: document.getElementById("stRailScroll"),
    railSub: document.getElementById("stRailSub"),
    traySlots: document.getElementById("stTraySlots"),
    trayNote: document.getElementById("stTrayNote"),
    compare3Btn: document.getElementById("stCompare3"),
    foot: document.getElementById("stFoot"),
    footNote: document.getElementById("stFootNote"),
    download: document.getElementById("stDownload"),
    quote: document.getElementById("stQuote"),
  };

  var ctx = el.canvas.getContext("2d");

  var state = {
    source: null,       // the customer's photo at working size
    faces: [],          // completed quads, each 4 ordered points
    active: [],         // corners of the face being clicked now
    colour: null,       // the selected catalog colour
    texture: null,      // its decoded swatch photo, as a canvas
    lighting: "midday",
    view: "roof",       // "roof" | "street"
    rendered: null,     // ImageData of the current projection
    shortlist: [],
    compareMode: false,
    compareX: 0.5,
    brickFit: null,     // array of colour keys that suit the sampled brick
    token: 0,           // guards against a stale async render landing late
    textures: {},       // decoded swatch cache, by colour key
  };

  // ------------------------------------------------------------- helpers

  function show(node, on) { if (node) node.hidden = !on; }

  function setBusy(on, text) {
    if (text && el.busyText) el.busyText.textContent = text;
    el.busy.classList.toggle("is-on", !!on);
  }

  function setHint(html) {
    if (!html) { show(el.hint, false); return; }
    el.hintText.innerHTML = html;
    show(el.hint, true);
  }

  function showError(msg) {
    el.error.textContent = msg;
    show(el.error, true);
  }

  function canvasPoint(evt) {
    var r = el.canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) * (el.canvas.width / r.width),
      y: (evt.clientY - r.top) * (el.canvas.height / r.height),
    };
  }

  function imgToCanvas(img, maxEdge) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var s = Math.min(1, maxEdge / Math.max(w, h));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("could not decode")); };
      img.src = src;
    });
  }

  // ------------------------------------------------------- photo loading

  function handleFile(file) {
    show(el.error, false);
    if (!file) return;
    if (file.type && file.type.indexOf("image/") !== 0) {
      showError("That file isn't a photo. Try a JPG or PNG from your computer.");
      return;
    }
    var url = URL.createObjectURL(file);
    loadImage(url)
      .then(function (img) { URL.revokeObjectURL(url); installPhoto(img); })
      .catch(function () {
        URL.revokeObjectURL(url);
        // Never fail silently here — a dead click reads as a broken website.
        showError("We couldn't open that photo. Some phone formats (like HEIC) don't work in browsers — try saving it as a JPG, or pick a different picture.");
      });
  }

  function installPhoto(img) {
    state.source = imgToCanvas(img, MAX_EDGE);
    state.faces = [];
    state.active = [];
    state.rendered = null;
    state.brickFit = null;
    state.compareMode = false;
    el.canvas.width = state.source.width;
    el.canvas.height = state.source.height;

    show(el.upload, false);
    show(el.studio, true);
    show(el.foot, true);
    updateStep();
    drawTrace();
    fitStage();
  }

  // Keep the photo fully visible in the stage without letterboxing oddly.
  function fitStage() {
    var avail = el.stage.clientHeight - 24;
    if (avail > 120) el.holder.style.maxHeight = avail + "px";
    el.canvas.style.maxHeight = avail > 120 ? avail + "px" : "";
  }
  window.addEventListener("resize", fitStage);

  // ------------------------------------------------------------- tracing

  function updateStep() {
    var n = state.faces.length;
    if (!n && state.active.length === 0) {
      el.step.textContent = "Step 1 — outline a roof face";
      setHint("Click the <b>four corners</b> of one roof face, going around its edge.");
    } else if (state.active.length > 0) {
      var left = CORNERS_PER_FACE - state.active.length;
      el.step.textContent = "Step 1 — " + left + " corner" + (left === 1 ? "" : "s") + " to go";
      setHint("Keep going &mdash; <b>" + left + " more corner" + (left === 1 ? "" : "s") + "</b> on this face.");
    } else {
      el.step.textContent = "Step 2 — pick a colour";
      setHint(n === 1
        ? "Now pick a colour &rarr;&nbsp; or <b>add another roof face</b> if the house has more than one."
        : n + " faces outlined. Pick a colour &rarr; or add another face.");
    }
    el.undo.disabled = !state.active.length && !state.faces.length;
    el.addFace.disabled = state.active.length > 0;
    el.compareBtn.disabled = !state.rendered;
    el.brickBtn.disabled = !state.faces.length;
    el.download.disabled = !state.rendered;
    el.compare3Btn.disabled = state.shortlist.length < 2;
    el.railSub.textContent = state.faces.length
      ? "49 colours we actually install"
      : "Outline a roof face first";
  }

  function drawTrace() {
    if (!state.source) return;
    ctx.drawImage(state.source, 0, 0);
    var w = el.canvas.width;
    var r = Math.max(5, w * 0.006);
    var lw = Math.max(2, w * 0.0026);

    function drawPoly(pts, closed) {
      if (!pts.length) return;
      ctx.save();
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.lineWidth = lw;
      ctx.strokeStyle = "#C9962E";
      ctx.fillStyle = "rgba(201,150,46,0.15)";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (closed) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
      pts.forEach(function (p) {
        ctx.beginPath();
        ctx.fillStyle = "#C9962E";
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = lw * 0.8;
        ctx.strokeStyle = "#0b0e13";
        ctx.stroke();
      });
      ctx.restore();
    }

    state.faces.forEach(function (f) { drawPoly(f, true); });
    drawPoly(state.active, false);
  }

  el.canvas.addEventListener("click", function (evt) {
    if (!state.source || state.compareMode) return;
    if (state.brickPicking) { pickBrick(canvasPoint(evt)); return; }

    state.active.push(canvasPoint(evt));
    if (state.active.length === CORNERS_PER_FACE) {
      state.faces.push(YRSProjection.orderQuad(state.active));
      state.active = [];
      if (state.colour) { render(); } else { drawTrace(); }
    } else {
      drawTrace();
    }
    updateStep();
  });

  el.undo.addEventListener("click", function () {
    if (state.active.length) state.active.pop();
    else if (state.faces.length) state.faces.pop();
    if (state.faces.length && state.colour) render(); else { state.rendered = null; drawTrace(); }
    updateStep();
  });

  el.addFace.addEventListener("click", function () {
    state.active = [];
    setHint("Click the <b>four corners</b> of the next roof face.");
    el.step.textContent = "Step 1 — outline a roof face";
  });

  el.restart.addEventListener("click", function () {
    state.faces = []; state.active = []; state.rendered = null;
    state.compareMode = false; state.brickFit = null; state.brickPicking = false;
    el.holder.classList.remove("is-compare", "is-done");
    removeCompareUi();
    drawTrace();
    renderRail();
    updateStep();
  });

  // ------------------------------------------------------------ the render

  function textureFor(colour) {
    if (state.textures[colour.key]) return Promise.resolve(state.textures[colour.key]);
    return loadImage("../" + colour.image).then(function (img) {
      var c = imgToCanvas(img, 720);
      state.textures[colour.key] = c;
      return c;
    });
  }

  function render(opts) {
    opts = opts || {};
    if (!state.source || !state.faces.length || !state.colour) return Promise.resolve();
    var token = ++state.token;
    setBusy(true, "Laying " + state.colour.name + "…");

    return textureFor(state.colour)
      .then(function (tex) {
        if (token !== state.token) return;
        var data = YRSProjection.project({
          sourceCanvas: state.source,
          textureCanvas: tex,
          faces: state.faces,
          lighting: state.lighting,
          strength: 1,
        });
        if (token !== state.token) return;
        state.rendered = data;
        if (opts.sweep) sweepIn(data); else paint(data);
        setBusy(false);
        updateStep();
      })
      .catch(function () {
        if (token !== state.token) return;
        setBusy(false);
        showError("That colour's sample image didn't load. Try another, or reload the page.");
      });
  }

  // Paint the finished projection, optionally only above a horizontal line
  // (used by the sweep) and optionally only left of a vertical one (compare).
  function paint(data, revealFromBottom, splitX) {
    ctx.drawImage(state.source, 0, 0);
    var h = el.canvas.height, w = el.canvas.width;
    var tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    tmp.getContext("2d").putImageData(data, 0, 0);

    if (revealFromBottom != null) {
      // Shingles go on from the eave upward, so the new roof arrives that way.
      var top = Math.round(h * (1 - revealFromBottom));
      ctx.drawImage(tmp, 0, top, w, h - top, 0, top, w, h - top);
    } else if (splitX != null) {
      // New roof goes on the RIGHT of the handle so the wipe reads the way
      // the tags do: "Now" on the left, "New" on the right.
      var sx = Math.round(w * splitX);
      if (sx < w) ctx.drawImage(tmp, sx, 0, w - sx, h, sx, 0, w - sx, h);
    } else {
      ctx.drawImage(tmp, 0, 0);
    }

    if (state.view === "street") applyStreetView();
  }

  function sweepIn(data) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { paint(data); return; }
    var start = performance.now();
    var DURATION = 750;
    var token = state.token;
    (function step(now) {
      if (token !== state.token) return;
      var t = Math.min(1, (now - start) / DURATION);
      var eased = 1 - Math.pow(1 - t, 3);
      paint(data, eased);
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  // Granules average out at distance — that's why a roof reads lighter from
  // the street than the sample does in your hand. Resampling through a small
  // canvas reproduces exactly that averaging.
  function applyStreetView() {
    var w = el.canvas.width, h = el.canvas.height;
    var small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w * STREET_SCALE));
    small.height = Math.max(1, Math.round(h * STREET_SCALE));
    var sctx = small.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(el.canvas, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
  }

  function repaint() {
    if (state.rendered) paint(state.rendered);
    else { drawTrace(); if (state.view === "street") applyStreetView(); }
  }

  // ------------------------------------------------------------- the rail

  function allColours() {
    var out = [];
    YRS_COLOURS.forEach(function (line) {
      line.colors.forEach(function (c) { out.push(c); });
    });
    return out;
  }

  function renderRail() {
    el.railScroll.innerHTML = "";
    YRS_COLOURS.forEach(function (line) {
      var h = document.createElement("div");
      h.className = "st-line-title";
      h.textContent = line.brand.replace("CertainTeed ", "");
      el.railScroll.appendChild(h);

      var grid = document.createElement("div");
      grid.className = "st-swatches";
      line.colors.forEach(function (c) {
        grid.appendChild(swatchNode(c, line));
      });
      el.railScroll.appendChild(grid);
    });
  }

  function swatchNode(colour, line) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "st-sw";
    btn.setAttribute("aria-label", colour.name + ", " + line.brand);
    if (state.colour && state.colour.key === colour.key && state.colour.line === line.key) {
      btn.classList.add("is-on");
    }
    if (state.shortlist.some(function (s) { return s.key === colour.key; })) {
      btn.classList.add("is-starred");
    }

    var img = document.createElement("img");
    img.className = "st-sw-img";
    img.loading = "lazy";
    img.alt = "";
    img.src = "../" + colour.image;
    img.style.background = colour.hex;
    btn.appendChild(img);

    if (state.brickFit && state.brickFit.indexOf(colour.key) !== -1) {
      var fit = document.createElement("span");
      fit.className = "st-sw-fit";
      fit.textContent = "Suits brick";
      btn.appendChild(fit);
    }

    var star = document.createElement("span");
    star.className = "st-sw-star";
    star.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 6.6 7 .7-5.2 4.8 1.5 7-6.3-3.6L5.7 21l1.5-7L2 9.3l7-.7z"/></svg>';
    star.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleShortlist(colour, line);
    });
    btn.appendChild(star);

    var name = document.createElement("span");
    name.className = "st-sw-name";
    name.textContent = colour.name.replace("Max Def ", "");
    btn.appendChild(name);

    btn.addEventListener("click", function () { selectColour(colour, line); });
    return btn;
  }

  function selectColour(colour, line) {
    if (!state.faces.length) {
      setHint("Outline a roof face first &mdash; click its <b>four corners</b>.");
      return;
    }
    state.colour = { key: colour.key, name: colour.name, hex: colour.hex, image: colour.image, line: line.key, brand: line.brand };
    exitCompare();
    renderRail();
    el.footNote.innerHTML = 'Showing <span class="st-picked">' + colour.name + "</span> &mdash; " + line.brand +
      ". Preview colours approximate the real granule blend; we bring physical samples on site to confirm.";
    el.quote.textContent = "Get a Free Estimate for " + colour.name;
    render({ sweep: true });
  }

  // ---------------------------------------------------------- shortlist

  function toggleShortlist(colour, line) {
    var i = -1;
    state.shortlist.forEach(function (s, idx) { if (s.key === colour.key) i = idx; });
    if (i >= 0) {
      state.shortlist.splice(i, 1);
    } else {
      if (state.shortlist.length >= MAX_SHORTLIST) {
        el.trayNote.textContent = "Three is the limit — remove one first.";
        return;
      }
      state.shortlist.push({ key: colour.key, name: colour.name, image: colour.image, hex: colour.hex, line: line.key, brand: line.brand });
    }
    renderTray();
    renderRail();
    updateStep();
  }

  function renderTray() {
    el.traySlots.innerHTML = "";
    for (var i = 0; i < MAX_SHORTLIST; i++) {
      var slot = document.createElement("div");
      slot.className = "st-slot";
      var item = state.shortlist[i];
      if (item) {
        slot.classList.add("is-filled");
        var img = document.createElement("img");
        img.src = "../" + item.image;
        img.alt = item.name;
        slot.appendChild(img);
        var x = document.createElement("button");
        x.className = "st-slot-x";
        x.type = "button";
        x.innerHTML = "&times;";
        x.setAttribute("aria-label", "Remove " + item.name);
        (function (key) {
          x.addEventListener("click", function () {
            state.shortlist = state.shortlist.filter(function (s) { return s.key !== key; });
            renderTray(); renderRail(); updateStep();
          });
        })(item.key);
        slot.appendChild(x);
      }
      el.traySlots.appendChild(slot);
    }
    el.trayNote.textContent = state.shortlist.length
      ? state.shortlist.length + " of 3 shortlisted"
      : "Star a colour to shortlist it";
    el.compare3Btn.disabled = state.shortlist.length < 2;
  }

  // Bounding box of every outlined face, padded for context and clamped to
  // the photo. Used by the side-by-side comparison.
  function roofCrop() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.faces.forEach(function (f) {
      f.forEach(function (pt) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });
    var w = state.source.width, h = state.source.height;
    if (!isFinite(minX)) return { x: 0, y: 0, w: w, h: h };
    var padX = (maxX - minX) * 0.18, padY = (maxY - minY) * 0.18;
    var x0 = Math.max(0, Math.floor(minX - padX));
    var y0 = Math.max(0, Math.floor(minY - padY));
    var x1 = Math.min(w, Math.ceil(maxX + padX));
    var y1 = Math.min(h, Math.ceil(maxY + padY));
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  // ------------------------------------------------- compare three at once

  el.compare3Btn.addEventListener("click", function () {
    if (state.shortlist.length < 2 || !state.faces.length) return;
    openCompare3();
  });

  function openCompare3() {
    var wrap = document.createElement("div");
    wrap.className = "st-compare3";
    wrap.id = "stCompare3Panel";

    var head = document.createElement("div");
    head.className = "st-compare3-head";
    head.innerHTML = "<h4>Your shortlist, side by side</h4>";
    var close = document.createElement("button");
    close.className = "st-gbtn";
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", function () { wrap.remove(); });
    head.appendChild(close);
    wrap.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "st-compare3-grid";
    grid.style.gridTemplateColumns = "repeat(" + state.shortlist.length + ", 1fr)";
    wrap.appendChild(grid);
    el.stage.appendChild(wrap);

    setBusy(true, "Rendering your shortlist…");
    // Compare the roof, not the driveway. Three 16:9 photos side by side are
    // postage stamps; cropping to the outlined faces (plus a margin for
    // context) fills the same space with the part actually being judged.
    var crop = roofCrop();

    var jobs = state.shortlist.map(function (item) {
      var cell = document.createElement("div");
      cell.className = "st-c3-cell";
      var cv = document.createElement("canvas");
      cv.width = crop.w; cv.height = crop.h;
      cell.appendChild(cv);
      var nm = document.createElement("div");
      nm.className = "st-c3-name";
      nm.textContent = item.name;
      cell.appendChild(nm);
      grid.appendChild(cell);

      return textureFor(item).then(function (tex) {
        var data = YRSProjection.project({
          sourceCanvas: state.source,
          textureCanvas: tex,
          faces: state.faces,
          lighting: state.lighting,
          strength: 1,
        });
        var full = document.createElement("canvas");
        full.width = state.source.width; full.height = state.source.height;
        var fc = full.getContext("2d");
        fc.drawImage(state.source, 0, 0);
        var tmp = document.createElement("canvas");
        tmp.width = full.width; tmp.height = full.height;
        tmp.getContext("2d").putImageData(data, 0, 0);
        fc.drawImage(tmp, 0, 0);
        cv.getContext("2d").drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      });
    });

    Promise.all(jobs).then(function () { setBusy(false); })
      .catch(function () { setBusy(false); });
  }

  // ------------------------------------------------- drag-to-compare split

  el.compareBtn.addEventListener("click", function () {
    if (!state.rendered) return;
    state.compareMode ? exitCompare() : enterCompare();
  });

  function enterCompare() {
    state.compareMode = true;
    state.compareX = 0.5;
    el.holder.classList.add("is-compare");
    el.compareBtn.classList.add("is-primary");
    el.compareBtn.textContent = "Done comparing";
    setHint("Drag left and right to wipe between the old roof and the new one.");
    buildCompareUi();
    paint(state.rendered, null, state.compareX);
  }

  function exitCompare() {
    if (!state.compareMode) return;
    state.compareMode = false;
    el.holder.classList.remove("is-compare");
    el.compareBtn.classList.remove("is-primary");
    el.compareBtn.textContent = "Compare before / after";
    removeCompareUi();
    if (state.rendered) paint(state.rendered);
    updateStep();
  }

  var compareUi = null;
  function buildCompareUi() {
    removeCompareUi();
    compareUi = document.createElement("div");
    compareUi.innerHTML =
      '<div class="st-compare-line" id="stCmpLine">' +
        '<div class="st-compare-grip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l-4 6 4 6M15 6l4 6-4 6"/></svg></div>' +
      "</div>" +
      '<span class="st-compare-tag is-before">Now</span>' +
      '<span class="st-compare-tag is-after">New</span>';
    while (compareUi.firstChild) el.holder.appendChild(compareUi.firstChild);
    positionCompareLine();

    el.holder.addEventListener("pointermove", onComparePointer);
    el.holder.addEventListener("pointerdown", onComparePointer);
  }

  function removeCompareUi() {
    var line = document.getElementById("stCmpLine");
    if (line) line.remove();
    Array.prototype.slice.call(el.holder.querySelectorAll(".st-compare-tag"))
      .forEach(function (n) { n.remove(); });
    el.holder.removeEventListener("pointermove", onComparePointer);
    el.holder.removeEventListener("pointerdown", onComparePointer);
    compareUi = null;
  }

  function onComparePointer(evt) {
    if (!state.compareMode) return;
    var r = el.canvas.getBoundingClientRect();
    var x = (evt.clientX - r.left) / r.width;
    state.compareX = Math.max(0, Math.min(1, x));
    positionCompareLine();
    paint(state.rendered, null, state.compareX);
  }

  function positionCompareLine() {
    var line = document.getElementById("stCmpLine");
    if (!line) return;
    line.style.left = (state.compareX * 100) + "%";
  }

  // ------------------------------------------------------ light & distance

  el.lightSeg.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.lighting = b.getAttribute("data-light");
    Array.prototype.forEach.call(el.lightSeg.querySelectorAll("button"), function (n) {
      n.classList.toggle("is-on", n === b);
    });
    if (state.colour && state.faces.length) render();
  });

  el.viewSeg.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.view = b.getAttribute("data-view");
    Array.prototype.forEach.call(el.viewSeg.querySelectorAll("button"), function (n) {
      n.classList.toggle("is-on", n === b);
    });
    repaint();
  });

  // -------------------------------------------------------- brick matcher

  el.brickBtn.addEventListener("click", function () {
    state.brickPicking = true;
    setHint("Click a patch of <b>your brick or siding</b> and we'll flag the colours that suit it.");
    el.brickBtn.classList.add("is-primary");
  });

  function pickBrick(pt) {
    state.brickPicking = false;
    el.brickBtn.classList.remove("is-primary");

    // Average a small patch rather than one pixel — brick is mottled, and a
    // single pixel could land on a mortar line and call the house grey.
    var R = Math.max(6, Math.round(el.canvas.width * 0.012));
    var sctx = state.source.getContext("2d");
    var x0 = Math.max(0, Math.round(pt.x) - R), y0 = Math.max(0, Math.round(pt.y) - R);
    var w = Math.min(state.source.width - x0, R * 2);
    var h = Math.min(state.source.height - y0, R * 2);
    if (w <= 0 || h <= 0) return;
    var d = sctx.getImageData(x0, y0, w, h).data;
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    r /= n; g /= n; b /= n;

    state.brickFit = scoreAgainstBrick(r, g, b);
    renderRail();
    setHint("Flagged <b>" + state.brickFit.length + " colours</b> that sit well against that brick. " +
      "Warm brick suits warm-neutral blends; grey and stone open up the greys.");
  }

  // Grounded in what actually goes wrong on a roof: against warm red-brown
  // brick, cool greys can read cold or faintly purple under overcast light,
  // which is most of our winter. So we score warmth agreement, not raw
  // colour distance — a roof is never meant to match the brick, just sit
  // with it.
  function scoreAgainstBrick(r, g, b) {
    var brickWarmth = (r - b) / 255;        // >0 warm, ~0 neutral, <0 cool
    var scored = [];
    allColours().forEach(function (c) {
      var cr = parseInt(c.hex.slice(1, 3), 16);
      var cg = parseInt(c.hex.slice(3, 5), 16);
      var cb = parseInt(c.hex.slice(5, 7), 16);
      var colWarmth = (cr - cb) / 255;
      var lum = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;

      var score = 0;
      // Warmth should agree, loosely.
      score -= Math.abs(colWarmth - brickWarmth * 0.75) * 3;
      // A roof that's lighter than the walls looks like a mistake; keep it
      // in the darker half unless the brick itself is very dark.
      var brickLum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum > brickLum + 0.06) score -= (lum - brickLum) * 2.2;
      // Mid-dark roofs are the safe centre of the range.
      score -= Math.abs(lum - 0.32) * 0.8;

      scored.push({ key: c.key, score: score });
    });
    scored.sort(function (a, b2) { return b2.score - a.score; });
    return scored.slice(0, 6).map(function (s) { return s.key; });
  }

  // ----------------------------------------------------------- downloads

  el.download.addEventListener("click", function () {
    if (!state.rendered) return;
    try {
      var link = document.createElement("a");
      var nm = state.colour ? state.colour.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "roof";
      link.download = "my-roof-" + nm + ".png";
      link.href = el.canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      showError("Your browser blocked the download. Right-click the picture and choose Save image instead.");
    }
  });

  // ------------------------------------------------------------ entry ui

  el.drop.addEventListener("click", function () { el.file.click(); });
  el.drop.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.file.click(); }
  });
  el.file.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (n) {
    el.drop.addEventListener(n, function (e) { e.preventDefault(); el.drop.classList.add("is-drag"); });
  });
  ["dragleave", "drop"].forEach(function (n) {
    el.drop.addEventListener(n, function (e) { e.preventDefault(); el.drop.classList.remove("is-drag"); });
  });
  el.drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  el.sample.addEventListener("click", function () {
    show(el.error, false);
    loadImage("../images/finished-reroof.jpg")
      .then(installPhoto)
      .catch(function () { showError("The sample photo didn't load. Check your connection and try again."); });
  });

  renderRail();
  renderTray();
  updateStep();
})();
