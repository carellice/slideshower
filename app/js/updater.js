// Controllo aggiornamenti: confronta la versione installata con l'ultima release su GitHub.
const Updater = (() => {
  const API = `https://api.github.com/repos/${APP_REPO}/releases/latest`;
  const PAGE = `https://github.com/${APP_REPO}/releases/latest`;

  // > 0 se a è più recente di b (es. "1.10.0" > "1.9.3")
  function compare(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  async function check() {
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (r.status === 404) return { latest: null, newer: false, page: PAGE };
    if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`);
    const rel = await r.json();
    const latest = String(rel.tag_name || '').replace(/^v/i, '');
    const asset = (rel.assets || []).find((a) => a.name === Platform.updateAsset);
    return {
      latest,
      newer: compare(latest, APP_VERSION) > 0,
      url: asset ? asset.browser_download_url : null,
      page: rel.html_url || PAGE,
    };
  }

  return { check, compare, PAGE, current: APP_VERSION };
})();
