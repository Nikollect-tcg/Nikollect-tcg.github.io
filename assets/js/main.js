// main.js
// - Inject header/nav
// - Load modals partial
// - Load page partials on navigation (client-side routing)
// - Calls pageInit hooks defined in appLogic.js (if present)

(async function () {
  // Simple helper pour charger un partial HTML
  async function loadPartial(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur de chargement: ${url}`);
    return await res.text();
  }

  // Inject header and nav
  const headerHtml = `
  <div class="container mx-auto px-4 py-3 flex justify-between items-center">
    <div class="flex items-center space-x-2">
      <i class="fas fa-pokeball text-pokemon-red text-2xl"></i>
      <h1 class="text-xl font-bold text-gray-800 dark:text-white">PokéCollect</h1>
    </div>
    <div class="flex items-center space-x-4">
      <button id="theme-toggle" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
        <i class="fas fa-moon dark:hidden"></i>
        <i class="fas fa-sun hidden dark:block"></i>
      </button>
      <div class="relative">
        <button id="user-menu-button" class="flex items-center space-x-2">
          <span class="font-medium text-gray-700 dark:text-gray-300">Utilisateur</span>
          <img class="w-8 h-8 rounded-full" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="Profil">
        </button>
        <div id="user-menu" class="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-10">
          <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Profil</a>
          <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Paramètres</a>
          <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Déconnexion</a>
        </div>
      </div>
    </div>
  </div>`;
  document.getElementById('site-header').innerHTML = headerHtml;

  const navHtml = `
  <div class="container mx-auto px-4">
    <div class="flex space-x-1 overflow-x-auto">
      <button class="nav-btn px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hover:text-pokemon-blue dark:hover:text-pokemon-yellow transition" data-page="dashboard"><i class="fas fa-home mr-2"></i> Tableau de bord</button>
      <button class="nav-btn px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hover:text-pokemon-blue dark:hover:text-pokemon-yellow transition" data-page="collection"><i class="fas fa-folder-open mr-2"></i> Collection</button>
      <button class="nav-btn px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hover:text-pokemon-blue dark:hover:text-pokemon-yellow transition" data-page="wishlist"><i class="fas fa-star mr-2"></i> Wishlist</button>
      <button class="nav-btn px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hover:text-pokemon-blue dark:hover:text-pokemon-yellow transition" data-page="inventory"><i class="fas fa-box-open mr-2"></i> Items scellés</button>
    </div>
  </div>`;
  document.getElementById('site-nav').innerHTML = navHtml;

  // Theme init
  function initTheme() {
    if (localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', function () {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
  }

  // User menu
  function initUserMenu() {
    const userMenuButton = document.getElementById('user-menu-button');
    const userMenu = document.getElementById('user-menu');
    userMenuButton.addEventListener('click', function () { userMenu.classList.toggle('hidden'); });
    document.addEventListener('click', function (event) {
      if (!userMenuButton.contains(event.target) && !userMenu.contains(event.target)) {
        userMenu.classList.add('hidden');
      }
    });
  }

  // Basic client-side routing / page loader
  const app = document.getElementById('app');
  const modalsContainer = document.getElementById('modals-container');

  // Maps
  const pagesMap = {
    dashboard: 'pages/dashboard.html',
    collection: 'pages/collection.html',
    wishlist: 'pages/wishlist.html',
    inventory: 'pages/inventory.html'
  };

  // Load modals once
  try {
    const modalsHtml = await loadPartial('pages/modals.html');
    modalsContainer.innerHTML = modalsHtml;
  } catch (err) {
    console.warn('Impossible de charger modals.html :', err);
  }

  // Page init hook holder (appLogic.js défini avant main.js)
  window.pageInit = window.pageInit || {};

  async function showPage(pageId, push = true) {
    if (!pagesMap[pageId]) {
      console.error('Page inconnue:', pageId);
      return;
    }
    try {
      const html = await loadPartial(pagesMap[pageId]);
      app.innerHTML = html;

      // set active class on nav
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === pageId) btn.classList.add('active');
      });

      // Call page-specific initializer if exists
      const initFn = window.pageInit[pageId];
      if (typeof initFn === 'function') {
        initFn();
      }

      if (push) history.pushState({ page: pageId }, '', `#${pageId}`);
    } catch (err) {
      app.innerHTML = `<div class="text-red-500">Erreur de chargement de la page.</div>`;
      console.error(err);
    }
  }

  // Attach click on nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function () { showPage(this.dataset.page); });
  });

  // Handle browser navigation
  window.addEventListener('popstate', (ev) => {
    const state = ev.state;
    const page = state && state.page ? state.page : (location.hash ? location.hash.substring(1) : 'dashboard');
    showPage(page, false);
  });

  // Initialize header-level interactions
  initTheme();
  initUserMenu();

  // Default page
  const initialPage = location.hash ? location.hash.substring(1) : 'dashboard';
  showPage(initialPage, false);
})();
