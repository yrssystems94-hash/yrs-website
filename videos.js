// Autoplay real work videos (muted, looped, in-view only) when the
// connection looks fast enough; otherwise leave them as click-to-play
// so nobody on a slow/metered connection gets an unwanted download.
(function () {
  function hasGoodConnection() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return true; // no signal available (e.g. Safari) — assume fine
    if (conn.saveData) return false;
    if (conn.effectiveType && /2g|3g/.test(conn.effectiveType)) return false;
    return true;
  }

  var videos = document.querySelectorAll("video[data-autoplay]");
  if (!videos.length || !hasGoodConnection()) return;

  videos.forEach(function (v) {
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
  });

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.play().catch(function () {});
        } else {
          entry.target.pause();
        }
      });
    },
    { threshold: 0.5 }
  );

  videos.forEach(function (v) {
    io.observe(v);
  });
})();
