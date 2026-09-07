/* Mobile only. The five step film is scrubbed by scroll on desktop, which a
   phone cannot do, so each step here plays the slice of that same film which
   builds into it. The files are cut as palindromes, forward then back, so a
   plain loop bounces instead of cutting. Sources are attached on approach
   rather than up front, so five clips are never fetched at once. */
(function () {
  if (!window.matchMedia) return;
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var clips = document.querySelectorAll(".sys-clip");
  if (!clips.length || !("IntersectionObserver" in window)) return;

  function attach(v) {
    if (v.dataset.armed) return;
    v.dataset.armed = "1";
    var src = document.createElement("source");
    src.src = v.dataset.srcMp4;
    src.type = "video/mp4";
    v.appendChild(src);
    v.load();
  }

  function play(v) {
    var pr = v.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  Array.prototype.forEach.call(clips, function (v) {
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    /* The still underneath is the state this clip ends on, so hold it until
       there are frames to show and the swap has nothing to flicker through. */
    v.addEventListener("canplay", function () {
      var frame = v.parentNode;
      if (frame) frame.classList.add("clip-on");
      play(v);
    });
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { attach(v); play(v); }
        else { try { v.pause(); } catch (err) {} }
      });
    }, {rootMargin: "50% 0px"}).observe(v);
  });
})();
