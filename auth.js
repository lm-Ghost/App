/* Focusly: simple username + password accounts, one private data set per user.
   Replaces the old shared Supabase block. Load as the LAST script, before </body>. */
(function () {
  var URL = 'https://wxzccndfwjozxfnphhic.supabase.co';
  var KEY = 'sb_publishable_4bGrd7haNkIdJUcrUjB6xQ_b5gcQsGI';
  var token = null, user = null, lastSync = null, pushTimer = null, mute = false, pollTimer = null, mode = 'login';

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { }
    return null;
  }
  function t(en, ar) { return (typeof LANG !== 'undefined' && LANG === 'ar') ? ar : en; }

  async function rpc(fn, args) {
    var r;
    try {
      r = await fetch(URL + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify(args)
      });
    } catch (e) { throw new Error('network'); }
    var d = null; try { d = await r.json(); } catch (e) { }
    if (!r.ok) throw new Error((d && d.message) || 'error');
    return d;
  }

  function msg(code) {
    code = String(code);
    if (code.indexOf('bad_username') > -1) return t('Username must be 3 to 30 characters, no spaces.', 'اسم المستخدم من 3 إلى 30 حرفًا بدون مسافات.');
    if (code.indexOf('weak_password') > -1) return t('Password must be at least 6 characters.', 'كلمة المرور 6 أحرف على الأقل.');
    if (code.indexOf('username_taken') > -1) return t('This username is already taken.', 'اسم المستخدم مستخدم من قبل.');
    if (code.indexOf('invalid_login') > -1) return t('Wrong username or password.', 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    if (code === 'network') return t('No connection. Check your internet and try again.', 'لا يوجد اتصال. تأكد من الإنترنت وأعد المحاولة.');
    return t('Something went wrong. Try again.', 'حدث خطأ. أعد المحاولة.');
  }

  /* ---------- UI ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.auth-ov{position:fixed;inset:0;z-index:3000;background:var(--bg);display:none;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));overflow-y:auto}' +
    '.auth-ov.on{display:flex}' +
    '.auth-card{background:var(--surface);color:var(--text);border-radius:20px;box-shadow:var(--shadow);width:100%;max-width:380px;padding:28px 24px;display:flex;flex-direction:column;gap:12px;margin:auto}' +
    '.auth-card h2{text-align:center;font-size:1.5em}' +
    '.auth-logo{width:72px;height:72px;object-fit:contain;border-radius:18px;align-self:center;margin-bottom:4px}' +
    '.auth-sub{text-align:center;color:var(--muted);font-size:14px;margin-bottom:4px}' +
    '.auth-tabs{display:flex;gap:8px}' +
    '.auth-tabs button{flex:1;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-weight:600;font-size:14px;cursor:pointer;transition:all .3s}' +
    '.auth-tabs button.active{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}' +
    '.auth-card input{width:100%;padding:13px 16px;border-radius:12px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-size:16px;outline:none;font-family:inherit;transition:border-color .3s}' +
    '.auth-card input:focus{border-color:var(--accent)}' +
    '.auth-err{min-height:20px;color:#e74c3c;font-size:13px;text-align:center}' +
    '#authBtn{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '@media(max-width:600px){#authBtn{max-width:84px;padding:0 10px;font-size:12px}}';
  document.head.appendChild(css);

  var ov = document.createElement('div');
  ov.className = 'auth-ov';
  ov.innerHTML =
    '<form class="auth-card" id="authForm" novalidate>' +
    '<img class="auth-logo" src="logo.png" alt="Focusly">' +
    '<h2 id="aTitle"></h2><p class="auth-sub" id="aSub"></p>' +
    '<div class="auth-tabs"><button type="button" id="aTabL"></button><button type="button" id="aTabS"></button></div>' +
    '<input id="aUser" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="30">' +
    '<input id="aPass" type="password" autocomplete="current-password">' +
    '<div class="auth-err" id="aErr" role="alert"></div>' +
    '<button class="btn btn-add" id="aGo" type="submit"></button>' +
    '</form>';
  document.body.appendChild(ov);
  var $ = function (id) { return document.getElementById(id); };

  function renderAuth() {
    $('aTitle').textContent = t('Focusly', 'فوكسلي');
    $('aSub').textContent = t('Sign in to open your own tasks from any device', 'سجّل دخولك لتفتح مهامك الخاصة من أي جهاز');
    $('aTabL').textContent = t('Log in', 'تسجيل الدخول');
    $('aTabS').textContent = t('Create account', 'حساب جديد');
    $('aTabL').classList.toggle('active', mode === 'login');
    $('aTabS').classList.toggle('active', mode === 'signup');
    $('aUser').placeholder = t('Username', 'اسم المستخدم');
    $('aPass').placeholder = t('Password', 'كلمة المرور');
    $('aPass').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    $('aGo').textContent = mode === 'login' ? t('Log in', 'دخول') : t('Create account', 'إنشاء الحساب');
    updateBtn();
  }
  function show(on) { ov.classList.toggle('on', on); if (on) renderAuth(); }

  $('aTabL').onclick = function () { mode = 'login'; $('aErr').textContent = ''; renderAuth(); };
  $('aTabS').onclick = function () { mode = 'signup'; $('aErr').textContent = ''; renderAuth(); };

  $('authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var u = $('aUser').value.trim(), p = $('aPass').value, err = $('aErr');
    err.textContent = '';
    if (u.length < 3 || u.length > 30 || /\s/.test(u)) { err.textContent = msg('bad_username'); return; }
    if (p.length < 6) { err.textContent = msg('weak_password'); return; }
    $('aGo').disabled = true;
    if (window.fsLoading) window.fsLoading(true);
    try {
      var tok = await rpc(mode === 'login' ? 'app_login' : 'app_signup', { p_username: u, p_password: p });
      await begin(tok);
      $('aPass').value = '';
    } catch (ex) {
      err.textContent = msg(ex.message);
      if (ex.message === 'network' && window.fsError) window.fsError(err.textContent);
    }
    $('aGo').disabled = false;
    if (window.fsLoading) window.fsLoading(false);
  });

  /* header badge: username + logout */
  var badge = document.createElement('button');
  badge.className = 'lang-btn'; badge.id = 'authBtn'; badge.style.display = 'none';
  var tools = document.querySelector('.header-tools');
  if (tools) tools.insertBefore(badge, tools.firstChild);
  function updateBtn() {
    if (!user) { badge.style.display = 'none'; return; }
    badge.style.display = '';
    badge.textContent = user;
    badge.title = t('Log out', 'تسجيل الخروج');
    badge.setAttribute('aria-label', t('Log out', 'تسجيل الخروج') + ': ' + user);
  }
  badge.addEventListener('click', function () {
    if (confirm(t('Log out of "' + user + '"?', 'تسجيل الخروج من "' + user + '"؟'))) logout();
  });
  var lb = document.getElementById('langBtn');
  if (lb) lb.addEventListener('click', function () { setTimeout(renderAuth, 0); });

  /* ---------- data sync ---------- */
  function snapshot() {
    return { todos: todos, sessionIds: sessionIds, sessionSrc: sessionSrc, sched: sched, studyLog: studyLog, doneLog: doneLog };
  }
  function emptySched() { var s = {}; for (var i = 0; i < 7; i++) s[i] = []; return s; }

  function mergeLog(a, b) {
    var r = {}, k;
    a = a || {}; b = b || {};
    for (k in a) r[k] = a[k];
    for (k in b) r[k] = Math.max(r[k] || 0, b[k] || 0);
    return r;
  }
  function apply(d) {
    studyLog = mergeLog(studyLog, d.studyLog);
    doneLog = mergeLog(doneLog, d.doneLog);
    todos = d.todos || [];
    sessionIds = d.sessionIds || [];
    if (d.sessionSrc) sessionSrc = d.sessionSrc;
    sched = d.sched || emptySched();
    for (var i = 0; i < 7; i++) if (!Array.isArray(sched[i])) sched[i] = [];
    mute = true;
    try { renderSchedule(); refresh(); } finally { mute = false; }
  }
  function wipe() {
    ['todos', 'sessionIds', 'sessionSrc', 'schedule', 'notifFired', 'sbLastSync', 'authSync', 'studyLog', 'doneLog'].forEach(function (k) { ls(k, null); });
    studyLog = {}; doneLog = {};
    apply({});
    sessionSrc = { mode: 'tasks', day: new Date().getDay() };
  }

  async function pushNow() {
    if (!token) return;
    clearTimeout(pushTimer); pushTimer = null;
    try {
      var r = await rpc('app_save_state', { p_token: token, p_data: snapshot() });
      lastSync = r.updated_at; ls('authSync', lastSync);
    } catch (e) { if (String(e.message).indexOf('invalid_session') > -1) dropSession(); }
  }
  function schedulePush() {
    if (mute || !token) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 800);
  }
  var _save = window.save, _saveSched = window.saveSched;
  if (_save) window.save = function () { _save(); schedulePush(); };
  if (_saveSched) window.saveSched = function () { _saveSched(); schedulePush(); };

  async function pull() {
    if (!token || pushTimer) return;
    try {
      var s = await rpc('app_get_state', { p_token: token });
      var d = s.data || {};
      if (s.updated_at !== lastSync && (d.todos || d.sched)) {
        apply(d); lastSync = s.updated_at; ls('authSync', lastSync);
      }
    } catch (e) { if (String(e.message).indexOf('invalid_session') > -1) dropSession(); }
  }
  function startPoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(pull, 20000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(); });

  async function begin(tok) {
    var s = await rpc('app_get_state', { p_token: tok });
    token = tok; user = s.username;
    ls('authToken', tok);
    var prev = ls('authUser');
    if (prev && prev !== user) wipe();
    ls('authUser', user);
    var d = s.data || {};
    if (d.todos || d.sched) { apply(d); lastSync = s.updated_at; ls('authSync', lastSync); }
    else await pushNow(); /* new account: keeps this device's existing tasks the first time */
    updateBtn(); show(false); startPoll();
  }

  function dropSession() {
    token = null; user = null; ls('authToken', null);
    clearInterval(pollTimer); updateBtn(); show(true);
  }
  async function logout() {
    if (pushTimer) await pushNow();
    var tk = token;
    if (tk) { try { await rpc('app_logout', { p_token: tk }); } catch (e) { } }
    ls('authUser', null);
    wipe(); /* clear this device so the next person never sees these tasks */
    dropSession();
  }

  /* ---------- start ---------- */
  var saved = ls('authToken');
  lastSync = ls('authSync');
  if (!saved) { show(true); if (window.ready) window.ready(); return; }
  (async function () {
    try {
      var s = await rpc('app_get_state', { p_token: saved });
      token = saved; user = s.username;
      var d = s.data || {};
      if (s.updated_at !== lastSync && (d.todos || d.sched)) { apply(d); lastSync = s.updated_at; ls('authSync', lastSync); }
      else if (!(d.todos || d.sched)) await pushNow();
      updateBtn(); startPoll();
    } catch (e) {
      if (String(e.message).indexOf('invalid_session') > -1) dropSession();
      else { token = saved; user = ls('authUser'); updateBtn(); startPoll(); } /* offline: keep working locally */
    }
    if (window.ready) window.ready();
  })();
})();