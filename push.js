/* Focusly: background notifications (Web Push), live timer notification, AI-reply notification.
   Load after appshell.js. The server side lives in the "server" folder (never upload that one). */
(function () {
  var VAPID_PUBLIC = 'BPBeXjIalObHakgtKVH0edwk7KlC1jf2yUIvfzqIg1GFqA9jXD9JgAzld2ZOy7C95Cr73LVL8P14hICU5056P2I';
  var PUSH_URL = 'https://wxzccndfwjozxfnphhic.supabase.co/functions/v1/push';
  var AI_URL = 'https://wxzccndfwjozxfnphhic.supabase.co/functions/v1/ai-study';
  var sw = navigator.serviceWorker;
  var ICON = 'icons/icon-192.png';
  var state = { subscribed: false, lastTry: 0 };
  var sent = { timer: null, plan: null };

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function L(en, ar) { return (typeof LANG !== 'undefined' && LANG === 'ar') ? ar : en; }
  function granted() { return 'Notification' in window && Notification.permission === 'granted'; }
  var configured = !!(sw && 'PushManager' in window && VAPID_PUBLIC && VAPID_PUBLIC.indexOf('__') !== 0);

  function call(action, body) {
    body = body || {}; body.action = action;
    if (!body.token) body.token = ls('authToken');
    return fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || d.error) throw new Error(d.error || ('http' + r.status));
          return d;
        });
      });
  }
  function u8(b64) {
    var s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    var r = atob(s), o = new Uint8Array(r.length);
    for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i);
    return o;
  }
  function showLocal(title, opts) {
    if (!sw || !granted()) return Promise.resolve();
    return sw.ready.then(function (reg) { return reg.showNotification(title, opts); }).catch(function () { });
  }

  /* ---------- timer: what happens next, from the timer's current state ---------- */
  function snap() { return window.__timer && window.__timer.snap ? window.__timer.snap() : null; }
  function timerEvents(s) {
    var ev = [];
    if (!s || !s.running) return ev;
    var t = Date.now(), phase = s.phase, rem = s.remainingMs, br = s.breakRemaining, ws = s.workSince;
    var every = s.every * 60000, len = s.len * 60000;
    for (var i = 0; i < 8; i++) {
      if (phase === 'break') {
        t += br;
        ev.push({ at: t, title: L('Back to study', 'العودة للمذاكرة'), body: L('Break is over. Keep going.', 'انتهت الاستراحة. واصل بنشاط.') });
        phase = 'work'; ws = 0;
      } else {
        var toBreak = s.brk ? Math.max(0, every - ws) : Infinity;
        if (s.mode === 'countdown' && rem <= toBreak) {
          t += rem;
          ev.push({ at: t, title: L('Time is up', 'انتهى الوقت'), body: L('Great work. Time for a rest.', 'أحسنت، حان وقت الراحة.') });
          break;
        }
        if (toBreak === Infinity) break;
        t += toBreak; if (s.mode === 'countdown') rem -= toBreak;
        ev.push({ at: t, title: L('Break time', 'وقت الاستراحة'), body: L('Rest for ', 'استرح لمدة ') + s.len + L(' min.', ' دقيقة.') });
        phase = 'break'; br = len; ws = 0;
      }
    }
    return ev;
  }
  function buildTimer() {
    return timerEvents(snap()).map(function (e) {
      return { tag: 'timer', at: Math.round(e.at / 1000) * 1000, title: e.title, body: e.body };
    });
  }

  /* ---------- daily reminder + task reminders for the next 3 days ---------- */
  function buildPlan() {
    var jobs = [], now = Date.now();
    if (typeof sched === 'undefined' || typeof nset === 'undefined') return jobs;
    var open = (typeof todos !== 'undefined' ? todos : []).filter(function (t) { return !t.completed; }).length;
    for (var d = 0; d < 3; d++) {
      var day = new Date(); day.setDate(day.getDate() + d); day.setHours(0, 0, 0, 0);
      var ds = day.toDateString(), list = (sched[day.getDay()] || []);
      if (nset.daily) {
        var p = String(nset.time || '08:00').split(':'), at = new Date(day); at.setHours(+p[0], +p[1], 0, 0);
        var n = open || list.filter(function (t) { return d > 0 || !t.done; }).length;
        if (n && at.getTime() > now) jobs.push({ tag: 'd|' + ds, at: at.getTime(), title: typeof tasksMsg === 'function' ? tasksMsg(n) : 'Focusly', body: typeof randQuote === 'function' ? randQuote() : '' });
      }
      if (nset.task) list.forEach(function (t) {
        if (!t.time || (d === 0 && t.done)) return;
        var q = String(t.time).split(':'), at2 = new Date(day); at2.setHours(+q[0], +q[1], 0, 0);
        if (at2.getTime() > now) jobs.push({ tag: 't|' + t.id + '|' + ds, at: at2.getTime(), title: L('Time for: ', 'حان وقت: ') + t.text, body: typeof randQuote === 'function' ? randQuote() : '' });
      });
    }
    return jobs.slice(0, 50);
  }

  function pushKind(kind, jobs) {
    if (!state.subscribed || !ls('authToken')) return;
    var sig = JSON.stringify(jobs);
    if (sig === sent[kind]) return;
    call('schedule', { kind: kind, jobs: jobs }).then(function () { sent[kind] = sig; }).catch(function () { });
  }
  var planT = null, timerT = null;
  function planSoon(force) {
    if (force) { sent.plan = null; sent.timer = null; }
    clearTimeout(planT); planT = setTimeout(function () { pushKind('plan', buildPlan()); pushKind('timer', buildTimer()); }, 1200);
  }
  function timerSoon() { clearTimeout(timerT); timerT = setTimeout(function () { pushKind('timer', buildTimer()); }, 400); }

  /* ---------- subscribe / unsubscribe ---------- */
  function subscribe() {
    if (!configured || !granted() || !ls('authToken')) return Promise.resolve(false);
    state.lastTry = Date.now();
    return sw.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID_PUBLIC) });
      });
    }).then(function (sub) {
      return call('subscribe', { sub: sub.toJSON() }).then(function () {
        state.subscribed = true; window.fsPushOn = true; planSoon(true); return true;
      });
    }).catch(function () { return false; });
  }
  function unsubscribe() {
    state.subscribed = false; window.fsPushOn = false; sent.plan = sent.timer = null;
    if (!sw) return;
    sw.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      return call('unsubscribe', { endpoint: sub.endpoint, token: 'none' }).catch(function () { }).then(function () { return sub.unsubscribe(); });
    }).catch(function () { });
  }

  /* ---------- live timer notification while the app is in the background ---------- */
  function closeLive() {
    if (!sw) return;
    sw.ready.then(function (reg) { return reg.getNotifications({ tag: 'timer-live' }); })
      .then(function (l) { l.forEach(function (n) { n.close(); }); }).catch(function () { });
  }
  function live() {
    var s = snap();
    if (!document.hidden || !s || !s.running || !granted()) { closeLive(); return; }
    var next = timerEvents(s)[0];
    var hm = function (t) { return new Date(t).toLocaleTimeString(LANG === 'ar' ? 'ar' : undefined, { hour: '2-digit', minute: '2-digit' }); };
    showLocal(s.phase === 'break' ? L('Break in progress', 'استراحة جارية') : L('Focus timer running', 'المؤقت يعمل'), {
      body: next ? next.title + ' · ' + hm(next.at) : L('Running…', 'يعمل…'),
      tag: 'timer-live', silent: true, renotify: false, requireInteraction: true,
      icon: ICON, badge: ICON, timestamp: next ? next.at : Date.now() - (s.elapsedMs || 0)
    });
  }
  window.addEventListener('timerchange', function () { live(); timerSoon(); });
  document.addEventListener('visibilitychange', function () { live(); if (!document.hidden) planSoon(); });

  /* ---------- AI reply: the service worker finishes the request and notifies if you left the app ---------- */
  if (sw && typeof window.aiChat === 'function') {
    var orig = window.aiChat;
    window.aiChat = function (history, context) {
      var ctl = sw.controller, tok = ls('authToken');
      if (!ctl || !tok) return orig(history, context);
      return new Promise(function (resolve, reject) {
        var ch = new MessageChannel(), acked = false;
        var fall = setTimeout(function () { if (!acked) orig(history, context).then(resolve, reject); }, 1500);
        ch.port1.onmessage = function (ev) {
          var o = ev.data || {};
          if (o.ack) { acked = true; clearTimeout(fall); return; }
          if (o.ok && o.data && !o.data.error) resolve(o.data.reply || '');
          else reject(new Error(o.network ? 'Failed to fetch' : ((o.data && o.data.error) || ('http' + o.status))));
        };
        ctl.postMessage({
          type: 'ai-fetch', url: AI_URL,
          body: JSON.stringify({ token: tok, action: 'chat', lang: LANG, payload: { messages: history, context: context } }),
          title: L('Assistant replied', 'ردّ المساعد')
        }, [ch.port2]);
      });
    };
  }
  if (sw) sw.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'open-chat') {
      var p = document.getElementById('chatbot-panel'), b = document.getElementById('chatbot-toggle');
      if (p && b && p.style.display !== 'block') b.click();
    }
  });

  /* ---------- hooks into the existing app ---------- */
  ['save', 'saveSched', 'saveN'].forEach(function (n) {
    var f = window[n];
    if (typeof f === 'function') window[n] = function () { var r = f.apply(this, arguments); planSoon(); return r; };
  });
  function wire(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
  wire('notifEnable', function () {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function () { subscribe(); });
  });
  wire('notifTest', function () {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function () {
      subscribe().then(function (ok) { if (ok) call('test', { title: L('Push works', 'الإشعارات الخارجية تعمل'), body: L('You will get reminders even when the app is closed.', 'ستصلك التذكيرات حتى لو كان التطبيق مغلقًا.') }).catch(function () { }); });
    });
  });

  var lastTok = ls('authToken');
  setInterval(function () {
    var t = ls('authToken');
    if (lastTok && !t) unsubscribe();
    lastTok = t;
    if (t && !state.subscribed && Date.now() - state.lastTry > 60000) subscribe();
  }, 4000);
  setInterval(function () { planSoon(); }, 10 * 60 * 1000);
  setTimeout(subscribe, 2500);
  if (location.hash === '#chat') setTimeout(function () { var b = document.getElementById('chatbot-toggle'); if (b) b.click(); }, 1800);
})();
