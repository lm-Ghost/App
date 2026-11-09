/* Focusly app shell: install support, status-bar color, chat bottom sheet.
   Load after auth.js, right before </body>. */
(function () {
  /* 1. Service worker (works on https or localhost only) */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }

  /* 2. Keep the browser/status-bar color in sync with the light/dark theme */
  var meta = document.querySelector('meta[name="theme-color"]');
  function syncTheme() {
    if (!meta) return;
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    meta.setAttribute('content', dark ? '#100b18' : '#f5f1f5');
  }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* 3. Chat panel becomes a bottom sheet with a  close button and a dimmed backdrop */
  var panel = document.getElementById('chatbot-panel');
  var toggle = document.getElementById('chatbot-toggle');
  if (panel && toggle) {
    var ar = function () { return document.documentElement.getAttribute('dir') === 'rtl'; };

    var head = document.createElement('div');
    head.className = 'sheet-handle';
    head.innerHTML = '<span class="sheet-title"></span><button type="button" class="sheet-close" aria-label="Close">×</button>';
    panel.insertBefore(head, panel.firstChild);
    var title = head.querySelector('.sheet-title');
    function setTitle() { title.textContent = ar() ? 'مساعد الدراسة' : 'Study assistant'; head.querySelector('.sheet-close').setAttribute('aria-label', ar() ? 'إغلاق' : 'Close'); }
    setTitle();
    new MutationObserver(setTitle).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });

    var backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    document.body.appendChild(backdrop);

    function isOpen() { return panel.style.display === 'block'; }
    function sync() { backdrop.classList.toggle('on', isOpen() && window.matchMedia('(max-width: 820px), (display-mode: standalone)').matches); }
    function close() { panel.style.display = 'none'; sync(); }

    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['style'] });
    head.querySelector('.sheet-close').addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });
  }

})();