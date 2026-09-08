const $ = (id) => document.getElementById(id);
const manualDefinitions = [
  ['launch', 'Game loads from cold start with no blank/black screen.'],
  ['leftRight', 'Swipe left/right changes exactly one rail in the expected screen direction.'],
  ['jump', 'Swipe up clears a normal jump barrier with comfortable visual clearance.'],
  ['duck', 'Swipe down/duck clears an overhead gate without accidental jump.'],
  ['junction', 'Diagonal junction captures/follows the authored rail without early lateral movement.'],
  ['audio', 'Pickup SFX and music play after the first user gesture; mixer controls work.'],
  ['pause', 'Pause/resume works and backgrounding the app/tab does not advance the run.'],
  ['offline', 'Installed/PWA build reloads offline after one online warm-up.'],
  ['multiplayer', 'Two real devices can match/join, see ghost/rank state and finish a race.'],
  ['thermal', '10+ minute run remains playable without severe thermal throttling or repeated tab reloads.'],
];
const state = {
  generatedAt: '', url: location.href, userAgent: navigator.userAgent,
  platform: navigator.userAgentData?.platform || navigator.platform || '',
  viewport: {}, input: {}, display: {}, webgl: {}, pwa: {}, network: {},
  benchmark: null, manual: {}, touchProbe: { events: 0, maxPointers: 0, maxTravelPx: 0 },
};
function webglInfo() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' }) || canvas.getContext('webgl');
  if (!gl) return { supported: false };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    supported: true, version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}
