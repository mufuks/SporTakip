import { state } from './state.js';

// ==================== THEME MANAGEMENT ====================
export function applyTheme(theme) {
  state.currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sportakip-theme', theme);

  const desktopIcon = document.getElementById('theme-icon-desktop');
  const desktopLabel = document.getElementById('theme-label-desktop');
  const mobileIcon = document.getElementById('theme-icon-mobile');

  const isLight = theme === 'light';
  if (desktopIcon) desktopIcon.innerText = isLight ? '☀️' : '🌙';
  if (desktopLabel) desktopLabel.innerText = isLight ? 'Açık Tema' : 'Koyu Tema';
  if (mobileIcon) mobileIcon.innerText = isLight ? '☀️' : '🌙';

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isLight ? '#f8fafc' : '#090b10');
  }
}

export function toggleTheme() {
  const nextTheme = state.currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  showToast(nextTheme === 'light' ? '☀️ Açık Tema Aktif Edildi' : '🌙 Koyu Tema Aktif Edildi');
}
window.toggleTheme = toggleTheme;

// ==================== TOAST NOTIFICATION ====================
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = type === 'success' 
    ? '<img src="/images/tiger1_badge.png?v=2.7.5" class="tiger-icon-inline tiger-icon-sm">' 
    : type === 'info' ? 'ℹ️' : '⚠️';
  toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
window.showToast = showToast;

// ==================== MODAL MANAGEMENT ====================
export function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
window.openModal = openModal;

export function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
window.closeModal = closeModal;

// ==================== STRING & ESCAPING HELPERS ====================
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

export function escapeJsString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}
window.escapeJsString = escapeJsString;

export function getAthleteInitials(name) {
  if (!name) return 'SP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
window.getAthleteInitials = getAthleteInitials;

export function formatCurrency(amount) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0);
}
window.formatCurrency = formatCurrency;

export function formatMoney(num) {
  return '₺' + Number(num || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
window.formatMoney = formatMoney;

// ==================== DATE & CALENDAR HELPERS ====================
export function getStartOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0: Paz, 1: Pzt, ..., 6: Cmt
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
window.getStartOfWeekMonday = getStartOfWeekMonday;

export function formatDateToIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
window.formatDateToIso = formatDateToIso;

// ==================== PROGRESS BAR ====================
export function renderSegmentedBar(used, total) {
  const bar = document.getElementById('pkg-segmented-bar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.setAttribute('aria-label', `${used} / ${total} ders tamamlandı`);
  for (let i = 0; i < total; i++) {
    const pill = document.createElement('span');
    pill.className = `v0-segmented-pill ${i < used ? 'filled' : ''}`;
    bar.appendChild(pill);
  }
}
window.renderSegmentedBar = renderSegmentedBar;
