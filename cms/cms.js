const $ = (id) => document.getElementById(id);

const sectionMeta = {
  gameplay: ['GAMEPLAY & PHYSICS', 'Core movement, jump, lane switching, contact windows and junction behavior.'],
  scoring: ['SCORING & STREAKS', 'Travel score, clean streak growth, milestone bonuses and boss points.'],
  powerups: ['POWER-UPS', 'Durations, movement modifiers, Magnet range and Warden Pulse strength.'],
  warden: ['WARDEN & PRESSURE', 'Chase pressure gaps and boss-pressure multipliers.'],
  camera: ['CAMERA DIRECTOR', 'Chase framing, FOV, look-ahead and boss composition.'],
  content: ['CONTENT CADENCE', 'Segment count and deterministic junction/signature/side/power-up cadence.'],
  weather: ['WEATHER', 'Stage weather modes and global visibility/intensity.'],
  audio: ['AUDIO SYSTEM', 'Default mixer values and procedural soundtrack cadence.'],
  features: ['FEATURE FLAGS', 'Operational switches for major gameplay and live-service systems.'],
  multiplayer: ['MULTIPLAYER RACES', 'Realtime room size, countdown, race duration, network state cadence and ghost rendering opacity.'],
  stages: ['MAP / STAGE TUNING', 'Per-map difficulty, objectives, rewards, speed and visual atmosphere.'],
  runModes: ['RUN MODES', 'Unlock requirements, score/reward economy, pressure and boss cadence.'],
  sideExpeditions: ['SIDE EXPEDITIONS', 'Challenge modifiers for score, rewards, speed, weather, boss pressure and revive rules.'],
  economy: ['ECONOMY & UPGRADES', 'Upgrade prices, star rewards, 3-star bonuses and boss currency payout.'],
  characters: ['CHARACTER BALANCE', 'Character passive multipliers, bonus durations and Warden hit penalties.'],
  relicItems: ['RELIC ITEMS', 'Relic costs and every gameplay-affecting loadout modifier.'],
  cosmetics: ['COSMETICS', 'Cart/trail prices and runtime color tuning.'],
  missions: ['CAREER MISSIONS', 'Persistent mission targets and currency rewards.'],
  achievements: ['ACHIEVEMENTS', 'Achievement thresholds and reward economy.'],
};

const navGroups = [
  ['CORE GAME', ['gameplay', 'scoring', 'powerups', 'warden', 'camera']],
  ['CONTENT', ['content', 'stages', 'runModes', 'sideExpeditions']],
  ['ECONOMY', ['economy', 'characters', 'relicItems', 'cosmetics', 'missions', 'achievements']],
  ['PRESENTATION', ['weather', 'audio']],
  ['OPERATIONS', ['features', 'multiplayer']],
];

let state = {
  environment: sessionStorage.getItem('ruins-cms-environment') || 'dev',
  activeConfigEnvironment: 'dev',
  draft: null,
  draftUpdatedAt: null,
  published: null,
  workflow: { status: 'editing', requestedBy: '', requestedAt: null, approvedBy: '', approvedAt: null },
  history: [],
  schedules: [],
  audit: [],
  telemetry: null,
  dirty: false,
  section: 'gameplay',
  access: 'unknown',
  principal: null,
  rawMode: false,
};

function cmsHeaders(json = false) {
  const headers = {};
  const token = sessionStorage.getItem('ruins-cms-token') || '';
  const actor = sessionStorage.getItem('ruins-cms-actor') || $('actorInput')?.value?.trim() || 'GAME-DESIGNER';
  if (token) headers['X-Ruins-CMS-Token'] = token;
  if (actor) headers['X-Ruins-CMS-Actor'] = actor;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...cmsHeaders(Boolean(options.body)), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.errors?.join(', ') || body.error || `${response.status}`), { body, status: response.status });
  return body;
}

function envPath(path) {
  return `${path}${path.includes('?') ? '&' : '?'}env=${encodeURIComponent(state.environment)}`;
}

