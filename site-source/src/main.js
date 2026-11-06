import { entranceMotion, phonePointerMotion } from './interactions.js';
// Progressive enhancement: site-owned artwork, with independent user,
// visibility and motion-preference state. The page never depends on 3D loading.
document.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const connection = navigator.connection;
const constrained = () => connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
const LOAD_TIMEOUT_MS = 20_000;
entranceMotion(reduced);

for (const scene of document.querySelectorAll('[data-scene]')) {
  const button = scene.querySelector('button');
  const status = scene.querySelector('[role=status]');
  let app, candidate, pointerMotion, loading = false, playing = false, attempt = 0;
  let userPaused = false, motionOptIn = false, pageSuspended = false;
  const visible = () => {
    const rect = scene.getBoundingClientRect();
    return !pageSuspended && !document.hidden && rect.bottom > 0 && rect.top < innerHeight;
  };
  const motionAllowed = () => motionOptIn || (!reduced.matches && !constrained());
  function updatePlayback() {
    const shouldPlay = visible() && !userPaused && motionAllowed();
    // A load can finish while the scene is offscreen or the tab is hidden.
    if (candidate && !shouldPlay) candidate.stop();
    if (!app) return;
    if (shouldPlay !== playing) {
      if (shouldPlay) app.play(); else app.stop();
      playing = shouldPlay;
    }
    pointerMotion?.sync(playing);
    scene.dataset.playback = playing ? 'playing' : 'paused';
    button.textContent = playing ? 'Pause 3D' : 'Resume 3D';
    button.setAttribute('aria-pressed', String(playing));
    status.textContent = playing ? '3D artwork is playing.' : '3D artwork is paused. Choose Resume 3D to play.';
  }
  async function start(explicit = false) {
    if (loading) return;
    if (explicit) {
      userPaused = false;
      motionOptIn = true; // A deliberate button press can opt into optional motion.
    }
    if (app) { updatePlayback(); return; }
    if (!explicit && !motionAllowed()) return;
    const current = ++attempt;
    let instance, deadline;
    loading = true;
    scene.classList.add('loading');
    scene.dataset.playback = 'loading';
    scene.setAttribute('aria-busy', 'true');
    button.textContent = 'Loading 3D…';
    button.disabled = true;
    status.textContent = 'Loading optional 3D artwork. The still image and page remain available.';
    try {
      const work = (async () => {
        const { createArtwork } = await import('./native-artwork.js');
        if (attempt !== current) return;
        instance = await createArtwork(scene.querySelector('canvas'), scene.dataset.scene);
        if (attempt !== current) { instance.dispose(); return; }
        candidate = instance;
      })();
      await Promise.race([work, new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('3D load deadline exceeded')), LOAD_TIMEOUT_MS);
      })]);
      if (attempt !== current) return;
      app = instance;
      candidate = undefined;
      // Synchronize from a known paused state after asynchronous loading.
      app.stop();
      playing = false;
      if (scene.classList.contains('hero-scene')) pointerMotion = phonePointerMotion(app, reduced);
      scene.querySelector('canvas').addEventListener('artwork-unavailable', () => {
        pointerMotion?.dispose(); pointerMotion = undefined;
        app?.dispose(); app = undefined; playing = false;
        scene.classList.remove('loaded'); scene.dataset.playback = 'unavailable';
        button.textContent = 'Try 3D again'; button.setAttribute('aria-pressed', 'false');
        status.textContent = '3D artwork is unavailable. The still image remains available. You can try again.';
        const canvas = scene.querySelector('canvas'); canvas.replaceWith(canvas.cloneNode(false));
      }, {once:true});
      scene.classList.add('loaded');
      updatePlayback();
    } catch {
      if (attempt !== current) return;
      ++attempt; // Late completion cannot revive a timed-out or replaced canvas.
      pointerMotion?.dispose();
      pointerMotion = undefined;
      instance?.dispose();
      candidate = undefined;
      app = undefined;
      scene.classList.remove('loaded');
      const canvas = scene.querySelector('canvas');
      canvas.replaceWith(canvas.cloneNode(false));
      scene.dataset.playback = 'unavailable';
      button.textContent = 'Try 3D again';
      button.setAttribute('aria-pressed', 'false');
      status.textContent = '3D artwork is unavailable. The still image remains available. You can try again.';
    } finally {
      clearTimeout(deadline);
      loading = false;
      button.disabled = false;
      scene.classList.remove('loading');
      scene.setAttribute('aria-busy', 'false');
    }
  }
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    if (!app) { start(true); return; }
    if (playing) userPaused = true;
    else { userPaused = false; motionOptIn = true; }
    updatePlayback();
  });
  if ('IntersectionObserver' in window) {
    const preload = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && motionAllowed()) start();
    }, { rootMargin: '100px' });
    preload.observe(scene);
    new IntersectionObserver(updatePlayback).observe(scene);
  }
  reduced.addEventListener('change', () => {
    if (reduced.matches) motionOptIn = false;
    updatePlayback();
    if (visible() && motionAllowed() && !app) start();
  });
  document.addEventListener('visibilitychange', updatePlayback);
  window.addEventListener('pagehide', () => { pageSuspended = true; updatePlayback(); });
  window.addEventListener('pageshow', () => { pageSuspended = false; updatePlayback(); });
}
