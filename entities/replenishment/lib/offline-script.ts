// The offline copy's script (RP.7; spec "Offline download"), kept as source
// text because it is inlined into the downloaded file and runs there, on a
// scanner with no signal, with nothing else loaded.
//
// It is two parts. OFFLINE_LOGIC is pure: the state of a round and how each
// move changes it, the same moves as the scanner's reducer (ui/operator-state.ts),
// plus resuming saved progress. offline-script.test.ts runs it in a separate
// V8 context and plays the same moves through both reducers, so the offline
// copy cannot quietly come to behave unlike the scanner. OFFLINE_UI wires it
// to the page the renderer drew (offline-report.ts) and keeps progress in the
// browser's storage under the run's id, every access wrapped, because blocked
// storage must only mean that progress is not kept.
//
// Written as plain ES2017 with no comments of its own and no template
// literals, so it reads the same in every browser a scanner ships with.

/** The pure part: initialState, reduce, scannedBin, overview, resume, progressStore. */
export const OFFLINE_LOGIC = String.raw`
function copyOf(map) { return Object.assign({}, map); }
function withKey(map, key, value) { var out = copyOf(map); out[key] = value; return out; }
function withoutKey(map, key) { var out = copyOf(map); delete out[key]; return out; }
function firstOpen(jobs, done) {
  for (var i = 0; i < jobs.length; i++) if (!(jobs[i].id in done)) return i;
  return -1;
}
function initialState(jobs) {
  var done = {};
  for (var i = 0; i < jobs.length; i++) if (typeof jobs[i].bin === 'string') done[jobs[i].id] = jobs[i].bin;
  var open = firstOpen(jobs, done);
  return { at: open < 0 ? 0 : open, done: done, drafts: copyOf(done), review: false, notice: null };
}
function nextOpen(ids, from, done) {
  for (var k = 1; k <= ids.length; k++) {
    var i = (from + k) % ids.length;
    if (!(ids[i] in done)) return i;
  }
  return -1;
}
function reduce(ids, state, action) {
  var id = ids[state.at];
  if (id === undefined) return state;
  switch (action.type) {
    case 'type':
      return Object.assign({}, state, { drafts: withKey(state.drafts, id, action.value), notice: null });
    case 'complete': {
      var done = withKey(state.done, id, action.bin);
      var next = nextOpen(ids, state.at, done);
      return { at: next < 0 ? state.at : next, done: done, drafts: withKey(state.drafts, id, action.bin), review: false, notice: null };
    }
    case 'reopen':
      return Object.assign({}, state, { done: withoutKey(state.done, id), notice: null });
    case 'prev':
      return Object.assign({}, state, { at: Math.max(0, state.at - 1), notice: null });
    case 'next':
      return Object.assign({}, state, { at: Math.min(ids.length - 1, state.at + 1), notice: null });
    case 'review':
      return Object.assign({}, state, { at: 0, review: true, notice: null });
    case 'notice':
      return Object.assign({}, state, { notice: action.notice });
  }
  return state;
}
function scannedBin(key, value) {
  if (key !== 'Enter') return null;
  var bin = String(value).trim();
  return bin === '' ? null : bin;
}
function overview(state, total) {
  var doneCount = Object.keys(state.done).length;
  return {
    total: total,
    doneCount: doneCount,
    empty: total === 0,
    finished: total > 0 && doneCount >= total && !state.review,
    counter: total === 0 ? '0 / 0' : (state.at + 1) + ' / ' + total
  };
}
function resume(jobs, saved) {
  var start = initialState(jobs);
  if (!saved || typeof saved !== 'object' || !saved.done || typeof saved.done !== 'object') return start;
  var done = {};
  for (var i = 0; i < jobs.length; i++) {
    var bin = saved.done[jobs[i].id];
    if (typeof bin === 'string') done[jobs[i].id] = bin;
  }
  var open = firstOpen(jobs, done);
  var at = typeof saved.at === 'number' && saved.at >= 0 && saved.at < jobs.length ? Math.floor(saved.at) : (open < 0 ? 0 : open);
  return { at: at, done: done, drafts: copyOf(done), review: false, notice: null };
}
function progressStore(storage, runId) {
  var key = 'replenishment-offline:' + runId;
  return {
    works: function () {
      try { var s = storage(); s.setItem(key + ':probe', '1'); s.removeItem(key + ':probe'); return true; } catch (e) { return false; }
    },
    load: function () {
      try { var raw = storage().getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    save: function (state) {
      try { storage().setItem(key, JSON.stringify({ v: 1, at: state.at, done: state.done })); return true; } catch (e) { return false; }
    }
  };
}
`;

