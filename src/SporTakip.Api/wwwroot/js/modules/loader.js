// Lightweight In-Memory HTML Partial Cache
const partialCache = new Map();

export async function fetchPartial(url) {
  if (partialCache.has(url)) {
    return partialCache.get(url);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Kısmi HTML yüklenemedi: ${url} (${res.status})`);
  }
  const text = await res.text();
  partialCache.set(url, text);
  return text;
}

export const viewRoutes = {
  home: { file: '/views/athlete/home.html', id: 'v0-view-home' },
  sessions: { file: '/views/athlete/sessions.html', id: 'v0-view-sessions' },
  workout: { file: '/views/athlete/workout.html', id: 'v0-view-workout' },
  profile: { file: '/views/athlete/profile.html', id: 'v0-view-profile' },
  yoklama: { file: '/views/staff/yoklama.html', id: 'view-yoklama' },
  takvim: { file: '/views/staff/takvim.html', id: 'view-takvim' },
  dashboard: { file: '/views/staff/dashboard.html', id: 'view-dashboard' },
  uyeler: { file: '/views/staff/uyeler.html', id: 'view-uyeler' },
  kasa: { file: '/views/staff/kasa.html', id: 'view-kasa' },
  hakedisim: { file: '/views/staff/hakedisim.html', id: 'view-hakedisim' },
  superadmin: { file: '/views/admin/superadmin.html', id: 'view-superadmin' }
};

export async function ensureViewLoaded(tabName) {
  const route = viewRoutes[tabName];
  if (!route) return null;

  let el = document.getElementById(route.id);
  if (el) return el;

  const container = document.getElementById('app-views-container');
  if (!container) return null;

  const html = await fetchPartial(route.file);
  const temp = document.createElement('div');
  temp.innerHTML = html.trim();
  el = temp.firstElementChild;
  if (el) {
    container.appendChild(el);
  }
  return el;
}

export async function preloadModals() {
  const container = document.getElementById('modals-root');
  if (!container) return;

  const modalFiles = [
    '/modals/auth-modals.html',
    '/modals/workout-modals.html',
    '/modals/member-modals.html',
    '/modals/staff-modals.html',
    '/modals/session-modals.html',
    '/modals/athlete-modals.html',
    '/modals/admin-modals.html'
  ];

  await Promise.all(modalFiles.map(async (file) => {
    try {
      const html = await fetchPartial(file);
      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      while (temp.firstChild) {
        container.appendChild(temp.firstChild);
      }
    } catch (err) {
      console.warn('[Loader] Modal preload failed for', file, err);
    }
  }));

  // Re-bind listeners that depend on modal DOM nodes
  if (typeof window.setupOtpBoxListeners === 'function') {
    window.setupOtpBoxListeners();
  }
}
