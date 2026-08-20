(function () {
  'use strict';

  var DEMO_VALUES = new Set([
    '125,450', '38,750', '45,200', '32,600', '36', '12', '58,900', '18', '7',
    'KES 125,450.00', 'KES 38,750.00', 'KES 45,200.00', 'KES 32,600.00', 'KES 58,900.00'
  ]);

  function cleanStaticShell() {
    var branch = document.getElementById('branchSelect');
    if (branch && branch.options.length === 1 && branch.options[0].text === 'Main Branch') {
      branch.options[0].text = 'Select branch';
      branch.options[0].value = '';
    }
    var user = document.getElementById('userSelect');
    if (user && user.options.length === 1 && user.options[0].text === 'Admin') {
      user.options[0].text = 'Select user';
      user.options[0].value = '';
    }
    var clockDate = document.getElementById('topbarDate');
    if (clockDate && clockDate.textContent.trim() === 'Saturday, 10 Aug 2026') clockDate.textContent = '—';
    var clockTime = document.getElementById('topbarTime');
    if (clockTime && clockTime.textContent.trim() === '12:45 PM') clockTime.textContent = '—';
    document.querySelectorAll('[data-action="notify"]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('#modalTitle').forEach(function (el) {
      if (el.textContent.trim() === 'Modal') el.textContent = '';
    });
  }

  function neutralizeDemoDashboard() {
    var route = String(location.hash || '').replace(/^#/, '').split('?')[0];
    if (route !== 'dashboard') return;
    var root = document.getElementById('viewRoot');
    if (!root) return;
    root.querySelectorAll('*').forEach(function (el) {
      if (el.children.length) return;
      var text = el.textContent.trim();
      if (DEMO_VALUES.has(text)) {
        el.textContent = '—';
        el.setAttribute('title', 'Live value not available');
      }
    });
  }

  function neutralizeIfDashboardApiUnavailable() {
    var token = localStorage.getItem('uniquepos.token');
    if (!token) return;
    fetch('/api/dashboard/stats', {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) neutralizeDemoDashboard();
    }).catch(function () {
      neutralizeDemoDashboard();
    });
  }

  var scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () {
      scheduled = false;
      cleanStaticShell();
      neutralizeIfDashboardApiUnavailable();
    }, 0);
  }

  run();
  window.addEventListener('hashchange', run);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
})();
