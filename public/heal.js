// Самовосстановление: если скрипт или стили не загрузились (битый кэш после обновления), сбрасываем кэш и перезагружаем страницу один раз
(function () {
  function heal() {
    try { if (sessionStorage.getItem('healed')) return; sessionStorage.setItem('healed', '1'); } catch (e) { return; }
    var jobs = [];
    try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (r) { return Promise.all(r.map(function (x) { return x.unregister(); })); })); } catch (e) { /* без service worker */ }
    try { if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) { /* без кэша */ }
    Promise.all(jobs).catch(function () {}).then(function () { location.replace(location.pathname + '?r=' + Date.now()); });
  }
  window.addEventListener('error', function (e) { var t = e.target; if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) heal(); }, true);
  setTimeout(function () { if (!window.__appReady) heal(); }, 8000);
})();
