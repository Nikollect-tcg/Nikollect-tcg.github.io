// appLogic.js (mis à jour)
// Ajout : récupération initiale des prix TCGdex pour la modale de détail carte
// Conserve la logique de stockage, génération d'UI, modales, etc.

(function () {
  // --- Storage helpers ---
  function loadFrom(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }
  function saveTo(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Initialize data
  let collectionData = loadFrom('collectionData');
  let wishlistData = loadFrom('wishlistData');
  let sealedItemsData = loadFrom('sealedItemsData');

  // Small local fallback dataset for sets/series (used when TCGdex not used)
  const setSeriesData = {
    "ev": { name: "Écarlate et Violet", series: ["Paldean Fates", "Lost Origin", "Scarlet & Violet"] },
    "eb": { name: "Épée et Bouclier", series: ["Sword & Shield", "Rebel Clash", "Chilling Reign"] },
    "sl": { name: "Soleil et Lune", series: ["Sun & Moon", "Burning Shadows", "Crimson Invasion"] },
    "xy": { name: "XY", series: ["XY Base", "Evolutions"] },
    "bw": { name: "Noir et Blanc", series: [] },
    "pr": { name: "Promos", series: [] },
    "di": { name: "Divers", series: [] }
  };

  // --- Utils ---
  function formatCurrency(val, currency = 'EUR') {
    if (val === null || val === undefined || isNaN(Number(val))) return 'N/A';
    try {
      const locale = navigator.language || 'fr-FR';
      const opts = { style: 'currency', currency: currency === 'EUR' ? 'EUR' : currency };
      return new Intl.NumberFormat(locale, opts).format(Number(val));
    } catch (e) {
      return (currency === 'EUR' ? '€' : '') + Number(val).toFixed(2);
    }
  }

  // --- TCGdex Integration ---
  // Base URL pattern: https://api.tcgdx.net/v2/{lang}/
  const TCGDEX_BASE = 'https://api.tcgdx.net/v2';

  // Supported languages for the language select
  const SUPPORTED_LANGS = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'jp', label: '日本語' }
  ];

  // Helper to call TCGdex endpoints with basic error handling
  async function tcgdexFetch(lang, path, params = {}) {
    const url = new URL(`${TCGDEX_BASE}/${lang}/${path}`);
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        url.searchParams.append(k, params[k]);
      }
    });
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`TCGdex API error ${res.status}`);
      }
      const json = await res.json();
      return json;
    } catch (err) {
      console.warn('TCGdex fetch failed', err);
      return { error: err.message || 'fetch failed' };
    }
  }

  // Fetch series list (language-specific)
  async function fetchSeries(lang) {
    const json = await tcgdexFetch(lang, 'series', { itemsPerPage: 200 });
    if (json.error) return { error: json.error };
    return json.data || [];
  }

  // Fetch sets list (language-specific)
  async function fetchSets(lang) {
    const json = await tcgdexFetch(lang, 'sets', { itemsPerPage: 500 });
    if (json.error) return { error: json.error };
    return json.data || [];
  }

  // Search cards by name/series/set
  async function searchCards({ term, lang = 'en', series = '', set = '', page = 1, itemsPerPage = 30 }) {
    const params = {
      name: term,
      series: series || undefined,
      set: set || undefined,
      page,
      itemsPerPage
    };
    const json = await tcgdexFetch(lang, 'cards', params);
    if (json.error) return { error: json.error };
    // TCGdex typically returns { data: [...] } for lists
    return json.data || json.cards || [];
  }

  // Fetch single card by TCGdex id
  async function fetchCardById(cardId, lang = 'en') {
    const json = await tcgdexFetch(lang, `cards/${encodeURIComponent(cardId)}`);
    if (json.error) return { error: json.error };
    // may return { data: {...} } or object
    return json.data || json || null;
  }

  // Map a TCGdex card to our add-card form fields
  function mapCardToFormFields(card) {
    if (!card) return {};
    const images = card.images || {};
    let number = card.localId || card.number;
    if (!number && card.id && card.id.includes('-')) {
      number = card.id.split('-').pop();
    }
    const setId = (card.set && card.set.id) || '';
    const setName = (card.set && card.set.name) || (card.setName || '');
    const imageFront = images.large || images.small || images.artwork || images.normal || '';
    const imageBack = images.back || '';
    return {
      name: card.name || '',
      number: number || '',
      setCode: setId,
      setName: setName,
      imageFront,
      imageBack,
      tcgdexId: card.id || ''
    };
  }

  // Extract price range from a TCGdex card object
  function getPriceRangeFromCardObject(card) {
    if (!card) return null;

    // Possible price containers vary; try known keys
    const candidates = [];

    // If card.prices exists and is object
    if (card.prices && typeof card.prices === 'object') {
      Object.values(card.prices).forEach(v => {
        // v could be a number or object { low, mid, high }
        if (typeof v === 'number') candidates.push({ value: v, currency: 'EUR' });
        else if (v && typeof v === 'object') {
          ['low', 'mid', 'avg', 'average', 'high', 'market'].forEach(k => {
            if (v[k] && !isNaN(Number(v[k]))) candidates.push({ value: Number(v[k]), currency: v.currency || 'EUR' });
          });
        }
      });
    }

    // Try common root-level price fields
    ['price', 'marketPrice', 'avgPrice', 'averagePrice'].forEach(k => {
      if (card[k] && !isNaN(Number(card[k]))) candidates.push({ value: Number(card[k]), currency: 'EUR' });
    });

    // Some APIs include vendor-specific structures (e.g., tcgplayer)
    if (card.tcgplayer && card.tcgplayer.prices && typeof card.tcgplayer.prices === 'object') {
      Object.values(card.tcgplayer.prices).forEach(obj => {
        if (obj && typeof obj === 'object') {
          ['low', 'mid', 'high', 'market', 'average'].forEach(k => {
            if (obj[k] && !isNaN(Number(obj[k]))) candidates.push({ value: Number(obj[k]), currency: obj.currency || 'USD' });
          });
        }
      });
    }

    // If no numeric found, return null
    if (candidates.length === 0) return null;

    // Determine min/max/avg, unify currency if possible
    const values = candidates.map(c => Number(c.value)).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const currency = candidates[0].currency || 'EUR';

    return { min, max, avg, currency };
  }

  // Fetch prices for a card given our stored card object (attempt to find TCGdex match)
  async function fetchAndDisplayTcgdexPricesForCollectionCard(card) {
    const priceEl = document.getElementById('modal-tcgdex-price');
    if (!priceEl) return;
    priceEl.textContent = 'Recherche des prix...';

    const userLang = (navigator.language || 'en').split('-')[0] || 'en';

    try {
      // If card has an associated tcgdexId, fetch directly
      if (card.tcgdexId) {
        const res = await fetchCardById(card.tcgdexId, userLang);
        const targetCard = res && (res.data || res) || null;
        const pr = getPriceRangeFromCardObject(targetCard);
        if (pr) {
          priceEl.textContent = `${formatCurrency(pr.min, pr.currency)} - ${formatCurrency(pr.max, pr.currency)} (moyenne ${formatCurrency(pr.avg, pr.currency)})`;
        } else {
          priceEl.textContent = 'Aucun prix disponible';
        }
        return;
      }

      // Otherwise search by name + set if possible
      const setParam = card.setCode || card.set || '';
      const results = await searchCards({ term: card.name || '', lang: userLang, set: setParam, itemsPerPage: 10 });
      if (results.error) {
        priceEl.textContent = 'Erreur récupération prix';
        return;
      }
      let candidate = null;
      if (Array.isArray(results) && results.length > 0) {
        candidate = results.find(r => {
          const rnum = r.localId || r.number;
          if (rnum && card.number) return String(rnum) === String(card.number);
          if (card.setCode && r.set && (r.set.id === card.setCode || r.set.name === card.setCode)) return true;
          return false;
        });
        if (!candidate) candidate = results[0];
      }

      if (!candidate) {
        priceEl.textContent = 'Aucun prix trouvé';
        return;
      }

      const full = await fetchCardById(candidate.id, userLang);
      const fullCard = full && (full.data || full) || candidate;
      const pr = getPriceRangeFromCardObject(fullCard);
      if (pr) {
        priceEl.textContent = `${formatCurrency(pr.min, pr.currency)} - ${formatCurrency(pr.max, pr.currency)} (moyenne ${formatCurrency(pr.avg, pr.currency)})`;
        if (!card.tcgdexId && fullCard.id) {
          card.tcgdexId = fullCard.id;
          saveTo('collectionData', collectionData);
        }
      } else {
        priceEl.textContent = 'Aucun prix disponible';
      }
    } catch (err) {
      console.warn('Erreur prix TCGdex', err);
      priceEl.textContent = 'Erreur récupération prix';
    }
  }

  // --- Core functions (exposed) ---
  function loadAll() {
    collectionData = loadFrom('collectionData');
    wishlistData = loadFrom('wishlistData');
    sealedItemsData = loadFrom('sealedItemsData');
  }

  function saveAll() {
    saveTo('collectionData', collectionData);
    saveTo('wishlistData', wishlistData);
    saveTo('sealedItemsData', sealedItemsData);
  }

  // ... rest of the file unchanged (functions to generate lists, modals, pageInit) ...

  // Expose functions for other modules
  window.appLogic = {
    loadAll,
    saveAll,
    generateCollectionItems,
    generateWishlistItems,
    generateSealedItems,
    updateDashboard,
    setSeriesData,
    updateAllCardPrices,
    searchCards,
    fetchSets,
    fetchSeries,
    fetchCardById,
    getPriceRangeFromCardObject
  };
})();