function toast(message, error = false) {
  const node = $('toast');
  node.textContent = message;
  node.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = 'toast'; }, 2800);
}

function humanKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function getPath(root, path) { return path.reduce((value, key) => value?.[key], root); }

function setPath(root, path, value) {
  let target = root;
  for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
  target[path[path.length - 1]] = value;
}

function fieldMatches(path, key) {
  const query = $('searchInput').value.trim().toLowerCase();
  if (!query) return true;
  return `${path.join(' ')} ${key} ${humanKey(key)}`.toLowerCase().includes(query);
}

function renderField(parent, path, key, value) {
  if (!fieldMatches(path, key)) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.innerHTML = `<span>${humanKey(key)}</span><code>${[...path, key].join('.')}</code>`;
  wrapper.appendChild(label);

  const input = document.createElement('input');
  input.dataset.path = JSON.stringify([...path, key]);
  if (typeof value === 'boolean') {
    input.type = 'checkbox';
    input.checked = value;
    input.className = 'switch';
  } else if (typeof value === 'number') {
    input.type = 'number';
    input.step = Number.isInteger(value) ? '1' : '0.01';
    input.value = String(value);
  } else {
    input.type = 'text';
    input.value = String(value ?? '');
  }
  input.addEventListener('input', () => {
    const p = JSON.parse(input.dataset.path);
    const next = input.type === 'checkbox' ? input.checked : typeof value === 'number' ? Number(input.value) : input.value;
    setPath(state.draft, p, next);
    markDirty();
    syncRaw();
    renderDiff();
  });
  wrapper.appendChild(input);
  parent.appendChild(wrapper);
}