async function pwaInfo() {
  let serviceWorker = 'unsupported';
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      serviceWorker = registration ? (navigator.serviceWorker.controller ? 'controlled' : 'registered') : 'not-registered';
    } catch { serviceWorker = 'error'; }
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return { serviceWorker, standalone };
}
function refreshBase() {
  state.generatedAt = new Date().toISOString();
  state.viewport = {
    width: innerWidth, height: innerHeight, visualWidth: visualViewport?.width || innerWidth,
    visualHeight: visualViewport?.height || innerHeight,
    orientation: screen.orientation?.type || (innerHeight >= innerWidth ? 'portrait' : 'landscape'),
  };
  state.input = { maxTouchPoints: navigator.maxTouchPoints || 0, coarsePointer: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches };
  state.display = { devicePixelRatio, screenWidth: screen.width, screenHeight: screen.height, colorDepth: screen.colorDepth };
  state.network = { online: navigator.onLine, effectiveType: navigator.connection?.effectiveType || 'unknown', downlinkMbps: navigator.connection?.downlink ?? null, saveData: navigator.connection?.saveData ?? null };
  state.webgl = webglInfo();
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderCards() {
  const checks = [
    ['VIEWPORT', `${state.viewport.width}×${state.viewport.height} · ${state.viewport.orientation}`, state.viewport.height >= state.viewport.width ? 'pass' : 'warn'],
    ['TOUCH', `${state.input.maxTouchPoints} points · ${state.input.coarsePointer ? 'coarse' : 'fine'}`, state.input.maxTouchPoints > 0 ? 'pass' : 'warn'],
    ['DPR', String(state.display.devicePixelRatio), state.display.devicePixelRatio <= 4 ? 'pass' : 'warn'],
    ['WEBGL', state.webgl.supported ? String(state.webgl.renderer || 'supported') : 'NOT AVAILABLE', state.webgl.supported ? 'pass' : 'fail'],
    ['PWA', `${state.pwa.serviceWorker || 'checking'}${state.pwa.standalone ? ' · standalone' : ''}`, state.pwa.serviceWorker === 'controlled' ? 'pass' : 'warn'],
    ['NETWORK', state.network.online ? `ONLINE · ${state.network.effectiveType}` : 'OFFLINE', state.network.online ? 'pass' : 'warn'],
  ];
  $('autoChecks').innerHTML = checks.map(([label,value,status]) => `<article class="card"><span>${label}</span><b class="${status}">${escapeHtml(value)}</b></article>`).join('');
}
function renderManual() {
  $('manualChecks').innerHTML = manualDefinitions.map(([id,label]) => `<label class="check-row"><input type="checkbox" data-manual="${id}" ${state.manual[id] ? 'checked' : ''}/><span>${label}</span></label>`).join('');
  document.querySelectorAll('[data-manual]').forEach((node) => node.addEventListener('change', () => { state.manual[node.dataset.manual] = node.checked; renderResult(); }));
  $('manualScore').textContent = `${manualDefinitions.filter(([id]) => state.manual[id]).length} / ${manualDefinitions.length}`;
}
function renderResult() {
  const completed = manualDefinitions.filter(([id]) => state.manual[id]).length;
  const autoReady = state.webgl.supported && state.viewport.height >= state.viewport.width;
  const manualReady = completed === manualDefinitions.length;
  const touchReady = state.input.maxTouchPoints === 0 || state.touchProbe.events > 0;
  const benchmarkReady = !state.benchmark || state.benchmark.avgFps >= 30;
  const overall = autoReady && manualReady && touchReady && benchmarkReady ? 'PASS' : 'PENDING';
  $('overallState').textContent = overall; $('overallState').className = overall === 'PASS' ? 'pass' : 'warn';
  $('resultJson').value = JSON.stringify({ ...state, certification: { overall, autoReady, manualReady, touchReady, benchmarkReady, manualCompleted: completed, manualTotal: manualDefinitions.length } }, null, 2);
  $('manualScore').textContent = `${completed} / ${manualDefinitions.length}`;
}
async function refresh() { refreshBase(); state.pwa = await pwaInfo(); renderCards(); renderResult(); }
let pointers = new Map(); const pad = $('touchPad');
pad.addEventListener('pointerdown', (event) => {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); pad.setPointerCapture?.(event.pointerId);
  state.touchProbe.events++; state.touchProbe.maxPointers = Math.max(state.touchProbe.maxPointers, pointers.size); $('touchState').textContent = 'ACTIVE';
});
pad.addEventListener('pointermove', (event) => {
  const start = pointers.get(event.pointerId); if (!start) return; state.touchProbe.events++;
  state.touchProbe.maxTravelPx = Math.max(state.touchProbe.maxTravelPx, Math.hypot(event.clientX - start.x, event.clientY - start.y));
  $('touchDetail').textContent = `${state.touchProbe.events} events · max travel ${Math.round(state.touchProbe.maxTravelPx)} px · peak pointers ${state.touchProbe.maxPointers}`; renderResult();
});
for (const type of ['pointerup','pointercancel']) pad.addEventListener(type, (event) => {
  if (pointers.has(event.pointerId)) state.touchProbe.events++; pointers.delete(event.pointerId); $('touchState').textContent = state.touchProbe.events ? 'RECORDED' : 'WAITING'; renderResult();
});
$('benchmarkBtn').addEventListener('click', () => {
  $('benchmarkBtn').disabled = true; $('benchmarkState').textContent = 'Sampling frame pacing for 5 seconds…';
  const start = performance.now(); let frames = 0; let worstGap = 0; let last = start;
  const step = (now) => {
    frames++; worstGap = Math.max(worstGap, now - last); last = now;
    if (now - start < 5000) return requestAnimationFrame(step);
    const seconds = (now - start) / 1000;
    state.benchmark = { durationSeconds: Number(seconds.toFixed(2)), frames, avgFps: Number((frames / seconds).toFixed(1)), worstFrameMs: Number(worstGap.toFixed(1)) };
    $('benchmarkState').textContent = `Average ${state.benchmark.avgFps} FPS · worst frame ${state.benchmark.worstFrameMs} ms`; $('benchmarkBtn').disabled = false; renderResult();
  };
  requestAnimationFrame(step);
});
$('refreshBtn').addEventListener('click', refresh);
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('resultJson').value); $('copyBtn').textContent = 'COPIED'; setTimeout(() => { $('copyBtn').textContent = 'COPY JSON'; }, 1200); }
  catch { $('resultJson').select(); }
});
addEventListener('resize', refreshBase); addEventListener('online', refresh); addEventListener('offline', refresh);
renderManual(); void refresh();
