// Lightweight In-Memory HTML Partial Cache
const partialCache = new Map();

export async function fetchPartial(url) {
  if (partialCache.has(url) && !window.location.search.includes('reload')) {
    return partialCache.get(url);
  }
  const sep = url.includes('?') ? '&' : '?';
  const cacheBustUrl = `${url}${sep}v=3.8.37&_t=${Date.now()}`;
  const res = await fetch(cacheBustUrl);
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
  hakedisim: { file: '/views/staff/hakedisim.html', id: 'view-hakedisim' },
  superadmin: { file: '/views/admin/superadmin.html', id: 'view-superadmin' }
};

export async function ensureViewLoaded(tabName) {
  const route = viewRoutes[tabName];
  if (!route) return null;

  if (window.location.search.includes('reload')) {
    const existing = document.getElementById(route.id);
    if (existing) existing.remove();
    partialCache.delete(route.file);
  }

  let el = document.getElementById(route.id);
  if (el && (tabName !== 'workout' || el.querySelector('#progress-summary-card'))) return el;
  if (el && tabName === 'workout' && !el.querySelector('#progress-summary-card')) {
    el.remove();
    partialCache.delete(route.file);
  }

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
      while (temp.firstElementChild) {
        const child = temp.firstElementChild;
        if (child.id) {
          const old = document.getElementById(child.id);
          if (old) {
            if (old.id === 'v0-otp-drawer') {
              temp.removeChild(child);
              continue;
            }
            old.remove();
          }
        }
        container.appendChild(child);
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
