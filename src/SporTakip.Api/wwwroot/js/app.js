import { Api } from './api.js?v=3.0.0';
import { state } from './modules/state.js';
import { 
  applyTheme, toggleTheme, showToast, openModal, closeModal, 
  escapeHtml, escapeJsString, formatMoney, formatCurrency, 
  getAthleteInitials, getStartOfWeekMonday, formatDateToIso, renderSegmentedBar 
} from './modules/utils.js';
import { 
  getGymContactInfo, updateGlobalGymContactElements, renderStudioContactCardHtml,
  openOtpDrawer, closeOtpDrawer, handleOtpBackdropClick, goToPhoneStep, goToCodeStep,
  startOtpTimer, handlePhoneInput, submitSendOtp, resendOtp, checkCodeComplete,
  submitVerifyOtp, setupOtpBoxListeners, updateAppAvatars, handleLogout,
  handleAvatarClick, handleAvatarFileUpload, resetAvatarToDefault 
} from './modules/auth.js';
import { 
  loadAttendanceView, renderCapacityWeekStrip, selectCapacityDate, changeCapacityDay,
  jumpCapacityToday, handleCapacityDateChange, loadCapacitySlots, renderCapacitySlots,
  selectSlotHour, clearSlotFilter, setAttendanceFilter, applyAttendanceFilter,
  renderAttendanceList, handleTrainerSelectionChange, handleQuickAttendance, filterAttendance,
  loadDashboardView, loadMembersView, handleMemberSearch, getRoleBadgeHtml,
  loadKasaView, handleHakedisMonthChange, loadMyEarningsView,
  loadTrainers, renderTrainersTable, openEditTrainerModal, handleUpdateTrainerSubmit,
  updateTrainerSelects, openNewTrainerModal, handleCreateTrainer,
  loadPackagesAdmin, renderPackagesTable, openCreatePackageModal, openEditPackageModal,
  handleSavePackage, handleDeletePackage,
  changeCalendarMonth, goToTodayCalendar, loadCalendarView, renderCalendarGrid,
  selectCalendarDay, closeCalendarDayDetails, openScheduleModalForSelectedDate,
  openNewMemberModal, handleCreateMember, openEditMemberModal, handleUpdateMember,
  openEditMemberNotesModal, handleSaveMemberNotes, openNewSubModalForMember,
  updatePackagePriceField, handleCreateSubscription, openPaymentModal, handleAddPayment,
  openWhatsAppModal, sendWhatsAppTemplate,
  openScheduleSessionModal, handleScheduleSession, openEditSessionModal, handleSaveEditSession,
  handleDeleteSessionClick
} from './modules/staff.js';
import { 
  loadAthleteHome, renderSessionsList, getRealisticSlotsForDate,
  setCalendarWeekView, selectCalendarToday, selectCalendarDate,
  loadAthleteSessionsView, handleBookSession, handleCancelReservation,
  renderAthleteProfile, recalcProfileBmi, submitSaveAthleteMetrics,
  handleNotificationClick, openNotificationDrawer, closeNotificationDrawer,
  handleNotificationBackdropClick, togglePushPermission, updatePushUi,
  renderNotificationItems, markAllNotificationsRead,
  openLeadModal, handleLeadSubmit
} from './modules/athlete.js';
import { 
  switchWorkoutSubTab, loadWorkoutHub, loadWorkoutTemplates,
  startNewWorkout, startWorkoutTimer, renderLiveWorkoutView,
  autoCalc1Rm, toggleSetLog, openFinishWorkoutModal,
  setWorkoutRating, submitFinishWorkout, loadWorkoutProgress 
} from './modules/workouts.js';
import { 
  loadSuperAdminView, sortSuperAdminUsers, filterSuperAdminByRole,
  filterSuperAdminUsers, filterAndRenderSuperAdminUsers,
  updateSortIcons, updateRoleCounts, renderSuperAdminUsersTable,
  openEditUserModal, toggleTrainerFields, handleSaveEditUser,
  handleAssignRole, openCreateGymOwnerModal, handleCreateGymOwnerSubmit 
} from './modules/admin.js';

// Workspace / App Mode State
let currentAppMode = localStorage.getItem('sportakip_app_mode') || 'athlete';
let currentTab = localStorage.getItem('sportakip_tab') || 'home';
let currentAthleteTab = currentTab;
window.currentTab = currentTab;
window.currentAthleteTab = currentAthleteTab;

