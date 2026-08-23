(function () {
  'use strict';

  var TOKEN_KEY = 'uniquepos.token';
  var busy = false;
  var timer = null;

  function route() {
    return String(location.hash || '').replace(/^#/, '').split('?')[0];
  }

  function authHeaders() {
    var token = localStorage.getItem(TOKEN_KEY) || '';
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  async function getJson(url) {
    var response = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  function firstNumber() {
    for (var i = 0; i < arguments.length; i += 1) {
      var n = Number(arguments[i]);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function money(value) {
    return 'KES ' + new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(firstNumber(value, 0));
  }

  function number(value) {
    return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(firstNumber(value, 0));
  }

  function setKpi(label, value, isMoney) {
    var cards = document.querySelectorAll('.kpi-card');
    cards.forEach(function (card) {
      var labelEl = card.querySelector('.kpi-card__label');
      var valueEl = card.querySelector('.kpi-card__value');
      if (!labelEl || !valueEl) return;
      if (labelEl.textContent.trim().toLowerCase() !== label.toLowerCase()) return;
      valueEl.textContent = isMoney ? money(value) : number(value);
      var trend = card.querySelector('.kpi-card__trend');
      if (trend) trend.textContent = 'Updated from live records';
    });
  }

  function zeroDashboard() {
    setKpi('Today’s Sales', 0, true);
    setKpi('Today’s Profit', 0, true);
    setKpi('Cash in Till', 0, true);
    setKpi('Mpesa Collections', 0, true);
    setKpi('Transactions', 0, false);
    setKpi('Pending Quotations', 0, false);
    setKpi('Credit Sales', 0, true);
    setKpi('Low Stock Items', 0, false);
    setKpi('Out of Stock Items', 0, false);
  }

  function updateChart(chartRows) {
    var canvas = document.getElementById('salesChartCanvas');
    if (!canvas || !window.Chart) return;
    var chart = window.Chart.getChart(canvas);
    if (!chart) return;
    var rows = Array.isArray(chartRows) ? chartRows : [];
    var values = rows.map(function (row) {
      return firstNumber(row.total_sales, row.sales, row.total, row.amount, 0);
    });
    if (!values.length) values = [0, 0, 0, 0, 0, 0, 0];
    chart.data.datasets.forEach(function (dataset) { dataset.data = values.slice(-7); });
    chart.update('none');
  }

  async function repairDashboard() {
    if (route() !== 'dashboard' || busy) return;
    var root = document.getElementById('viewRoot');
    if (!root || !root.querySelector('.kpi-card')) return;
    busy = true;
    try {
      // Never display the application's old demo/default KPI values while
      // live records are being resolved. A new/empty POS must display zero.
      zeroDashboard();

      var results = await Promise.all([
        getJson('/api/dashboard/stats').catch(function () { return {}; }),
        getJson('/api/dashboard/sales-chart').catch(function () { return []; })
      ]);
      var stats = results[0] || {};
      var chart = results[1] || [];

      var todaySales = firstNumber(stats.today_sales, stats.total_sales_today, 0);
      var todayProfit = firstNumber(stats.today_profit, stats.gross_profit_today, 0);
      var transactions = firstNumber(stats.transactions, stats.total_transactions, 0);

      // Profit cannot exist without a sale/transaction in a clean POS.
      // This also prevents stale legacy profit data from appearing on the
      // dashboard after the Product/Inventory rebuild.
      if (todaySales <= 0 || transactions <= 0) todayProfit = 0;

      setKpi('Today’s Sales', todaySales, true);
      setKpi('Today’s Profit', todayProfit, true);
      setKpi('Cash in Till', firstNumber(stats.cash_in_till, 0), true);
      setKpi('Mpesa Collections', firstNumber(stats.mpesa_collections, 0), true);
      setKpi('Transactions', transactions, false);
      setKpi('Pending Quotations', firstNumber(stats.pending_quotations, 0), false);
      setKpi('Credit Sales', firstNumber(stats.credit_sales, 0), true);
      setKpi('Low Stock Items', firstNumber(stats.low_stock_items, 0), false);
      setKpi('Out of Stock Items', firstNumber(stats.out_of_stock_items, 0), false);
      updateChart(chart);
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(repairDashboard, 120);
  }

  window.addEventListener('hashchange', schedule);
  window.addEventListener('load', schedule);
  new MutationObserver(function () {
    if (route() === 'dashboard') schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