function renderObjectGroup(title, object, basePath, parent) {
  const entries = Object.entries(object || {});
  const primitives = entries.filter(([, value]) => value === null || typeof value !== 'object');
  const nested = entries.filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value));
  if (primitives.length) {
    const group = document.createElement('section');
    group.className = 'field-group';
    group.innerHTML = `<h3>${humanKey(title)}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'field-grid';
    for (const [key, value] of primitives) renderField(grid, basePath, key, value);
    group.appendChild(grid);
    if (grid.children.length) parent.appendChild(group);
  }
  for (const [key, value] of nested) renderObjectGroup(key, value, [...basePath, key], parent);
}

function renderEditor() {
  const meta = sectionMeta[state.section] || [humanKey(state.section), ''];
  $('sectionTitle').textContent = meta[0];
  const editor = $('formEditor');
  editor.innerHTML = `<div class="section-intro"><h2>${meta[0]}</h2><p>${meta[1]}</p></div>`;
  const section = state.draft?.[state.section];
  if (!section) {
    editor.insertAdjacentHTML('beforeend', '<div class="section-intro"><p>This section is not present in the current schema.</p></div>');
    return;
  }
  renderObjectGroup(state.section, section, [state.section], editor);
  syncRaw();
}

function renderNav() {
  $('nav').innerHTML = navGroups.map(([group, sections]) => `
    <div class="nav-group">${group}</div>
    ${sections.map((section) => `<button class="nav-btn ${state.section === section ? 'active' : ''}" data-section="${section}">${sectionMeta[section]?.[0] || humanKey(section)}</button>`).join('')}
  `).join('');
  document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
    state.section = button.dataset.section;
    renderNav();
    renderEditor();
  }));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function workflowDetail() {
  if (state.workflow.status === 'pending') return `Requested by ${state.workflow.requestedBy || 'unknown'} · ${formatDate(state.workflow.requestedAt)}`;
  if (state.workflow.status === 'approved') return `Approved by ${state.workflow.approvedBy || 'unknown'} · ${formatDate(state.workflow.approvedAt)}`;
  return 'Save changes, then request approval';
}

function renderStatus() {
  const revision = state.published?.revision || 0;
  $('environmentState').textContent = state.environment.toUpperCase();
  $('environmentState').className = state.environment === 'prod' ? 'env-prod' : '';
  $('runtimeEnvironment').textContent = `Runtime reads ${state.activeConfigEnvironment.toUpperCase()}${state.environment === state.activeConfigEnvironment ? ' · ACTIVE' : ''}`;
  $('publishedRevision').textContent = `R${revision}`;
  $('publishedTime').textContent = state.published?.note || (state.published?.createdAt ? formatDate(state.published.createdAt) : 'SOURCE DEFAULTS');
  $('draftState').textContent = state.dirty ? 'UNSAVED' : 'SAVED';
  $('draftTime').textContent = formatDate(state.draftUpdatedAt);
  $('workflowState').textContent = String(state.workflow.status || 'editing').toUpperCase();
  $('workflowState').className = state.workflow.status === 'approved' ? 'workflow-approved' : state.workflow.status === 'pending' ? 'workflow-pending' : '';
  $('workflowDetail').textContent = workflowDetail();
  $('healthState').textContent = state.draft?.schemaVersion === 1 ? 'VALID SCHEMA' : 'CHECK CONFIG';
  $('healthDetail').textContent = `Schema v${state.draft?.schemaVersion ?? '?'}`;
  const badge = $('accessBadge');
  const roles = state.principal?.roles || [];
  badge.textContent = state.access === 'loopback'
    ? 'LOCAL ADMIN'
    : state.principal
      ? `${state.principal.actor} · ${roles.join('/') || 'NO ROLE'}`
      : 'OFFLINE';
  badge.className = `badge ${state.access === 'unknown' ? 'warn' : 'ok'}`;
  $('saveBtn').disabled = !state.dirty;
  const requestDisabled = state.dirty || state.workflow.status !== 'editing';
  const approveDisabled = state.workflow.status !== 'pending';
  const publishDisabled = state.workflow.status !== 'approved';
  for (const id of ['requestBtn', 'requestSideBtn']) $(id).disabled = requestDisabled;
  for (const id of ['approveBtn', 'approveSideBtn']) $(id).disabled = approveDisabled;
  for (const id of ['publishBtn', 'publishSideBtn', 'scheduleBtn']) $(id).disabled = publishDisabled;
  $('environmentSelect').value = state.environment;
  renderPromotionControls();
}

function renderHistory() {
  const history = $('history');
  if (!state.history.length) {
    history.innerHTML = '<div class="history-row"><div><b>NO PUBLISHED REVISIONS</b><small>Approve and publish the first draft.</small></div></div>';
    return;
  }
  history.innerHTML = state.history.map((item) => `<div class="history-row"><div><b>R${item.revision} · ${item.note || 'NO NOTE'}</b><small>${item.source || 'publish'} · ${item.actor || 'unknown'} · ${formatDate(item.createdAt)}</small></div><button class="ghost" data-rollback="${item.revision}">ROLLBACK</button></div>`).join('');
  history.querySelectorAll('[data-rollback]').forEach((button) => button.addEventListener('click', async () => {
    const revision = Number(button.dataset.rollback);
    if (!confirm(`Emergency rollback ${state.environment.toUpperCase()} by publishing a new revision based on R${revision}?`)) return;
    try {
      await api('/api/cms/rollback', { method: 'POST', body: JSON.stringify({ environment: state.environment, revision }) });
      toast(`Rollback from R${revision} published`);
      await load();
    } catch (error) { toast(error.message, true); }
  }));
}

function renderSchedules() {
  const node = $('schedules');
  if (!state.schedules.length) {
    node.innerHTML = '<div class="history-row"><div><b>QUEUE EMPTY</b><small>No scheduled releases.</small></div></div>';
    return;
  }
  node.innerHTML = state.schedules.map((item) => `<div class="history-row"><div><b>#${item.id} · ${String(item.status).toUpperCase()}</b><small>${formatDate(item.scheduledAt)} · ${item.actor || 'unknown'}${item.publishedRevision ? ` · R${item.publishedRevision}` : ''}</small></div>${item.status === 'pending' ? `<button class="ghost" data-cancel-schedule="${item.id}">CANCEL</button>` : ''}</div>`).join('');
  node.querySelectorAll('[data-cancel-schedule]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api('/api/cms/cancel-schedule', { method: 'POST', body: JSON.stringify({ environment: state.environment, id: Number(button.dataset.cancelSchedule) }) });
      toast('Scheduled release cancelled');
      await load();
    } catch (error) { toast(error.message, true); }
  }));
}