// Universal Navigation & Role-Based Access Control (RBAC)
window.navigateTo = function(tabName) {
  const user = Api.getUser();
  const token = Api.getToken();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isSuperAdmin = roles.includes('SuperAdmin');
  const isAdmin = roles.includes('Admin') || isSuperAdmin;
  const isCoach = roles.includes('Coach') || isAdmin;
  const canAccessAdminPanel = isSuperAdmin || isAdmin;

  // RBAC validation: Staff-only tabs
  const staffTabs = ['yoklama', 'takvim', 'dashboard', 'uyeler', 'kasa', 'hakedisim'];
  if (staffTabs.includes(tabName)) {
    if (!token || !user || !isCoach) {
      showToast('Bu sayfaya erişmek için antrenör veya yönetici yetkisi gereklidir.', 'error');
      tabName = 'home';
      currentAppMode = 'athlete';
    } else if ((tabName === 'kasa' || tabName === 'dashboard') && !isAdmin) {
      showToast('Yönetim ve kasa sayfası yalnızca salon yöneticilerine açıktır.', 'error');
      tabName = 'hakedisim';
      currentAppMode = 'staff';
    } else {
      currentAppMode = 'staff';
    }
  } else if (tabName === 'superadmin') {
    if (!token || !user || !canAccessAdminPanel) {
      showToast('Platform yönetim paneline erişmek için Salon Sahibi veya SuperAdmin yetkisi gereklidir.', 'error');
      tabName = 'home';
      currentAppMode = 'athlete';
    } else {
      currentAppMode = 'superadmin';
    }
  } else if (['home', 'sessions', 'workout', 'profile'].includes(tabName)) {
    currentAppMode = 'athlete';
  }
  localStorage.setItem('sportakip_app_mode', currentAppMode);

  window.currentTab = tabName;
  window.currentAthleteTab = tabName;
  currentTab = tabName;
  currentAthleteTab = tabName;
  localStorage.setItem('sportakip_tab', tabName);

  // Update active state on all navigation buttons (desktop + mobile)
  document.querySelectorAll('.v0-desk-nav-btn, .v0-nav-btn, .bottom-nav-btn, .nav-item button').forEach(btn => {
    const bTab = btn.dataset.tab || btn.dataset.athtab;
    btn.classList.toggle('active', bTab === tabName);
  });

  // Views dictionary
  const allViews = {
    home: document.getElementById('v0-view-home'),
    sessions: document.getElementById('v0-view-sessions'),
    workout: document.getElementById('v0-view-workout'),
    profile: document.getElementById('v0-view-profile'),
    yoklama: document.getElementById('view-yoklama'),
    takvim: document.getElementById('view-takvim'),
    dashboard: document.getElementById('view-dashboard'),
    uyeler: document.getElementById('view-uyeler'),
    kasa: document.getElementById('view-kasa'),
    hakedisim: document.getElementById('view-hakedisim'),
    superadmin: document.getElementById('view-superadmin')
  };

  Object.keys(allViews).forEach(key => {
    if (allViews[key]) {
      allViews[key].style.display = key === tabName ? 'block' : 'none';
    }
  });

  // Synchronize header and navigation auth state
  if (typeof updateNavForUserRole === 'function') {
    updateNavForUserRole();
  }

  // Trigger relevant view loader
  if (tabName === 'home') loadAthleteHome();
  else if (tabName === 'sessions') loadAthleteSessionsView();
  else if (tabName === 'workout') loadWorkoutHub();
  else if (tabName === 'profile') renderAthleteProfile();
  else if (tabName === 'yoklama') loadAttendanceView();
  else if (tabName === 'takvim') loadCalendarView();
  else if (tabName === 'dashboard') { loadDashboardView(); loadTrainers(); loadPackagesAdmin(); }
  else if (tabName === 'uyeler') loadMembersView();
  else if (tabName === 'kasa') loadKasaView();
  else if (tabName === 'hakedisim') loadMyEarningsView();
  else if (tabName === 'superadmin') loadSuperAdminView();

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.switchTab = window.navigateTo;
window.switchAthleteTab = window.navigateTo;

// Workspace / Mode Switcher Action
window.setAppMode = function(mode) {
  const user = Api.getUser();
  const token = Api.getToken();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isSuperAdmin = roles.includes('SuperAdmin');
  const isCoach = roles.includes('Coach') || roles.includes('Admin') || isSuperAdmin;
  const isAdmin = roles.includes('Admin') || isSuperAdmin;
  const canAccessAdminPanel = isSuperAdmin || isAdmin;

  if (mode === 'superadmin' && (!token || !user || !canAccessAdminPanel)) {
    showToast('Platform yönetim paneline erişmek için Salon Sahibi veya SuperAdmin yetkisi gereklidir.', 'error');
    mode = isCoach ? 'staff' : 'athlete';
  } else if (mode === 'staff' && (!token || !user || !isCoach)) {
    showToast('Salon masasına erişmek için antrenör veya yönetici yetkisi gereklidir.', 'error');
    mode = 'athlete';
  }

  currentAppMode = mode;
  localStorage.setItem('sportakip_app_mode', mode);

  // Apply nav filtering
  updateNavForUserRole();

  // Navigate to appropriate view
  const staffTabs = ['yoklama', 'takvim', 'dashboard', 'uyeler', 'kasa', 'hakedisim'];
  if (mode === 'athlete' && (staffTabs.includes(currentTab) || currentTab === 'superadmin')) {
    window.navigateTo('home');
  } else if (mode === 'staff' && (!staffTabs.includes(currentTab) || currentTab === 'superadmin')) {
    window.navigateTo('yoklama');
  } else if (mode === 'superadmin') {
    window.navigateTo('superadmin');
  }
};

window.toggleAppMode = function() {
  const user = Api.getUser();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const canAccessAdmin = roles.includes('SuperAdmin') || roles.includes('Admin');
  if (canAccessAdmin) {
    if (currentAppMode === 'athlete') window.setAppMode('staff');
    else if (currentAppMode === 'staff') window.setAppMode('superadmin');
    else window.setAppMode('athlete');
  } else {
    window.setAppMode(currentAppMode === 'athlete' ? 'staff' : 'athlete');
  }
};

// Dynamic Role-Based UI Adjuster
window.updateNavForUserRole = function() {
  const user = Api.getUser();
  const token = Api.getToken();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isSuperAdmin = roles.includes('SuperAdmin');
  const isAdmin = roles.includes('Admin') || isSuperAdmin;
  const isCoach = roles.includes('Coach') || isAdmin;
  const canAccessAdminPanel = isSuperAdmin || isAdmin;

  if (!canAccessAdminPanel && currentAppMode === 'superadmin') {
    currentAppMode = isCoach ? 'staff' : 'athlete';
  } else if (!isCoach && currentAppMode === 'staff') {
    currentAppMode = 'athlete';
  }

  // 1. Mode Switcher visibility and state
  const modeSwitcher = document.getElementById('app-mode-switcher');
  const athleteBtn = document.getElementById('mode-btn-athlete');
  const staffBtn = document.getElementById('mode-btn-staff');
  const superAdminBtn = document.getElementById('mode-btn-superadmin');
  if (modeSwitcher) {
    const showSwitcher = isCoach || canAccessAdminPanel;
    modeSwitcher.style.setProperty('display', showSwitcher ? 'inline-flex' : 'none', 'important');
    modeSwitcher.classList.toggle('hidden-switcher', !showSwitcher);
    if (athleteBtn) athleteBtn.classList.toggle('active', currentAppMode === 'athlete');
    if (staffBtn) staffBtn.classList.toggle('active', currentAppMode === 'staff');
    if (superAdminBtn) {
      superAdminBtn.style.display = canAccessAdminPanel ? 'inline-flex' : 'none';
      superAdminBtn.classList.toggle('active', currentAppMode === 'superadmin');
    }
  }

  // 2. Navigation buttons visibility (Desktop & Mobile Bottom Nav)
  // Athlete Items
  document.querySelectorAll('.nav-athlete-item').forEach(el => {
    const isBottomNav = el.classList.contains('v0-nav-btn');
    el.style.display = currentAppMode === 'athlete' ? (isBottomNav ? 'flex' : 'inline-flex') : 'none';
  });

  // Staff Items
  document.querySelectorAll('.nav-staff-item, .staff-tab').forEach(el => {
    if (currentAppMode !== 'staff') {
      el.style.display = 'none';
      return;
    }
    const tab = el.dataset.tab;
    const isBottomNav = el.classList.contains('v0-nav-btn');
    const displayStyle = isBottomNav ? 'flex' : 'inline-flex';
    if (tab === 'kasa' || tab === 'dashboard') {
      el.style.display = isAdmin ? displayStyle : 'none';
    } else if (tab === 'hakedisim') {
      el.style.display = isCoach ? displayStyle : 'none';
    } else {
      el.style.display = isCoach ? displayStyle : 'none';
    }
  });

  // SuperAdmin Desktop & Mobile Navigation Items
  const navSuperAdminBtn = document.getElementById('nav-btn-superadmin');
  const mobSuperAdminBtn = document.getElementById('mob-btn-superadmin');
  if (navSuperAdminBtn) {
    navSuperAdminBtn.style.display = (currentAppMode === 'superadmin' && canAccessAdminPanel) ? 'inline-flex' : 'none';
    navSuperAdminBtn.classList.toggle('active', currentTab === 'superadmin');
  }
  if (mobSuperAdminBtn) {
    mobSuperAdminBtn.style.display = (currentAppMode === 'superadmin' && canAccessAdminPanel) ? 'flex' : 'none';
    mobSuperAdminBtn.classList.toggle('active', currentTab === 'superadmin');
  }

  // 3. Header user pill & actions
  const loginHeaderBtn = document.getElementById('v0-login-header-btn');
  const headerUserPill = document.getElementById('header-user-pill');
  const roleEl = document.getElementById('athlete-status-label');
  const badgeDot = document.getElementById('athlete-badge-dot');
  const greetingName = document.getElementById('athlete-greeting-name');

  if (user && token) {
    if (loginHeaderBtn) loginHeaderBtn.style.display = 'none';
    if (headerUserPill) headerUserPill.style.display = 'inline-flex';
    if (greetingName) greetingName.innerText = user.fullName || user.phoneNumber || 'Sporcu';
    if (badgeDot) {
      badgeDot.style.background = isSuperAdmin ? '#c084fc' : (roles.includes('Admin') ? '#f59e0b' : '#CCFF00');
    }
    if (roleEl) {
      roleEl.innerText = isSuperAdmin ? '🛡️ SuperAdmin' : (roles.includes('Admin') ? 'Yönetici' : isCoach ? 'Antrenör' : 'Sporcu');
    }
  } else {
    if (loginHeaderBtn) loginHeaderBtn.style.display = 'inline-flex';
    if (headerUserPill) headerUserPill.style.display = 'none';
    if (greetingName) greetingName.innerText = 'Misafir';
    if (badgeDot) badgeDot.style.background = 'rgba(255, 255, 255, 0.3)';
    if (roleEl) roleEl.innerText = 'Giriş Yapılmadı';
  }
};

window.loadInitialData = async function() {
  if (typeof loadTrainers === 'function') await loadTrainers().catch(() => {});
  if (typeof loadMembersView === 'function') await loadMembersView().catch(() => {});
  if (typeof loadAttendanceView === 'function') await loadAttendanceView().catch(() => {});
};

// ==================== PWA INSTALL & LIFECYCLE CONTROLLER ====================
let deferredInstallPrompt = null;

export function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}
window.isAppInstalled = isAppInstalled;

