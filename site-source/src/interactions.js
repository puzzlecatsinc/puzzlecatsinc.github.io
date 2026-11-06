// Ported from the owned live site's Webflow ix2 action lists (2026-11-02).
// No Webflow runtime is needed. See evidence/live-interactions.json and docs.
export function entranceMotion(reduced) {
  if (reduced.matches || !Element.prototype.animate || performance.now() > 2500) return;
  const active = new Set();
  const played = new WeakSet();
  const bounce = t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + .75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + .9375; }
    t -= 2.625 / d; return n * t * t + .984375;
  };
  const frames = Array.from({length:61}, (_, i) => {
    const t = i / 60;
    return {offset:t, transform:`translate3d(0,${-500 * (1 - bounce(t))}px,0)`, opacity:1 - (1 - t) ** 4};
  });
  const actors = [
    ['.site-header', 0], ['.hero-scene', 10], ['.hero h1', 300],
    ['.hero-copy > p', 500], ['.hero-actions', 700], ['.hero-art .stats', 800],
  ].map(([selector, delay]) => ({element:document.querySelector(selector), delay})).filter(x => x.element);
  function reveal({element, delay}) {
    if (played.has(element) || reduced.matches) return;
    played.add(element);
    if (element.contains(document.activeElement)) return;
    const animation = element.animate(frames, {duration:1000, delay, easing:'linear', fill:'backwards'});
    active.add(animation);
    animation.finished.catch(() => {}).finally(() => active.delete(animation));
    // A focus or click must never make someone wait for the entrance to finish.
    for (const event of ['focusin', 'pointerdown']) element.addEventListener(event, () => animation.cancel(), {once:true});
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const actor = actors.find(x => x.element === entry.target);
        reveal(actor); observer.unobserve(entry.target);
      }
    });
    actors.forEach(actor => observer.observe(actor.element));
    reduced.addEventListener('change', () => { if (reduced.matches) { observer.disconnect(); active.forEach(a => a.cancel()); } });
  } else actors.forEach(reveal);
  window.addEventListener('pagehide', () => active.forEach(a => a.cancel()));
}

export function phonePointerMotion(app, reduced) {
  // Webflow action list "a": VIEWPORT MOUSE_X, smoothing 50, resting state 50.
  // Only horizontal yaw is authored. Its MOUSE_Y action group is empty.
  const phone = app.phone;
  if (!phone) return {sync() {}, dispose() {}};
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let playing = false, enabled = false, frame = 0, previous = 0;
  let clientX = innerWidth / 2, target = .2, current = phone.rotation.y;
  const yaw = () => -.4 + Math.min(1, Math.max(0, clientX / Math.max(1, innerWidth))) * 1.2;
  function tick(now) {
    frame = 0;
    if (!enabled) return;
    const dt = previous ? Math.min(50, now - previous) : 1000 / 60;
    previous = now;
    current += (target - current) * (1 - .5 ** (dt / (1000 / 60)));
    if (Math.abs(target - current) < .0001) current = target;
    phone.rotation.y = current;
    if (current !== target) frame = requestAnimationFrame(tick);
    else previous = 0;
  }
  function schedule() { if (enabled && !frame) frame = requestAnimationFrame(tick); }
  function move(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    clientX = event.clientX; target = yaw(); schedule();
  }
  function leave(event) {
    if (event.relatedTarget !== null) return; // Leaving a canvas is not leaving the viewport.
    clientX = innerWidth / 2; target = .2; schedule();
  }
  function resize() { target = yaw(); schedule(); }
  function sync(value = playing) {
    playing = value;
    enabled = playing && fine.matches && !reduced.matches;
    if (!enabled) { cancelAnimationFrame(frame); frame = 0; previous = 0; return; }
    target = yaw(); schedule();
  }
  window.addEventListener('pointermove', move, {passive:true});
  window.addEventListener('pointerout', leave, {passive:true});
  window.addEventListener('resize', resize, {passive:true});
  const preferenceChanged = () => sync();
  fine.addEventListener('change', preferenceChanged);
  reduced.addEventListener('change', preferenceChanged);
  return {sync, dispose() {
    sync(false);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerout', leave);
    window.removeEventListener('resize', resize);
    fine.removeEventListener('change', preferenceChanged);
    reduced.removeEventListener('change', preferenceChanged);
  }};
}