function shortValue(value) {
  const text = JSON.stringify(value);
  return text?.length > 70 ? `${text.slice(0, 67)}…` : text ?? 'null';
}

function collectDiff(before, after, path = [], output = []) {
  if (output.length >= 300 || before === after) return output;
  const beforeObject = before && typeof before === 'object' && !Array.isArray(before);
  const afterObject = after && typeof after === 'object' && !Array.isArray(after);
  if (beforeObject && afterObject) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) collectDiff(before[key], after[key], [...path, key], output);
  } else output.push({ path: path.join('.'), before: before ?? null, after: after ?? null });
  return output;
}

function renderDiff() {
  const changes = collectDiff(state.published?.config || {}, state.draft || {});
  $('diffSummary').textContent = changes.length ? `${changes.length}${changes.length >= 300 ? '+' : ''} changed fields` : 'No changes';
  $('diffList').innerHTML = changes.length
    ? changes.slice(0, 30).map((change) => `<div class="diff-row"><code>${change.path}</code><div class="diff-values"><span title="before">− ${shortValue(change.before)}</span><span title="after">+ ${shortValue(change.after)}</span></div></div>`).join('')
    : '<div class="history-row"><div><b>DRAFT MATCHES PUBLISHED</b><small>No release delta in this environment.</small></div></div>';
}

function renderTelemetry() {
  const data = state.telemetry;
  const node = $('telemetry');
  if (!data) { node.innerHTML = '<div class="history-row"><div><b>NO DATA</b></div></div>'; return; }
  const metrics = [
    ['PLAYERS', data.players], ['RUNS', data.runs], ['RUNS 24H', data.runs24h], ['TOP SCORE', Number(data.topScore || 0).toLocaleString()],
    ['AVG SCORE', Number(data.averageScore || 0).toLocaleString()], ['PENDING RELEASES', data.pendingSchedules], ['CONFIG REV', `R${data.configRevision}`], ['ENV', data.environment.toUpperCase()],
  ];
  node.innerHTML = metrics.map(([label, value]) => `<div class="metric-tile"><span>${label}</span><b>${value}</b></div>`).join('');
}

function renderAudit() {
  const node = $('audit');
  if (!state.audit.length) { node.innerHTML = '<div class="history-row"><div><b>NO AUDIT EVENTS</b></div></div>'; return; }
  node.innerHTML = state.audit.slice(0, 20).map((item) => `<div class="audit-row"><b>${String(item.action).toUpperCase()}${item.revision ? ` · R${item.revision}` : ''}</b><code>${item.actor || 'unknown'} · ${formatDate(item.createdAt)}</code><small>${item.detail || ''}</small></div>`).join('');
}

function renderPromotionControls() {
  const node = $('promotionControls');
  if (state.environment === 'dev') node.innerHTML = '<button class="ghost" data-promote="staging">PROMOTE PUBLISHED DEV → STAGING DRAFT</button>';
  else if (state.environment === 'staging') node.innerHTML = '<button class="ghost" data-promote="prod">PROMOTE PUBLISHED STAGING → PROD DRAFT</button>';
  else node.innerHTML = '<small>PROD is the final environment. Use immutable rollback for emergency recovery.</small>';
  node.querySelectorAll('[data-promote]').forEach((button) => button.addEventListener('click', async () => {
    const to = button.dataset.promote;
    if (!confirm(`Copy published ${state.environment.toUpperCase()} config into ${to.toUpperCase()} draft?`)) return;
    try {
      await api('/api/cms/promote', { method: 'POST', body: JSON.stringify({ from: state.environment, to }) });
      toast(`Promoted ${state.environment.toUpperCase()} published config to ${to.toUpperCase()} draft`);
    } catch (error) { toast(error.message, true); }
  }));
}