export function isIosDevice() {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()) && !window.MSStream;
}
window.isIosDevice = isIosDevice;

window.triggerPwaInstall = async function() {
  if (isAppInstalled()) {
    showToast('✓ SporTakip zaten bu cihazda mobil uygulama olarak kurulu!');
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try {
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        showToast('⚡ SporTakip uygulaması cihazınıza kuruldu!');
        window.dismissPwaBanner();
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
    deferredInstallPrompt = null;
  } else if (isIosDevice()) {
    openModal('modal-pwa-ios-guide');
  } else {
    showToast('Tarayıcınızın adres çubuğundaki veya menüsündeki "Uygulamayı Yükle" seçeneğiyle kurabilirsiniz.', 'info');
  }
};

window.dismissPwaBanner = function() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.classList.remove('show');
    setTimeout(() => { banner.style.display = 'none'; }, 350);
  }
  localStorage.setItem('sportakip_pwa_dismissed', Date.now().toString());
};

function initPwaInstallFlow() {
  // Capture beforeinstallprompt for Chrome / Android / Edge
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // Track appinstalled event
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    showToast('🎉 SporTakip başarıyla ana ekranınıza yüklendi!');
    if (window.renderAthleteProfile && window.currentAthleteTab === 'profile') {
      window.renderAthleteProfile();
    }
  });
}

// ==================== BOOTSTRAP ====================
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.update();
    }).catch((err) => {
      console.warn('[PWA] ServiceWorker registration failed:', err);
    });
  }
  setupOtpBoxListeners();
  updateAppAvatars();
  updateNavForUserRole();
  initPwaInstallFlow();
  getGymContactInfo().catch(() => {});

  // Oturum açık ise profili ve güncel rolleri arka planda tazeleyelim
  if (Api.getToken()) {
    Api.getMe().then((freshUser) => {
      if (freshUser) {
        Api.setUser(freshUser);
        updateNavForUserRole();
      }
    }).catch(() => {});
  }

  const urlParams = new URLSearchParams(window.location.search);
  const requestedTab = urlParams.get('tab') || localStorage.getItem('sportakip_tab') || 'home';
  window.navigateTo(requestedTab);
});