/** The page part: reads the embedded jobs, draws the state onto the rendered page, and saves each move. */
export const OFFLINE_UI = String.raw`
(function () {
  var root = document.querySelector('.rp-scan');
  var data = JSON.parse(document.querySelector('script[data-rp="jobs"]').textContent);
  var jobs = data.jobs;
  var ids = jobs.map(function (job) { return job.id; });
  var store = progressStore(function () { return window.localStorage; }, data.runId);
  var keeps = store.works();
  var state = resume(jobs, keeps ? store.load() : null);
  var helpOpen = false;
  var focusedFor = '';
  var shownAt = -1;
  var one = function (selector) { return root.querySelector(selector); };
  var cards = root.querySelectorAll('.rp-scan-job');
  var main = one('.rp-scan-main');
  var counter = one('.rp-scan-counter');
  var progress = one('.rp-scan-progress');
  var finish = one('.rp-scan-finish');
  var controls = one('.rp-scan-controls');
  var prev = one('[data-do="prev"]');
  var mark = one('[data-do="mark"]');
  var next = one('[data-do="next"]');
  var notice = one('.rp-scan-notice');
  var overlay = one('.rp-scan-overlay');
  one('.rp-scan-nostore').hidden = keeps;

  function inputAt(i) { return cards[i] ? cards[i].querySelector('.rp-scan-input') : null; }

  function render() {
    var view = overview(state, ids.length);
    var working = !view.empty && !view.finished;
    var id = ids[state.at];
    var isDone = id !== undefined && id in state.done;
    for (var i = 0; i < cards.length; i++) {
      var jobId = ids[i];
      cards[i].classList.toggle('rp-scan-on', working && i === state.at);
      cards[i].querySelector('.rp-scan-done').hidden = !(jobId in state.done);
      var input = inputAt(i);
      var draft = state.drafts[jobId] || '';
      if (input.value !== draft) input.value = draft;
    }
    counter.textContent = view.counter;
    counter.setAttribute('aria-label', view.empty ? 'No jobs' : 'Job ' + (state.at + 1) + ' of ' + view.total);
    progress.max = Math.max(view.total, 1);
    progress.value = view.doneCount;
    progress.setAttribute('aria-label', view.doneCount + ' of ' + view.total + ' jobs done');
    if (finish) finish.hidden = !view.finished;
    var bins = root.querySelectorAll('[data-bin-of]');
    for (var b = 0; b < bins.length; b++) bins[b].textContent = state.done[bins[b].getAttribute('data-bin-of')] || '';
    controls.hidden = !working;
    if (working) {
      prev.disabled = state.at === 0;
      next.disabled = state.at === view.total - 1;
      mark.textContent = isDone ? 'Reopen' : 'Mark done';
      mark.classList.toggle('rp-scan-btn--primary', !isDone);
    }
    notice.hidden = state.notice === null;
    notice.textContent = state.notice || '';
    overlay.hidden = !helpOpen;
    if (state.at !== shownAt || view.finished) main.scrollTop = 0;
    shownAt = view.finished ? -1 : state.at;
    var focusKey = [state.at, isDone, helpOpen, view.finished].join(':');
    if (working && !helpOpen && focusKey !== focusedFor) {
      var field = inputAt(state.at);
      field.focus({ preventScroll: true });
      field.select();
    }
    focusedFor = focusKey;
  }

  function dispatch(action) {
    state = reduce(ids, state, action);
    if (keeps) store.save(state);
    render();
  }

  function complete(bin) { dispatch({ type: 'complete', bin: bin }); }

  for (var i = 0; i < cards.length; i++) {
    var input = inputAt(i);
    input.addEventListener('input', function (event) { dispatch({ type: 'type', value: event.target.value }); });
    input.addEventListener('keydown', function (event) {
      var bin = scannedBin(event.key, event.target.value);
      if (bin === null) return;
      event.preventDefault();
      complete(bin);
    });
  }
  prev.addEventListener('click', function () { dispatch({ type: 'prev' }); });
  next.addEventListener('click', function () { dispatch({ type: 'next' }); });
  mark.addEventListener('click', function () {
    var id = ids[state.at];
    if (id in state.done) { dispatch({ type: 'reopen' }); return; }
    var bin = (state.drafts[id] || '').trim();
    if (bin === '') {
      dispatch({ type: 'notice', notice: 'Scan or type the BIN first.' });
      inputAt(state.at).focus();
      return;
    }
    complete(bin);
  });
  var back = one('[data-do="review"]');
  if (back) back.addEventListener('click', function () { dispatch({ type: 'review' }); });
  one('[data-do="help"]').addEventListener('click', function () { helpOpen = true; render(); one('.rp-scan-sheet [data-do="close-help"]').focus(); });
  var closers = root.querySelectorAll('[data-do="close-help"]');
  for (var c = 0; c < closers.length; c++) closers[c].addEventListener('click', function () { helpOpen = false; render(); });
  render();
})();
`;