function markDirty() {
  state.dirty = true;
  renderStatus();
}

function syncRaw() {
  if (state.draft) $('rawTextarea').value = JSON.stringify(state.draft, null, 2);
}

function setDefaultScheduleTime() {
  if ($('scheduleAt').value) return;
  const d = new Date(Date.now() + 10 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $('scheduleAt').value = d.toISOString().slice(0, 16);
}

async function load() {
  try {
    const [data, telemetry] = await Promise.all([
      api(envPath('/api/cms/config')),
      api(envPath('/api/cms/telemetry')).catch(() => null),
    ]);
    state.environment = data.environment;
    state.activeConfigEnvironment = data.activeConfigEnvironment || 'dev';
    state.draft = data.draft;
    state.draftUpdatedAt = data.draftUpdatedAt;
    state.workflow = data.workflow || state.workflow;
    state.published = data.published;
    state.history = data.history || [];
    state.schedules = data.schedules || [];
    state.audit = data.audit || [];
    state.telemetry = telemetry;
    state.access = data.access;
    state.principal = data.principal || null;
    state.dirty = false;
    sessionStorage.setItem('ruins-cms-environment', state.environment);
    renderNav();
    renderEditor();
    renderStatus();
    renderHistory();
    renderSchedules();
    renderDiff();
    renderTelemetry();
    renderAudit();
    setDefaultScheduleTime();
  } catch (error) {
    state.access = 'unknown';
    renderStatus();
    toast(`CMS backend unavailable: ${error.message}. Start serve:online on :4175.`, true);
  }
}

async function saveDraft() {
  try {
    const result = await api('/api/cms/draft', { method: 'PUT', body: JSON.stringify({ environment: state.environment, config: state.draft }) });
    state.dirty = false;
    state.draftUpdatedAt = result.draftUpdatedAt;
    state.workflow = { status: 'editing', requestedBy: '', requestedAt: null, approvedBy: '', approvedAt: null };
    renderStatus();
    toast('Draft validated and saved · approval reset');
    await load();
    return true;
  } catch (error) {
    toast(`Draft rejected: ${error.message}`, true);
    return false;
  }
}

async function requestApproval() {
  if (state.dirty && !(await saveDraft())) return;
  try {
    await api('/api/cms/request-approval', { method: 'POST', body: JSON.stringify({ environment: state.environment, note: $('publishNote').value.trim() }) });
    toast(`${state.environment.toUpperCase()} approval requested`);
    await load();
  } catch (error) { toast(`Approval request failed: ${error.message}`, true); }
}

async function approve() {
  try {
    await api('/api/cms/approve', { method: 'POST', body: JSON.stringify({ environment: state.environment }) });
    toast(`${state.environment.toUpperCase()} draft approved`);
    await load();
  } catch (error) {
    const extra = error.body?.hint ? ` · ${error.body.hint}` : '';
    toast(`Approve failed: ${error.message}${extra}`, true);
  }
}

async function publish() {
  if (state.dirty) { toast('Save the draft before publishing', true); return; }
  try {
    const note = $('publishNote').value.trim();
    const result = await api('/api/cms/publish', { method: 'POST', body: JSON.stringify({ environment: state.environment, note }) });
    $('publishNote').value = '';
    toast(`Published ${state.environment.toUpperCase()} R${result.revision}`);
    await load();
  } catch (error) { toast(`Publish failed: ${error.message}`, true); }
}

async function scheduleRelease() {
  const scheduledAt = new Date($('scheduleAt').value).getTime();
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) { toast('Choose a future schedule time', true); return; }
  try {
    const result = await api('/api/cms/schedule', { method: 'POST', body: JSON.stringify({ environment: state.environment, note: $('publishNote').value.trim(), scheduledAt }) });
    toast(`Release #${result.id} scheduled for ${formatDate(result.scheduledAt)}`);
    $('scheduleAt').value = '';
    setDefaultScheduleTime();
    await load();
  } catch (error) { toast(`Schedule failed: ${error.message}`, true); }
}

