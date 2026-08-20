(function () {
  'use strict';

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
    document.querySelectorAll('[data-action="notify"]').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('#modalTitle').forEach(function (el) {
      if (el.textContent.trim() === 'Modal') el.textContent = '';
    });
  }

  function run() {
    cleanStaticShell();
  }

  run();
  window.addEventListener('hashchange', function () { setTimeout(run, 50); });
  new MutationObserver(function () { run(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
