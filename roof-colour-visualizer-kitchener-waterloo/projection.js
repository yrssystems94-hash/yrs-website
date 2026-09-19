// Roof Colour Studio — the projection engine.
//
// The job: take a real CertainTeed shingle photo and lay it onto a roof face
// in a customer's own photo so it looks like that roof, not like paint.
//
// Three things have to be true for that to read as real:
//   1. PERSPECTIVE. A roof face in a photo is a quadrilateral, not a
//      rectangle. The customer clicks its four corners and we solve the
//      homography (the 3x3 matrix that maps our flat shingle texture onto
//      that quad). Every pixel inside then gets its texture sample through
//      the inverse of that matrix, so courses converge exactly the way the
//      roof does.
//   2. LIGHT. The shingle photo is evenly lit in a studio; the customer's
//      roof has sun, shade, a dormer shadow. So we don't paste the texture —
//      we multiply it by how bright that pixel already was relative to the
//      face's own average. Shadows, glare and the dark side of a hip all
//      survive.
//   3. SCALE. Shingle courses have a real size. We work out how many courses
//      belong on the face from its size on screen, so a garage and a
//      two-storey wall don't end up with the same size shingles.
//
// Everything here is pure maths on pixel arrays — no WebGL, no server, and
// no dependency. It runs on the customer's own machine on their own photo.
(function (global) {
  "use strict";

  // How tall one shingle course should read, in screen pixels, on a photo
  // scaled to our 1400px working width.
  var DEFAULT_COURSE_PX = 34;

  // ---------------------------------------------------------------- matrix

  // Solve A·x = b for x by Gaussian elimination with partial pivoting.
  // Small fixed system (8x8), so clarity beats cleverness here.
  function solveLinear(A, b, n) {
    for (var col = 0; col < n; col++) {
      var pivot = col;
      for (var r = col + 1; r < n; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
      }
      if (Math.abs(A[pivot][col]) < 1e-10) return null; // degenerate quad
      var tmp = A[col]; A[col] = A[pivot]; A[pivot] = tmp;
      var tb = b[col]; b[col] = b[pivot]; b[pivot] = tb;

      for (var r2 = col + 1; r2 < n; r2++) {
        var f = A[r2][col] / A[col][col];
        if (f === 0) continue;
        for (var c = col; c < n; c++) A[r2][c] -= f * A[col][c];
        b[r2] -= f * b[col];
      }
    }
    var x = new Array(n);
    for (var i = n - 1; i >= 0; i--) {
      var sum = b[i];
      for (var j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
      x[i] = sum / A[i][i];
    }
    return x;
  }

  // Homography mapping the unit square (0,0)-(1,1) onto the four destination
  // corners, given in order: top-left, top-right, bottom-right, bottom-left.
  // Returns the 3x3 as a flat 9-array, or null if the quad is degenerate.
  function homographyFromUnitSquare(dst) {
    var srcPts = [[0, 0], [1, 0], [1, 1], [0, 1]];
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var u = srcPts[i][0], v = srcPts[i][1];
      var x = dst[i].x, y = dst[i].y;
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    var h = solveLinear(A, b, 8);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function invert3x3(m) {
    var a = m[0], b = m[1], c = m[2],
        d = m[3], e = m[4], f = m[5],
        g = m[6], h = m[7], i = m[8];
    var A =  (e * i - f * h), B = -(d * i - f * g), C =  (d * h - e * g);
    var det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    var id = 1 / det;
    return [
      A * id,                 -(b * i - c * h) * id,  (b * f - c * e) * id,
      B * id,                  (a * i - c * g) * id, -(a * f - c * d) * id,
      C * id,                 -(a * h - b * g) * id,  (a * e - b * d) * id,
    ];
  }

  // ------------------------------------------------------------ geometry

  // Put four clicked points into a consistent TL,TR,BR,BL order, so the
  // texture never lands mirrored or upside-down no matter which corner the
  // customer happened to click first or which way round they went.
  function orderQuad(pts) {
    var cx = 0, cy = 0, i;
    for (i = 0; i < 4; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= 4; cy /= 4;

    var byAngle = pts.slice().sort(function (p, q) {
      return Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx);
    });
    // atan2 starts at "east" and increases clockwise in screen coords
    // (y grows downward), so the run begins in the top-right quadrant.
    // Rotate so the point closest to the top-left corner leads.
    var best = 0, bestD = Infinity;
    for (i = 0; i < 4; i++) {
      var d = (byAngle[i].x - cx) + (byAngle[i].y - cy); // most negative = TL
      if (d < bestD) { bestD = d; best = i; }
    }
    return [
      byAngle[best],
      byAngle[(best + 1) % 4],
      byAngle[(best + 2) % 4],
      byAngle[(best + 3) % 4],
    ];
  }

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // How many shingle courses belong on this face. A CertainTeed Landmark
  // course shows about 5 5/8" of exposure and a shingle is 3' wide, so a
  // swatch photo covering roughly four courses is about 5.6x wider than tall
  // in real terms. We size from the face's on-screen height so a small garage
  // face doesn't get the same course size as a big two-storey face.
  function courseCountFor(quad, texAspect, targetCourseHeightPx) {
    var leftEdge = dist(quad[0], quad[3]);
    var rightEdge = dist(quad[1], quad[2]);
    var topEdge = dist(quad[0], quad[1]);
    var botEdge = dist(quad[2], quad[3]);
    var h = (leftEdge + rightEdge) / 2;
    var w = (topEdge + botEdge) / 2;
    if (h < 1 || w < 1) return { x: 1, y: 1 };

    // Course size on screen. Tuned by eye against real roof photos — see
    // the note on DEFAULT_COURSE_PX.
    targetCourseHeightPx = targetCourseHeightPx || DEFAULT_COURSE_PX;
    var repeatY = Math.max(1, Math.round(h / targetCourseHeightPx));
    // Keep the texture's own aspect so shingles don't stretch sideways.
    var repeatX = Math.max(1, Math.round((repeatY * (w / h)) / texAspect));
    return { x: repeatX, y: repeatY };
  }

  // ------------------------------------------------------------- lighting

  // Time-of-day presets. Each is a gain per channel plus a contrast term
  // applied around mid-grey — cheap, but enough to read as different light.
  var LIGHTING = {
    midday:  { gain: [1.00, 1.00, 1.00], contrast: 1.06, lift: 0.00 },
    overcast:{ gain: [0.96, 0.99, 1.06], contrast: 0.88, lift: 0.04 },
    golden:  { gain: [1.12, 1.01, 0.88], contrast: 1.10, lift: 0.02 },
  };

  function applyLighting(rgb, preset) {
    var p = LIGHTING[preset] || LIGHTING.midday;
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var v = rgb[i] / 255;
      v = v * p.gain[i];
      v = (v - 0.5) * p.contrast + 0.5;   // contrast around mid-grey
      v = v + p.lift * (1 - v);            // lift shadows without blowing highs
      out[i] = v < 0 ? 0 : v > 1 ? 255 : v * 255;
    }
    return out;
  }

  // ------------------------------------------------------------- the draw

  // Rasterise the quads into a soft-edged coverage mask.
  function buildMask(w, h, faces, featherPx) {
    var mask = document.createElement("canvas");
    mask.width = w; mask.height = h;
    var mctx = mask.getContext("2d");
    mctx.fillStyle = "#fff";
    faces.forEach(function (quad) {
      mctx.beginPath();
      mctx.moveTo(quad[0].x, quad[0].y);
      for (var i = 1; i < quad.length; i++) mctx.lineTo(quad[i].x, quad[i].y);
      mctx.closePath();
      mctx.fill();
    });

    // Blur via drawImage-with-filter: filling a path with a filter set does
    // not blur the fill in every engine, but redrawing the raster does.
    var soft = document.createElement("canvas");
    soft.width = w; soft.height = h;
    var sctx = soft.getContext("2d");
    sctx.filter = "blur(" + featherPx + "px)";
    sctx.drawImage(mask, 0, 0);
    return sctx.getImageData(0, 0, w, h);
  }

  /**
   * Project a shingle texture onto one or more roof faces.
   *
   * @param {Object} opts
   *   sourceCanvas  the customer's photo, already scaled to working size
   *   textureCanvas the shingle swatch photo
   *   faces         array of quads, each 4 points in image space
   *   lighting      "midday" | "overcast" | "golden"
   *   strength      0..1, how fully the shingle replaces the original roof
   * @returns {ImageData} the composited result, ready for putImageData
   */
  function project(opts) {
    var src = opts.sourceCanvas;
    var w = src.width, h = src.height;
    var sctx = src.getContext("2d");
    var srcData = sctx.getImageData(0, 0, w, h);

    var tex = opts.textureCanvas;
    var tw = tex.width, th = tex.height;
    var texData = tex.getContext("2d").getImageData(0, 0, tw, th);
    var texAspect = tw / th;

    var featherPx = Math.max(1.5, w * 0.0025);
    var maskData = buildMask(w, h, opts.faces, featherPx);

    var out = sctx.createImageData(w, h);
    var sd = srcData.data, md = maskData.data, od = out.data, td = texData.data;
    var strength = opts.strength == null ? 1 : opts.strength;
    var lighting = opts.lighting || "midday";

    // Start as a straight copy; only masked pixels get rewritten.
    od.set(sd);

    opts.faces.forEach(function (quad) {
      var H = homographyFromUnitSquare(quad);
      if (!H) return;
      var Hinv = invert3x3(H);
      if (!Hinv) return;
      var rep = courseCountFor(quad, texAspect, opts.courseHeightPx);

      // Bounding box of this face, clipped to the canvas.
      var minX = w, minY = h, maxX = 0, maxY = 0;
      quad.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      minX = Math.max(0, Math.floor(minX - featherPx * 2));
      minY = Math.max(0, Math.floor(minY - featherPx * 2));
      maxX = Math.min(w - 1, Math.ceil(maxX + featherPx * 2));
      maxY = Math.min(h - 1, Math.ceil(maxY + featherPx * 2));

      // Pass 1: mean luminance of the original inside this face, so we can
      // express each pixel as "brighter or darker than this roof's average"
      // rather than as an absolute value. That is what carries the shadows.
      var sum = 0, count = 0, x, y, idx;
      for (y = minY; y <= maxY; y++) {
        for (x = minX; x <= maxX; x++) {
          idx = (y * w + x) * 4;
          if (md[idx] < 8) continue;
          sum += 0.2126 * sd[idx] + 0.7152 * sd[idx + 1] + 0.0722 * sd[idx + 2];
          count++;
        }
      }
      if (!count) return;
      var meanL = Math.max(1, sum / count);

      // Pass 2: sample the texture through the inverse homography.
      for (y = minY; y <= maxY; y++) {
        for (x = minX; x <= maxX; x++) {
          idx = (y * w + x) * 4;
          var cover = md[idx] / 255;
          if (cover <= 0.004) continue;

          var px = x + 0.5, py = y + 0.5;
          var dn = Hinv[6] * px + Hinv[7] * py + Hinv[8];
          if (dn === 0) continue;
          var u = (Hinv[0] * px + Hinv[1] * py + Hinv[2]) / dn;
          var v = (Hinv[3] * px + Hinv[4] * py + Hinv[5]) / dn;
          // Outside the face proper (the feather skirt) — leave it be; the
          // mask alpha already tapers it.
          if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) continue;

          // Tile across the face, and mirror alternate courses so the seam
          // where the swatch photo repeats doesn't read as a stripe.
          var fu = u * rep.x, fv = v * rep.y;
          var tileU = fu - Math.floor(fu), tileV = fv - Math.floor(fv);
          if (Math.floor(fv) % 2 === 1) tileU = 1 - tileU;

          var tx = Math.min(tw - 1, Math.max(0, (tileU * tw) | 0));
          var ty = Math.min(th - 1, Math.max(0, (tileV * th) | 0));
          var tIdx = (ty * tw + tx) * 4;

          // The photo's own light, as a ratio around this face's average.
          var origL = 0.2126 * sd[idx] + 0.7152 * sd[idx + 1] + 0.0722 * sd[idx + 2];
          var ratio = origL / meanL;
          // Keep it in a sane band: a black shadow shouldn't go to zero and a
          // blown highlight shouldn't turn the shingle into a white blob.
          if (ratio < 0.45) ratio = 0.45;
          if (ratio > 1.85) ratio = 1.85;

          var lit = applyLighting(
            [td[tIdx] * ratio, td[tIdx + 1] * ratio, td[tIdx + 2] * ratio],
            lighting
          );

          var k = cover * strength;
          od[idx]     = sd[idx]     + (lit[0] - sd[idx])     * k;
          od[idx + 1] = sd[idx + 1] + (lit[1] - sd[idx + 1]) * k;
          od[idx + 2] = sd[idx + 2] + (lit[2] - sd[idx + 2]) * k;
          od[idx + 3] = 255;
        }
      }
    });

    return out;
  }

  global.YRSProjection = {
    project: project,
    orderQuad: orderQuad,
    homographyFromUnitSquare: homographyFromUnitSquare,
    invert3x3: invert3x3,
    LIGHTING_PRESETS: Object.keys(LIGHTING),
  };
})(window);