function previewDraft() {
  localStorage.setItem('ruins-cms-preview-config', JSON.stringify(state.draft));
  localStorage.setItem('ruins-cms-preview-environment', state.environment);
  window.open('/?cmsPreview=1', '_blank', 'noopener');
  toast(`${state.environment.toUpperCase()} draft preview opened`);
}

$('saveBtn').addEventListener('click', saveDraft);
for (const id of ['requestBtn', 'requestSideBtn']) $(id).addEventListener('click', requestApproval);
for (const id of ['approveBtn', 'approveSideBtn']) $(id).addEventListener('click', approve);
for (const id of ['publishBtn', 'publishSideBtn']) $(id).addEventListener('click', publish);
$('scheduleBtn').addEventListener('click', scheduleRelease);
$('previewBtn').addEventListener('click', previewDraft);
$('refreshBtn').addEventListener('click', load);
$('refreshDiffBtn').addEventListener('click', renderDiff);
$('searchInput').addEventListener('input', renderEditor);
$('environmentSelect').addEventListener('change', async () => {
  const next = $('environmentSelect').value;
  if (state.dirty && !confirm(`Discard unsaved ${state.environment.toUpperCase()} edits and switch environment?`)) {
    $('environmentSelect').value = state.environment;
    return;
  }
  state.environment = next;
  sessionStorage.setItem('ruins-cms-environment', next);
  await load();
});
$('actorInput').value = sessionStorage.getItem('ruins-cms-actor') || 'GAME-DESIGNER';
$('actorInput').addEventListener('change', () => {
  sessionStorage.setItem('ruins-cms-actor', $('actorInput').value.trim() || 'GAME-DESIGNER');
  toast(`Actor set to ${$('actorInput').value.trim() || 'GAME-DESIGNER'}`);
});
$('formTab').addEventListener('click', () => {
  state.rawMode = false;
  $('formTab').classList.add('active'); $('rawTab').classList.remove('active');
  $('formEditor').classList.remove('hidden'); $('rawEditor').classList.add('hidden');
});
$('rawTab').addEventListener('click', () => {
  state.rawMode = true;
  $('rawTab').classList.add('active'); $('formTab').classList.remove('active');
  $('formEditor').classList.add('hidden'); $('rawEditor').classList.remove('hidden');
  syncRaw();
});
$('applyRawBtn').addEventListener('click', () => {
  try {
    const parsed = JSON.parse($('rawTextarea').value);
    state.draft = parsed;
    markDirty();
    renderEditor();
    renderDiff();
    toast('Raw JSON applied to draft');
  } catch (error) { toast(`Invalid JSON: ${error.message}`, true); }
});
$('resetBtn').addEventListener('click', async () => {
  if (!confirm(`Reset ${state.environment.toUpperCase()} draft to its currently published revision?`)) return;
  try {
    await api('/api/cms/reset-draft', { method: 'POST', body: JSON.stringify({ environment: state.environment }) });
    toast('Draft reset to published config');
    await load();
  } catch (error) { toast(error.message, true); }
});
$('tokenInput').value = sessionStorage.getItem('ruins-cms-token') || '';
$('tokenBtn').addEventListener('click', () => {
  sessionStorage.setItem('ruins-cms-token', $('tokenInput').value.trim());
  toast('CMS token saved for this browser session');
  void load();
});

setInterval(() => {
  if (!state.dirty && document.visibilityState === 'visible') void load();
}, 5000);
void load();
