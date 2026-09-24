import { Api } from './api.js?v=2.9.0';

// State
let currentTab = 'home';
let currentAthleteTab = 'home';
window.currentTab = currentTab;
window.currentAthleteTab = currentAthleteTab;
let currentFilter = 'all'; // all, expiring, unpaid
let activeSubscriptions = [];
let allMembers = [];
let packages = [];
let allTrainers = [];
let capacitySlotsData = [];
let selectedSlotHour = null;
let currentCapacityDate = new Date().toISOString().split('T')[0];
let waTargetSub = null;

// Theme Management (Default to 'dark' for modern athletic feel)
let currentTheme = localStorage.getItem('sportakip-theme') || 'dark';

function applyTheme(theme) {
  currentTheme = theme;
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

window.toggleTheme = function() {
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  showToast(nextTheme === 'light' ? '☀️ Açık Tema Aktif Edildi' : '🌙 Koyu Tema Aktif Edildi');
};

applyTheme(currentTheme);

// DOM Elements
const views = {
  yoklama: document.getElementById('view-yoklama'),
  takvim: document.getElementById('view-takvim'),
  dashboard: document.getElementById('view-dashboard'),
  uyeler: document.getElementById('view-uyeler'),
  kasa: document.getElementById('view-kasa'),
  hakedisim: document.getElementById('view-hakedisim')
};

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = type === 'success' ? '<img src="/images/tiger1_badge.png?v=2.7.5" class="tiger-icon-inline tiger-icon-sm">' : '⚠️';
  toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal management helpers (hoisted for entire module)
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
window.openModal = openModal;

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
window.closeModal = closeModal;


// Workspace / App Mode State
let currentAppMode = localStorage.getItem('sportakip_app_mode') || 'athlete';

// Universal Navigation & Role-Based Access Control (RBAC)
window.navigateTo = function(tabName) {
  const user = Api.getUser();
  const token = Api.getToken();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isCoach = roles.includes('Coach') || roles.includes('Admin');
  const isAdmin = roles.includes('Admin');

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
    hakedisim: document.getElementById('view-hakedisim')
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
  else if (tabName === 'takvim') loadCalendarView(calYear, calMonth);
  else if (tabName === 'dashboard') { loadDashboardView(); loadTrainers(); loadPackagesAdmin(); }
  else if (tabName === 'uyeler') loadMembersView();
  else if (tabName === 'kasa') loadKasaView();
  else if (tabName === 'hakedisim') loadMyEarningsView();

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.switchTab = window.navigateTo;
window.switchAthleteTab = window.navigateTo;

// Workspace / Mode Switcher Action
window.setAppMode = function(mode) {
  const user = Api.getUser();
  const token = Api.getToken();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isCoach = roles.includes('Coach') || roles.includes('Admin');

  if (mode === 'staff' && (!token || !user || !isCoach)) {
    showToast('Salon masasına erişmek için antrenör veya yönetici yetkisi gereklidir.', 'error');
    mode = 'athlete';
  }

  currentAppMode = mode;
  localStorage.setItem('sportakip_app_mode', mode);

  // Apply nav filtering
  updateNavForUserRole();

  // Navigate to appropriate view
  const staffTabs = ['yoklama', 'takvim', 'dashboard', 'uyeler', 'kasa', 'hakedisim'];
  if (mode === 'athlete' && staffTabs.includes(currentTab)) {
    window.navigateTo('home');
  } else if (mode === 'staff' && !staffTabs.includes(currentTab)) {
    window.navigateTo('yoklama');
  }
};

window.toggleAppMode = function() {
  window.setAppMode(currentAppMode === 'athlete' ? 'staff' : 'athlete');
};

// Dynamic Role-Based UI Adjuster
window.updateNavForUserRole = function() {
  const user = Api.getUser();
  const token = Api.getToken();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isCoach = roles.includes('Coach') || roles.includes('Admin');
  const isAdmin = roles.includes('Admin');

  if (!isCoach) {
    currentAppMode = 'athlete';
  }

  // 1. Mode Switcher visibility and state
  const modeSwitcher = document.getElementById('app-mode-switcher');
  const athleteBtn = document.getElementById('mode-btn-athlete');
  const staffBtn = document.getElementById('mode-btn-staff');
  if (modeSwitcher) {
    modeSwitcher.style.setProperty('display', isCoach ? 'inline-flex' : 'none', 'important');
    modeSwitcher.classList.toggle('hidden-switcher', !isCoach);
    if (athleteBtn) athleteBtn.classList.toggle('active', currentAppMode === 'athlete');
    if (staffBtn) staffBtn.classList.toggle('active', currentAppMode === 'staff');
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
    if (badgeDot) badgeDot.style.background = '#CCFF00';
    if (roleEl) {
      roleEl.innerText = isAdmin ? 'Yönetici' : isCoach ? 'Antrenör' : 'Sporcu';
    }
  } else {
    if (loginHeaderBtn) loginHeaderBtn.style.display = 'inline-flex';
    if (headerUserPill) headerUserPill.style.display = 'none';
    if (greetingName) greetingName.innerText = 'Misafir';
    if (badgeDot) badgeDot.style.background = 'rgba(255, 255, 255, 0.3)';
    if (roleEl) roleEl.innerText = 'Giriş Yapılmadı';
  }
};


// ==================== 1. HIZLI YOKLAMA (ATTENDANCE & CAPACITY) ====================
async function loadAttendanceView() {
  const container = document.getElementById('attendance-list');
  container.innerHTML = '<div style="color:var(--text-muted); padding:40px; text-align:center;">Antrenman listesi yükleniyor...</div>';

  try {
    // Eğitmenleri ve aktif paketleri paralel al
    const [trainers, subs] = await Promise.all([
      Api.getTrainers().catch(() => []),
      Api.getActiveSubscriptions()
    ]);
    allTrainers = trainers;
    activeSubscriptions = subs;

    // Kapasite çizelgesini yükle
    await loadCapacitySlots();

    applyAttendanceFilter(currentFilter);
  } catch (err) {
    container.innerHTML = `<div style="color:var(--pulse-rose); padding:20px;">Hata: ${err.message}</div>`;
  }
}

// Kapasite Çizelgesi (BR-03)
function renderCapacityWeekStrip() {
  const stripEl = document.getElementById('capacity-week-strip');
  if (!stripEl) return;

  const now = new Date();
  const todayIso = formatDateToIso(now);
  const curDate = new Date(currentCapacityDate + 'T00:00:00');
  const monday = getStartOfWeekMonday(curDate);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  stripEl.innerHTML = days.map(d => {
    const iso = formatDateToIso(d);
    const isSelected = iso === currentCapacityDate;
    const isToday = iso === todayIso;
    const dayNum = d.getDate();
    const weekdayShort = d.toLocaleDateString('tr-TR', { weekday: 'short' });

    return `
      <div class="v0-cal-day-cell ${isSelected ? 'active' : ''} ${isToday ? 'today' : ''}"
           data-date="${iso}"
           onclick="selectCapacityDate('${iso}')"
           title="${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}"
           style="min-height:46px; padding:5px 2px 4px 2px;">
        <span class="v0-cal-day-num" style="font-size:14px;">${dayNum}</span>
        <span class="v0-cal-day-sub" style="font-size:8.5px;">${weekdayShort}</span>
        ${isToday && !isSelected ? '<span class="v0-cal-dot" style="margin-top:2px;"></span>' : ''}
      </div>
    `;
  }).join('');

  // Update readable date label
  const labelEl = document.getElementById('capacity-current-date-label');
  if (labelEl) {
    const isToday = currentCapacityDate === todayIso;
    const formatted = curDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
    labelEl.innerText = isToday ? `Bugün, ${formatted}` : formatted;
  }

  // Sync native input
  const dateInput = document.getElementById('capacity-date-picker');
  if (dateInput && dateInput.value !== currentCapacityDate) {
    dateInput.value = currentCapacityDate;
  }
}

window.selectCapacityDate = async function(dateIso) {
  if (!dateIso) return;
  currentCapacityDate = dateIso;
  selectedSlotHour = null;
  const detailsBox = document.getElementById('slot-details-box');
  if (detailsBox) detailsBox.style.display = 'none';

  renderCapacityWeekStrip();
  await loadCapacitySlots();
  applyAttendanceFilter(currentFilter);
};

window.changeCapacityDay = async function(delta) {
  const d = new Date(currentCapacityDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  await selectCapacityDate(formatDateToIso(d));
};

window.jumpCapacityToday = async function() {
  const todayIso = formatDateToIso(new Date());
  await selectCapacityDate(todayIso);
};

window.handleCapacityDateChange = async function(val) {
  if (val) {
    await selectCapacityDate(val);
  }
};

async function loadCapacitySlots() {
  renderCapacityWeekStrip();

  const date = currentCapacityDate;
  try {
    capacitySlotsData = await Api.getCapacity(date);
    renderCapacitySlots(capacitySlotsData);
  } catch (err) {
    console.error('Kapasite bilgisi alınamadı:', err);
  }
}

function renderCapacitySlots(slots) {
  const container = document.getElementById('capacity-slots-list');
  if (!container || !slots) return;

  container.innerHTML = slots.map(slot => {
    const hasMembers = slot.totalMembers > 0;
    const statusClass = (slot.statusLevel || 'comfortable').toLowerCase();
    const isActive = selectedSlotHour === slot.hour;

    let trainerSummary = 'Boş Saat';
    if (slot.trainers && slot.trainers.length > 0) {
      trainerSummary = slot.trainers.map(t => `${t.trainerName} (${t.memberCount})`).join(', ');
    }

    const countLabel = hasMembers ? `${slot.totalMembers}/${slot.capacityLimit}` : 'Boş';

    return `
      <button type="button"
              class="v0-cal-day-cell capacity-hour-cell ${hasMembers ? 'has-session ' + statusClass : 'empty'} ${isActive ? 'active' : ''}"
              onclick="selectSlotHour(${slot.hour})"
              title="${slot.timeSlot} - ${hasMembers ? slot.totalMembers + '/' + slot.capacityLimit + ' Kişi (' + trainerSummary + ')' : 'Boş Saat (Kayıt yok)'}">
        <span class="v0-cal-day-num">${slot.timeSlot}</span>
        <span class="v0-cal-day-sub">${countLabel}</span>
        <span class="v0-cal-dot ${statusClass}"></span>
      </button>
    `;
  }).join('');
}

window.selectSlotHour = function(hour) {
  if (selectedSlotHour === hour) {
    clearSlotFilter();
    return;
  }
  selectedSlotHour = hour;
  const slot = capacitySlotsData.find(s => s.hour === hour);
  const detailsBox = document.getElementById('slot-details-box');
  const detailsText = document.getElementById('slot-details-text');

  if (slot && detailsBox && detailsText) {
    const athletes = slot.members.map(m => `${m.memberName} (${m.status === 'Attended' ? 'Geldi' : 'Planlı'})`).join(', ');
    detailsText.innerHTML = `<strong>Saat ${slot.timeSlot}:</strong> Toplam ${slot.totalMembers} kişi ${athletes ? `— ${escapeHtml(athletes)}` : '(Henüz kayıt yok)'}`;
    detailsBox.style.display = 'flex';
  }

  renderCapacitySlots(capacitySlotsData);
  applyAttendanceFilter(currentFilter);
};

window.clearSlotFilter = function() {
  selectedSlotHour = null;
  const detailsBox = document.getElementById('slot-details-box');
  if (detailsBox) detailsBox.style.display = 'none';
  renderCapacitySlots(capacitySlotsData);
  applyAttendanceFilter(currentFilter);
};

window.setAttendanceFilter = function(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filterType);
  });
  applyAttendanceFilter(filterType);
};

function applyAttendanceFilter(filterType) {
  let list = activeSubscriptions;
  if (filterType === 'expiring') {
    list = activeSubscriptions.filter(s => s.remainingLessons <= 2);
  } else if (filterType === 'unpaid') {
    list = activeSubscriptions.filter(s => s.remainingBalance > 0);
  }

  // Saat dilimi seçildiyse ilgili saatteki üyeleri filtrele
  if (selectedSlotHour !== null) {
    const slot = capacitySlotsData.find(s => s.hour === selectedSlotHour);
    if (slot && slot.members.length > 0) {
      const scheduledSubIds = new Set(slot.members.map(m => m.subscriptionId));
      list = list.filter(s => scheduledSubIds.has(s.id));
    }
  }

  renderAttendanceList(list);
}

function renderAttendanceList(subs) {
  const container = document.getElementById('attendance-list');
  if (!subs || subs.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="text-align:center; padding:48px 20px;">
        <div class="v0-guest-tiger-wrap">
          <img src="/images/tiger2_badge.png?v=2.7.5" alt="" class="v0-guest-tiger-img">
        </div>
        <h3 style="font-size:20px;">Aktif paket veya seans bulunamadı</h3>
        <p style="color:var(--text-secondary); margin-top:8px;">Filtrenizi değiştirebilir, saatlik slotu temizleyebilir veya yeni seans planlayabilirsiniz.</p>
      </div>`;
    return;
  }

  container.innerHTML = subs.map(sub => {
    const isCritical = sub.remainingLessons <= 1;
    const isExpiring = sub.remainingLessons === 2;
    const cardClass = isCritical ? 'attendee-card critical' : (isExpiring ? 'attendee-card expiring' : 'attendee-card');

    const badgeColor = isCritical ? 'badge-red' : (isExpiring ? 'badge-amber' : 'badge-green');
    const badgeText = `${sub.completedLessons}/${sub.totalLessons} DERS`;

    // Multi-segment progress bar (Hevy style)
    const segments = [];
    for (let i = 1; i <= sub.totalLessons; i++) {
      const isFilled = i <= sub.completedLessons;
      const segClass = isFilled 
        ? (isCritical ? 'segment completed critical' : (isExpiring ? 'segment completed warning' : 'segment completed'))
        : 'segment';
      segments.push(`<div class="${segClass}"></div>`);
    }

    // Default primary trainer id
    const primaryTrainerId = sub.primaryTrainerId || 2; // Varsayılan Gülçin (Eğitmen)

    // Check if member already has an attendance record in the active slot (or today)
    let slotMemberRecord = null;
    let attendanceHourLabel = '';
    if (typeof capacitySlotsData !== 'undefined' && capacitySlotsData) {
      if (selectedSlotHour !== null) {
        const activeSlot = capacitySlotsData.find(s => s.hour === selectedSlotHour);
        slotMemberRecord = activeSlot?.members?.find(m => m.subscriptionId === sub.id);
        if (slotMemberRecord) attendanceHourLabel = `Saat ${activeSlot.timeSlot}`;
      } else {
        // If no slot is clicked, find any recorded attendance today for this subscription
        for (const slot of capacitySlotsData) {
          const m = slot.members?.find(m => m.subscriptionId === sub.id);
          if (m && (m.status === 'Attended' || m.status === 'Missed' || m.status === 'Excused')) {
            slotMemberRecord = m;
            attendanceHourLabel = `Saat ${slot.timeSlot}`;
            break;
          }
        }
      }
    }

    const attendanceStatus = slotMemberRecord?.status;

    return `
      <div class="${cardClass}" id="sub-card-${sub.id}">
        <div class="card-top">
          <div>
            <div class="member-name">${escapeHtml(sub.memberName)}</div>
            <div class="package-name">${escapeHtml(sub.packageName)}</div>
          </div>
          <span class="lesson-badge ${badgeColor}">${sub.remainingLessons} DERS KALDI</span>
        </div>

        <!-- Hevy-Style Visual Set Progress -->
        <div class="lesson-progress-container">
          <div class="progress-header">
            <span style="color:var(--text-secondary); font-size:11px; font-weight:700;">DERS İLERLEMESİ</span>
            <span style="font-family:var(--font-heading); font-weight:800; font-size:12px; color:var(--text-primary);">${badgeText}</span>
          </div>
          <div class="progress-segments">
            ${segments.join('')}
          </div>
        </div>

        <div class="v0-injury-badge-wrap ${sub.memberNotes ? '' : 'no-notes'}">
          <div class="v0-injury-badge-content" title="${escapeHtml(sub.memberNotes || 'Sağlık / Sakatlık notu yok')}">
            <span>${sub.memberNotes ? '⚠️' : '🩺'}</span>
            <span>${escapeHtml(sub.memberNotes || 'Sağlık / Sakatlık notu yok')}</span>
          </div>
          <button type="button" class="v0-injury-edit-btn" onclick="openEditMemberNotesModal(${sub.memberId}, '${escapeHtml(sub.memberName)}', '${escapeJsString(sub.memberNotes || '')}')" title="Sporcunun sakatlık/sağlık kısıtını düzenle">
            <span>✏️</span> ${sub.memberNotes ? 'Düzenle' : 'Not Ekle'}
          </button>
        </div>

        <!-- Hoca Seçici & İkame Kuralı (%40) -->
        <div class="coach-picker-box">
          <span style="color:var(--text-muted); font-size:11px; font-weight:700;">DERSİ VEREN:</span>
          <select id="sub-coach-${sub.id}" onchange="handleTrainerSelectionChange(${sub.id}, ${primaryTrainerId})" ${attendanceStatus ? 'disabled style="opacity:0.75;"' : ''}>
            ${allTrainers.map(t => `<option value="${t.id}" ${t.id === primaryTrainerId ? 'selected' : ''}>${escapeHtml(t.fullName)} (${escapeHtml(t.role)})</option>`).join('')}
          </select>
        </div>
        <div id="sub-substitute-badge-${sub.id}" style="display:none; font-size:11.5px; color:var(--flame-orange); font-weight:800; background:rgba(255,85,0,0.12); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,85,0,0.3);">
          <img src="/images/tiger1_badge.png?v=2.7.5" alt="" class="tiger-icon-inline tiger-icon-xs"> İkame Seans: %40 Hak Ediş Yazılacak
        </div>

        <div style="font-size:12px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
          <span>Paket: ${formatMoney(sub.price)}</span>
          ${sub.remainingBalance > 0 
            ? `<span style="color:var(--flame-orange); font-weight:800;">Kalan Borç: ${formatMoney(sub.remainingBalance)}</span>` 
            : '<span style="color:var(--volt-lime); font-weight:700;">Ödendi ✓</span>'}
        </div>

        <!-- Yoklama Aksiyonları (Tek seferlik kesin kayıt & Çelişki önleme) -->
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${attendanceStatus === 'Attended' ? `
            <div class="touch-btn already-attended" style="background:rgba(204,255,0,0.14); border:1px solid var(--volt-lime); color:var(--volt-lime); cursor:default; justify-content:center; font-weight:800; padding:12px; font-size:13.5px;" title="Yoklama kesinleşti: Bu sporcu seansa katıldı">
              <img src="/images/tiger1_badge.png?v=2.7.5" alt="" class="tiger-icon-inline tiger-icon-sm" style="margin-right:6px;"> ✓ BU SEANSTA GELDİ (${sub.completedLessons}. Ders ${attendanceHourLabel ? '· ' + attendanceHourLabel : ''})
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button class="action-btn-sm whatsapp" style="width:100%; justify-content:center;" onclick="openWhatsAppModal(${sub.id})" title="WhatsApp Akıllı Hatırlatma Şablonları">
                <span>💬</span> WhatsApp Mesajı Gönder
              </button>
            </div>
          ` : attendanceStatus === 'Missed' ? `
            <div class="touch-btn already-attended" style="background:rgba(239,68,68,0.14); border:1px solid var(--pulse-rose); color:var(--pulse-rose); cursor:default; justify-content:center; font-weight:800; padding:12px; font-size:13.5px;" title="Yoklama kesinleşti: Gelmedi (Hak yandı)">
              <span>❌</span> BU SEANSTA GELMEDİ (Ders Yandı)
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button class="action-btn-sm whatsapp" style="width:100%; justify-content:center;" onclick="openWhatsAppModal(${sub.id})" title="WhatsApp Akıllı Hatırlatma Şablonları">
                <span>💬</span> WhatsApp Mesajı Gönder
              </button>
            </div>
          ` : attendanceStatus === 'Excused' ? `
            <div class="touch-btn already-attended" style="background:rgba(245,158,11,0.14); border:1px solid var(--flame-orange); color:var(--flame-orange); cursor:default; justify-content:center; font-weight:800; padding:12px; font-size:13.5px;" title="Yoklama kesinleşti: Mazeretli telafi">
              <span>🕒</span> MAZERETLİ TELAFİ (Ders Saklı)
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button class="action-btn-sm whatsapp" style="width:100%; justify-content:center;" onclick="openWhatsAppModal(${sub.id})" title="WhatsApp Akıllı Hatırlatma Şablonları">
                <span>💬</span> WhatsApp Mesajı Gönder
              </button>
            </div>
          ` : `
            <button class="touch-btn btn-attend" onclick="handleQuickAttendance(${sub.id}, '${escapeHtml(sub.memberName)}', 'Attended')">
              <img src="/images/tiger1_badge.png?v=2.7.5" alt="" class="tiger-icon-inline tiger-icon-sm" style="margin-right:4px;"> GELDİ (DERS DÜŞ)
            </button>
            <div style="display:flex; gap:8px;">
              <button class="action-btn-sm" style="color:var(--pulse-rose);" onclick="handleQuickAttendance(${sub.id}, '${escapeHtml(sub.memberName)}', 'Missed')" title="3 saatten az kala haber veya habersiz gelmedi (Ders Yanar)">
                <span>❌</span> Gelmedi (Yandı)
              </button>
              <button class="action-btn-sm" style="color:var(--flame-orange);" onclick="handleQuickAttendance(${sub.id}, '${escapeHtml(sub.memberName)}', 'Excused')" title="En az 3 saat önce haber verdi (Hak Saklı)">
                <span>🕒</span> Mazeretli Telafi
              </button>
              <button class="action-btn-sm whatsapp" onclick="openWhatsAppModal(${sub.id})" title="WhatsApp Akıllı Hatırlatma Şablonları">
                <span>💬</span> WhatsApp
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');
}

window.handleTrainerSelectionChange = function(subId, primaryTrainerId) {
  const select = document.getElementById(`sub-coach-${subId}`);
  const badge = document.getElementById(`sub-substitute-badge-${subId}`);
  if (!select || !badge) return;
  const selectedTrainerId = parseInt(select.value);
  if (primaryTrainerId && selectedTrainerId !== primaryTrainerId) {
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
};

window.handleQuickAttendance = async function(subId, memberName, status) {
  const card = document.getElementById(`sub-card-${subId}`);
  if (card) {
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
  }

  const coachSelect = document.getElementById(`sub-coach-${subId}`);
  const trainerId = coachSelect ? parseInt(coachSelect.value) : null;

  try {
    let noteText = "Normal katılım";
    if (status === "Missed") noteText = "3 saat kuralı: Habersiz / geç iptal, hak yandı";
    else if (status === "Excused") noteText = "3 saat kuralı: En az 3 saat önce haber verildi, telafi hakkı";

    const result = await Api.markAttendance({
      subscriptionId: subId,
      trainerId: trainerId,
      status: status,
      notes: noteText
    });

    if (status === "Attended") {
      showToast(`⚡ ${memberName} yoklaması alındı! (${result.lessonNumber}. Ders)`);
    } else if (status === "Missed") {
      showToast(`❌ ${memberName} gelmedi olarak işlendi (Ders hakkı düştü).`, 'warning');
    } else if (status === "Excused") {
      showToast(`🕒 ${memberName} için mazeretli telafi işlendi (Ders hakkı saklı).`, 'warning');
    }

    await loadCapacitySlots();
    await loadAttendanceView();
  } catch (err) {
    showToast(`${err.message}`, 'warning');
    if (card) {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    }
  }
};

window.filterAttendance = function(text) {
  const query = text.toLowerCase().trim();
  const filtered = activeSubscriptions.filter(s => 
    s.memberName.toLowerCase().includes(query) || s.packageName.toLowerCase().includes(query)
  );
  renderAttendanceList(filtered);
};


// ==================== 2. DASHBOARD (YÖNETİM) ====================
async function loadDashboardView() {
  try {
    const stats = await Api.getStats();

    document.getElementById('stat-active-members').innerText = stats.totalActiveMembers;
    document.getElementById('stat-revenue-month').innerText = formatMoney(stats.totalRevenueThisMonth);
    document.getElementById('stat-collected-month').innerText = formatMoney(stats.totalCollectedThisMonth);
    document.getElementById('stat-pending-month').innerText = formatMoney(stats.totalPendingReceivables);

    document.getElementById('share-salon-month').innerText = formatMoney(stats.salonTotalShareThisMonth);
    document.getElementById('share-trainer-month').innerText = formatMoney(stats.trainerTotalShareThisMonth);
    document.getElementById('stat-lessons-count').innerText = `${stats.totalLessonsConductedThisMonth} DERS`;

    // Expiring List
    const expiringContainer = document.getElementById('dashboard-expiring-list');
    if (stats.expiringSubscriptions.length === 0) {
      expiringContainer.innerHTML = '<div style="color:var(--text-muted); padding:16px 0;">Şu an bitmek üzere olan paket bulunmuyor.</div>';
    } else {
      expiringContainer.innerHTML = stats.expiringSubscriptions.map(sub => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-subtle);">
          <div>
            <strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(sub.memberName)}</strong>
            <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(sub.packageName)} (${sub.completedLessons}/${sub.totalLessons})</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="lesson-badge ${sub.remainingLessons <= 1 ? 'badge-red' : 'badge-amber'}">${sub.remainingLessons} DERS KALDI</span>
            <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="openNewSubModalForMember(${sub.memberId}, '${escapeHtml(sub.memberName)}')">Yenile</button>
          </div>
        </div>
      `).join('');
    }

    // Unpaid List
    const unpaidContainer = document.getElementById('dashboard-unpaid-list');
    if (stats.unpaidSubscriptions.length === 0) {
      unpaidContainer.innerHTML = '<div style="color:var(--volt-lime); padding:16px 0; font-weight:700;">Tüm aktif paketlerin ödemesi tam! ✓</div>';
    } else {
      unpaidContainer.innerHTML = stats.unpaidSubscriptions.map(sub => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-subtle);">
          <div>
            <strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(sub.memberName)}</strong>
            <div style="font-size:12px; color:var(--text-muted);">Paket: ${formatMoney(sub.price)} | Ödenen: ${formatMoney(sub.paidAmount)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--flame-orange); font-weight:800; font-size:15px;">${formatMoney(sub.remainingBalance)}</span>
            <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="openPaymentModal(${sub.id}, '${escapeHtml(sub.memberName)}', ${sub.remainingBalance})">Tahsil Et</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    showToast(`İstatistikler alınamadı: ${err.message}`, 'error');
  }
}


// ==================== 3. ÜYELER ====================
async function loadMembersView(search = '') {
  const container = document.getElementById('members-table-body');
  container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Yükleniyor...</td></tr>';

  try {
    allMembers = await Api.getMembers(search);
    if (allMembers.length === 0) {
      container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:32px;">Kayıtlı üye bulunamadı.</td></tr>';
      return;
    }

    container.innerHTML = allMembers.map(m => {
      const sub = m.activeSubscription;
      const subBadge = sub 
        ? `<span class="lesson-badge badge-green">${escapeHtml(sub.packageName)} (${sub.remainingLessons} Ders Kaldı)</span>`
        : `<span style="color:var(--text-muted); font-size:12px;">Aktif Paket Yok</span>`;

      return `
        <tr>
          <td>
            <strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(m.fullName)}</strong>
            ${m.notes ? `<div style="font-size:11px; color:var(--flame-orange); margin-top:2px;">⚠️ ${escapeHtml(m.notes)}</div>` : ''}
          </td>
          <td>${m.phone ? escapeHtml(m.phone) : '<span style="color:var(--text-muted);">-</span>'}</td>
          <td>${subBadge}</td>
          <td><strong style="color:var(--cyber-cyan);">${m.totalSubscriptionsCount}</strong> Dönem</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-primary" style="padding:7px 14px; font-size:12px;" onclick="openNewSubModalForMember(${m.id}, '${escapeHtml(m.fullName)}')">
                + Paket Sat
              </button>
              <button class="btn-secondary" style="padding:7px 12px; font-size:12px;" onclick="openEditMemberModal(${m.id})">
                ✏️ Düzenle
              </button>
              ${sub && sub.remainingBalance > 0 ? `
                <button class="btn-secondary" style="padding:7px 12px; font-size:12px; color:var(--flame-orange);" onclick="openPaymentModal(${sub.id}, '${escapeHtml(m.fullName)}', ${sub.remainingBalance})">
                  Tahsil Et
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="6" style="color:var(--pulse-rose);">Hata: ${err.message}</td></tr>`;
  }
}

let memberSearchTimer = null;
window.handleMemberSearch = function(text) {
  if (memberSearchTimer) clearTimeout(memberSearchTimer);
  memberSearchTimer = setTimeout(() => {
    loadMembersView(text);
  }, 300);
};


function getRoleBadgeHtml(role) {
  const r = (role || '').trim();
  const lower = r.toLowerCase();
  if (lower.includes('sahib') || lower.includes('sahip') || lower.includes('owner') || lower.includes('admin') || lower.includes('yönetici')) {
    return `<span class="role-badge role-badge-owner">👑 ${escapeHtml(r)}</span>`;
  }
  if (lower === 'pt' || lower.includes('personal')) {
    return `<span class="role-badge role-badge-pt">⚡ ${escapeHtml(r)}</span>`;
  }
  return `<span class="role-badge role-badge-coach">🏋️ ${escapeHtml(r || 'Eğitmen')}</span>`;
}

// ==================== 4. KASA & HAKEDİŞ ====================
async function loadKasaView() {
  const container = document.getElementById('payroll-table-body');
  container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Yükleniyor...</td></tr>';

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const payroll = await Api.getPayroll(year, month);
    if (!payroll || payroll.length === 0) {
      container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Bu ay için hakediş kaydı yok.</td></tr>';
      return;
    }

    container.innerHTML = payroll.map(p => `
      <tr>
        <td style="white-space:nowrap;"><strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(p.trainerName)}</strong></td>
        <td>${getRoleBadgeHtml(p.role)}</td>
        <td><span class="lesson-badge badge-green">${p.totalLessonsGiven} Ders</span></td>
        <td style="white-space:nowrap; font-weight:600;">${formatMoney(p.totalLessonEarnings)}</td>
        <td style="white-space:nowrap;"><strong style="color:var(--cyber-cyan);">${formatMoney(p.totalPackageShare)}</strong></td>
        <td style="white-space:nowrap;"><strong style="color:var(--volt-lime); font-size:16px;">${formatMoney(p.totalEarnings)}</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="6" style="color:var(--pulse-rose);">Hata: ${err.message}</td></tr>`;
  }
}

// ==================== 4.1 KOÇ KİŞİSEL HAKEDİŞİM ====================
let currentHakedisYear = new Date().getFullYear();
let currentHakedisMonth = new Date().getMonth() + 1;

window.handleHakedisMonthChange = function(val) {
  if (!val) return;
  const parts = val.split('-');
  currentHakedisYear = parseInt(parts[0]);
  currentHakedisMonth = parseInt(parts[1]);
  loadMyEarningsView(currentHakedisYear, currentHakedisMonth);
};

async function loadMyEarningsView(year = null, month = null) {
  const y = year || currentHakedisYear;
  const m = month || currentHakedisMonth;

  // Populate month select dropdown if empty
  const select = document.getElementById('hakedis-month-select');
  if (select && select.options.length === 0) {
    const months = [
      { y: 2026, m: 10, label: 'Ekim 2026' },
      { y: 2026, m: 9, label: 'Eylül 2026 (Bu Ay)' },
      { y: 2026, m: 8, label: 'Ağustos 2026' },
      { y: 2026, m: 7, label: 'Temmuz 2026' }
    ];
    select.innerHTML = months.map(opt => `<option value="${opt.y}-${opt.m}" ${opt.y === y && opt.m === m ? 'selected' : ''}>${opt.label}</option>`).join('');
  }

  const tbody = document.getElementById('hakedis-table-body');
  const countEl = document.getElementById('hakedis-table-count');
  const totalLessonsEl = document.getElementById('hakedis-total-lessons');
  const lessonsMetaEl = document.getElementById('hakedis-lessons-meta');
  const subLessonsEl = document.getElementById('hakedis-sub-lessons');
  const totalAmountEl = document.getElementById('hakedis-total-amount');
  const amountMetaEl = document.getElementById('hakedis-amount-meta');

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px;">Hakediş bilgileri yükleniyor...</td></tr>';

  try {
    const data = await Api.getMyEarnings(y, m);

    if (totalLessonsEl) totalLessonsEl.innerText = data.totalLessonsGiven;
    if (lessonsMetaEl) lessonsMetaEl.innerText = `${data.ownStudentLessons} Asıl · ${data.substituteLessons} İkame Ders`;
    if (subLessonsEl) subLessonsEl.innerText = `${data.substituteLessons} Seans`;
    if (totalAmountEl) totalAmountEl.innerText = formatMoney(data.totalEarnings);
    if (amountMetaEl) amountMetaEl.innerText = `${formatMoney(data.totalLessonEarnings)} prim + ${formatMoney(data.totalPackageShare)} paket payı`;
    if (countEl) countEl.innerText = `${data.lessonHistory ? data.lessonHistory.length : 0} seans listelendi`;

    if (!data.lessonHistory || data.lessonHistory.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px;">Bu ay için henüz verilmiş seans kaydı bulunmuyor.</td></tr>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = data.lessonHistory.map(item => {
        const d = new Date(item.lessonDate);
        const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        const typeBadge = item.isSubstitute 
          ? `<span class="hakedis-badge-substitute" title="İkame hoca olarak girildi (%40 prim)">⚡ %40 İkame</span>`
          : `<span class="hakedis-badge-primary">Asıl Hoca</span>`;

        const statusBadge = item.status === 'Attended'
          ? `<span class="lesson-badge badge-green" style="font-size:11px;">Geldi ✓</span>`
          : `<span class="lesson-badge badge-red" style="font-size:11px;">Yandı / Gelmedi</span>`;

        return `
          <tr>
            <td>
              <div style="font-weight:700; color:var(--text-primary);">${dateStr}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">${timeStr}</div>
            </td>
            <td><strong style="color:var(--text-primary); font-size:14px;">${escapeHtml(item.memberName)}</strong></td>
            <td><span style="font-size:12px; color:var(--text-secondary);">${escapeHtml(item.packageName)}</span></td>
            <td><span class="lesson-badge badge-cyan" style="font-size:10.5px;">${item.lessonNumber}. Ders</span></td>
            <td>${typeBadge}</td>
            <td>${statusBadge}</td>
            <td style="text-align:right;">
              <strong style="color:var(--volt-lime); font-size:15px;">+${formatMoney(item.earnedAmount)}</strong>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:var(--pulse-rose); padding:24px; text-align:center;">Hata: ${err.message}</td></tr>`;
  }
}
window.loadMyEarningsView = loadMyEarningsView;


// ==================== 5. EĞİTMEN YÖNETİMİ ====================
async function loadTrainers() {
  try {
    allTrainers = await Api.getTrainers();
    renderTrainersTable(allTrainers);
    updateTrainerSelects(allTrainers);
  } catch (err) {
    console.error("Eğitmenler yüklenemedi:", err);
  }
}

function renderTrainersTable(trainers) {
  const tbody = document.getElementById('trainers-table-body');
  if (!tbody) return;
  if (!trainers || trainers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Kayıtlı eğitmen bulunamadı.</td></tr>';
    return;
  }
  tbody.innerHTML = trainers.map(t => `
    <tr>
      <td style="white-space:nowrap;"><strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(t.fullName)}</strong></td>
      <td>${getRoleBadgeHtml(t.role)}</td>
      <td style="white-space:nowrap;">${t.phone ? escapeHtml(t.phone) : '<span style="color:var(--text-muted);">-</span>'}</td>
      <td style="white-space:nowrap;"><strong style="color:var(--flame-orange);">%${Math.round(t.defaultShareRate * 100)}</strong></td>
      <td><span class="lesson-badge badge-green">Aktif</span></td>
    </tr>
  `).join('');
}

function updateTrainerSelects(trainers) {
  const options = trainers.map(t => `<option value="${t.id}">${escapeHtml(t.fullName)} (${escapeHtml(t.role)})</option>`).join('');
  const planSelect = document.getElementById('plan-trainer');
  if (planSelect) {
    planSelect.innerHTML = options;
  }
}

window.openNewTrainerModal = function() {
  const form = document.getElementById('new-trainer-form');
  if (form) form.reset();
  const rateInput = document.getElementById('t-share-rate');
  if (rateInput) rateInput.value = "40";
  openModal('modal-new-trainer');
};

window.handleCreateTrainer = async function(e) {
  e.preventDefault();
  const fullName = document.getElementById('t-name').value.trim();
  const role = document.getElementById('t-role').value;
  const phone = document.getElementById('t-phone').value.trim();
  const shareRate = parseFloat(document.getElementById('t-share-rate').value) / 100;

  try {
    const newTrainer = await Api.createTrainer({
      fullName,
      role,
      phone,
      defaultShareRate: shareRate
    });
    showToast(`⚡ ${newTrainer.fullName} sisteme hoca olarak eklendi!`);
    closeModal('modal-new-trainer');
    await loadTrainers();
    if (currentTab === 'yoklama') {
      loadAttendanceView();
    }
  } catch (err) {
    showToast(`Hoca eklenemedi: ${err.message}`, 'error');
  }
};

// ==================== 5.1. PAKET VE FİYAT YÖNETİMİ ====================
let allPackagesAdmin = [];

async function loadPackagesAdmin() {
  try {
    allPackagesAdmin = await Api.getPackages(true); // all = true (hem aktif hem pasif)
    renderPackagesTable(allPackagesAdmin);
  } catch (err) {
    console.error("Paketler yüklenemedi:", err);
  }
}

function renderPackagesTable(pkgList) {
  const tbody = document.getElementById('packages-table-body');
  if (!tbody) return;
  if (!pkgList || pkgList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">Tanımlı paket bulunamadı.</td></tr>';
    return;
  }

  tbody.innerHTML = pkgList.map(p => `
    <tr>
      <td>
        <strong style="color:var(--text-primary); font-size:14.5px;">${escapeHtml(p.name)}</strong>
      </td>
      <td>
        <span style="font-size:11px; font-weight:700; color:var(--text-secondary); background:var(--bg-surface-elevated); padding:3px 7px; border-radius:4px; border:1px solid var(--border-subtle);">${escapeHtml(p.packageType || 'GRUP')}</span>
      </td>
      <td><strong style="color:var(--cyber-cyan);">${p.lessonCount}</strong> Seans</td>
      <td>${p.validityDays} Gün</td>
      <td><strong style="color:var(--volt-lime); font-size:14.5px;">${formatMoney(p.defaultPrice)}</strong></td>
      <td>
        ${p.isActive 
          ? '<span class="lesson-badge badge-green" style="font-size:11px;">Aktif</span>' 
          : '<span class="lesson-badge badge-red" style="font-size:11px;">Pasif</span>'}
      </td>
      <td style="text-align:right;">
        <div style="display:flex; justify-content:flex-end; gap:6px;">
          <button class="btn-secondary" style="padding:5px 10px; font-size:11.5px;" onclick="openEditPackageModal(${p.id})">
            ✏️ Düzenle
          </button>
          ${p.isActive ? `
            <button class="btn-secondary" style="padding:5px 10px; font-size:11.5px; color:var(--pulse-rose);" onclick="handleDeletePackage(${p.id}, '${escapeJsString(p.name)}')">
              ✕ Pasif
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

window.openCreatePackageModal = function() {
  document.getElementById('package-form')?.reset();
  document.getElementById('pkg-id').value = '';
  document.getElementById('package-modal-title').innerText = 'Yeni Paket Tanımla';
  document.getElementById('btn-save-package').innerText = 'Paketi Kaydet';
  const activeGroup = document.getElementById('pkg-active-group');
  if (activeGroup) activeGroup.style.display = 'none';
  openModal('modal-package');
};

window.openEditPackageModal = function(id) {
  const pkg = allPackagesAdmin.find(p => p.id === id);
  if (!pkg) return;

  document.getElementById('pkg-id').value = pkg.id;
  document.getElementById('pkg-name').value = pkg.name;
  document.getElementById('pkg-type').value = pkg.packageType || 'GRUP';
  document.getElementById('pkg-lessons').value = pkg.lessonCount;
  document.getElementById('pkg-price').value = pkg.defaultPrice;
  document.getElementById('pkg-validity').value = pkg.validityDays;

  const activeGroup = document.getElementById('pkg-active-group');
  const activeCheck = document.getElementById('pkg-is-active');
  if (activeGroup && activeCheck) {
    activeGroup.style.display = 'block';
    activeCheck.checked = pkg.isActive;
  }

  document.getElementById('package-modal-title').innerText = 'Paketi Düzenle';
  document.getElementById('btn-save-package').innerText = 'Değişiklikleri Kaydet';
  openModal('modal-package');
};

window.handleSavePackage = async function(e) {
  e.preventDefault();
  const idVal = document.getElementById('pkg-id').value;
  const isEdit = Boolean(idVal);

  const payload = {
    name: document.getElementById('pkg-name').value.trim(),
    packageType: document.getElementById('pkg-type').value,
    lessonCount: parseInt(document.getElementById('pkg-lessons').value),
    defaultPrice: parseFloat(document.getElementById('pkg-price').value),
    validityDays: parseInt(document.getElementById('pkg-validity').value)
  };

  try {
    if (isEdit) {
      payload.isActive = document.getElementById('pkg-is-active').checked;
      await Api.updatePackage(parseInt(idVal), payload);
      showToast(`✓ "${payload.name}" paketi güncellendi!`);
    } else {
      await Api.createPackage(payload);
      showToast(`⚡ Yeni paket "${payload.name}" oluşturuldu!`);
    }

    closeModal('modal-package');
    await loadPackagesAdmin();
    // Refresh cached packages for subscription creation dropdown
    packages = await Api.getPackages();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

window.handleDeletePackage = async function(id, name) {
  if (!confirm(`"${name}" paketini satıştan kaldırmak (pasife almak) istediğinize emin misiniz?`)) return;

  try {
    await Api.deletePackage(id);
    showToast(`✓ "${name}" paketi pasife alındı.`);
    await loadPackagesAdmin();
    packages = await Api.getPackages();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

window.loadPackagesAdmin = loadPackagesAdmin;

// ==================== 6. GENİŞ AYLIK SEANS TAKVİMİ ====================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;
let calSelectedDate = null;

window.changeCalendarMonth = function(delta) {
  calMonth += delta;
  if (calMonth < 1) {
    calMonth = 12;
    calYear--;
  } else if (calMonth > 12) {
    calMonth = 1;
    calYear++;
  }
  loadCalendarView(calYear, calMonth);
};

window.goToTodayCalendar = function() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  loadCalendarView(calYear, calMonth);
};

async function loadCalendarView(year, month) {
  const heading = document.getElementById('cal-month-heading');
  const grid = document.getElementById('calendar-days-grid');
  const statsDiv = document.getElementById('cal-month-stats');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-muted);">Takvim yükleniyor...</div>';

  try {
    const data = await Api.getMonthCalendar(year, month);

    if (heading) heading.innerText = data.monthName;
    if (statsDiv) {
      statsDiv.innerHTML = `Bu Ay: <strong style="color:var(--volt-lime);">${data.totalMonthSessions} Seans</strong> • <strong style="color:var(--cyber-cyan);">${data.totalMonthAthletes} Sporcu Katılımı</strong>`;
    }

    renderCalendarGrid(data.days);

    if (calSelectedDate) {
      selectCalendarDay(calSelectedDate);
    }
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--pulse-rose);">Takvim yüklenemedi: ${err.message}</div>`;
  }
}

function renderCalendarGrid(days) {
  const grid = document.getElementById('calendar-days-grid');
  if (!grid) return;

  grid.innerHTML = days.map(day => {
    const isOtherMonth = !day.isCurrentMonth;
    const isToday = day.isToday;
    const dateStr = day.date.split('T')[0];
    const isSelected = calSelectedDate === dateStr;

    let cellClass = 'cal-day-cell';
    if (isOtherMonth) cellClass += ' other-month';
    if (isToday) cellClass += ' today';
    if (isSelected) cellClass += ' selected';
    if (day.statusLevel === 'Full') cellClass += ' day-full';
    else if (day.statusLevel === 'Filling') cellClass += ' day-filling';
    else if (day.statusLevel === 'Comfortable') cellClass += ' day-comfortable';

    // Status Pill
    let countBadge = '';
    if (day.totalAthletes > 0) {
      const badgeClass = day.statusLevel === 'Full' ? 'badge-red' : (day.statusLevel === 'Filling' ? 'badge-amber' : 'badge-green');
      countBadge = `<span class="lesson-badge ${badgeClass}" style="font-size:10px; padding:2px 6px;">${day.totalAthletes} Sporcu</span>`;
    }

    // Mini slot chips
    const slotChips = (day.slots || []).slice(0, 3).map(slot => `
      <div class="cal-mini-chip" title="${escapeHtml(slot.trainerName)} (${slot.athleteCount} Kişi)">
        <span class="chip-time">${slot.timeSlot}</span>
        <span class="chip-name">${escapeHtml(slot.trainerName)}</span>
        <span class="chip-cnt">${slot.athleteCount}</span>
      </div>
    `).join('');

    const moreCount = (day.slots || []).length - 3;
    const moreTag = moreCount > 0 ? `<div class="cal-more-chip">+${moreCount} seans daha</div>` : '';

    return `
      <div class="${cellClass}" onclick="selectCalendarDay('${dateStr}')" data-date="${dateStr}">
        <div class="cal-day-hdr">
          <span class="cal-day-num">${day.day}</span>
          ${countBadge}
        </div>
        <div class="cal-slots-list">
          ${slotChips}
          ${moreTag}
        </div>
      </div>
    `;
  }).join('');
}

window.selectCalendarDay = async function(dateStr) {
  calSelectedDate = dateStr;
  document.querySelectorAll('.cal-day-cell').forEach(cell => {
    cell.classList.toggle('selected', cell.dataset.date === dateStr);
  });

  const detailsPanel = document.getElementById('calendar-day-details');
  const dayTitle = document.getElementById('cal-selected-day-title');
  const daySubtitle = document.getElementById('cal-selected-day-subtitle');
  const sessionsContainer = document.getElementById('cal-selected-day-slots');

  if (!detailsPanel || !sessionsContainer) return;

  detailsPanel.style.display = 'block';
  const parts = dateStr.split('-');
  const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const formattedDate = dObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

  if (dayTitle) {
    dayTitle.innerText = `📅 ${formattedDate}`;
  }
  if (daySubtitle) daySubtitle.innerText = 'Seans ve sporcu listesi yükleniyor...';
  sessionsContainer.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Yükleniyor...</div>';

  try {
    const capacityData = await Api.getCapacity(dateStr);
    const totalAthletes = capacityData.reduce((acc, slot) => acc + slot.totalMembers, 0);
    const activeSlots = capacityData.filter(s => s.totalMembers > 0);

    if (daySubtitle) {
      daySubtitle.innerText = `Toplam ${activeSlots.length} Saat Dilimi • ${totalAthletes} Sporcu Kayıtlı`;
    }

    if (activeSlots.length === 0) {
      sessionsContainer.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 32px 16px;">
          <div style="font-size: 32px; margin-bottom: 8px;">🕒</div>
          <div style="font-weight: 700; color: var(--text-primary); font-size:15px;">Bu tarihe henüz planlanmış seans bulunmuyor.</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 6px;">Yukarıdaki "+ Bu Güne Seans Ekle" butonuna basarak doğrudan randevu oluşturabilirsiniz.</p>
        </div>
      `;
      return;
    }

    sessionsContainer.innerHTML = activeSlots.map(slot => {
      const trainerSummary = slot.trainers.map(t => `${t.trainerName} (${t.memberCount})`).join(', ');
      const athletes = slot.members.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-subtle); font-size:13px;">
          <div>
            <strong style="color:var(--text-primary); font-size:14px;">${escapeHtml(m.memberName)}</strong>
            <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">(${escapeHtml(m.packageName)})</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:11.5px; color:var(--text-secondary);">${escapeHtml(m.trainerName || 'Genel')}</span>
            <span class="lesson-badge ${m.status === 'Attended' ? 'badge-green' : 'badge-amber'}" style="font-size:10.5px; padding:2px 8px;">
              ${m.status === 'Attended' ? 'Geldi ✓' : 'Planlı'}
            </span>
          </div>
        </div>
      `).join('');

      const statusBadge = slot.statusLevel === 'Full' 
        ? '<span class="lesson-badge badge-red">Kritik Dolu (6+)</span>' 
        : (slot.statusLevel === 'Filling' ? '<span class="lesson-badge badge-amber">Doluyor (4-5)</span>' : '<span class="lesson-badge badge-green">Rahat</span>');

      return `
        <div class="attendee-card">
          <div class="card-top">
            <div>
              <div style="font-size:19px; font-family:var(--font-heading); font-weight:800; color:var(--text-primary);">Saat ${slot.timeSlot}</div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Antrenörler: ${escapeHtml(trainerSummary)}</div>
            </div>
            ${statusBadge}
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">Kayıtlı Sporcular (${slot.totalMembers}/${slot.capacityLimit})</div>
            ${athletes}
          </div>
        </div>
      `;
    }).join('');

    detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    sessionsContainer.innerHTML = `<div style="color:var(--pulse-rose); padding:16px;">Seanslar alınamadı: ${err.message}</div>`;
  }
};

window.closeCalendarDayDetails = function() {
  calSelectedDate = null;
  const details = document.getElementById('calendar-day-details');
  if (details) details.style.display = 'none';
  document.querySelectorAll('.cal-day-cell.selected').forEach(c => c.classList.remove('selected'));
};

window.openScheduleModalForSelectedDate = function() {
  openScheduleSessionModal();
  if (calSelectedDate) {
    const dateInput = document.getElementById('schedule-date');
    if (dateInput) dateInput.value = calSelectedDate;
  }
};



// ==================== MODALS ====================


window.openNewMemberModal = function() {
  document.getElementById('new-member-form').reset();
  openModal('modal-new-member');
};

window.handleCreateMember = async function(e) {
  e.preventDefault();
  const fullName = document.getElementById('m-name').value;
  const phone = document.getElementById('m-phone').value;
  const notes = document.getElementById('m-notes').value;

  try {
    const created = await Api.createMember({ fullName, phone, notes });
    showToast(`⚡ ${created.fullName} kaydedildi!`);
    closeModal('modal-new-member');
    loadMembersView();
    if (confirm("Yeni üyeye hemen bir ders paketi tanımlamak ister misiniz?")) {
      openNewSubModalForMember(created.id, created.fullName);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openEditMemberModal = async function(memberId) {
  let m = (typeof allMembers !== 'undefined' ? allMembers : []).find(x => x.id === memberId);
  if (!m) {
    try {
      m = await Api.getMember(memberId);
    } catch (err) {
      showToast(`Sporcu bulunamadı: ${err.message}`, 'error');
      return;
    }
  }

  document.getElementById('edit-m-id').value = m.id;
  document.getElementById('edit-m-name').value = m.fullName || '';
  document.getElementById('edit-m-phone').value = m.phone || '';
  document.getElementById('edit-m-email').value = m.email || '';
  document.getElementById('edit-m-notes').value = m.notes || '';
  document.getElementById('edit-m-height').value = m.heightCm ?? '';
  document.getElementById('edit-m-weight').value = m.weightKg ?? '';
  document.getElementById('edit-m-age').value = m.age ?? '';
  document.getElementById('edit-m-gender').value = m.gender || '';
  document.getElementById('edit-m-active').checked = m.isActive !== false;

  const subtitle = document.getElementById('edit-member-subtitle');
  if (subtitle) {
    subtitle.innerText = `${m.fullName} · ID #${m.id}`;
  }

  openModal('modal-edit-member');
};

window.handleUpdateMember = async function(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('edit-m-id').value);
  const fullName = document.getElementById('edit-m-name').value.trim();
  const phone = document.getElementById('edit-m-phone').value.trim();
  const email = document.getElementById('edit-m-email').value.trim();
  const notes = document.getElementById('edit-m-notes').value.trim();
  const heightVal = document.getElementById('edit-m-height').value;
  const weightVal = document.getElementById('edit-m-weight').value;
  const ageVal = document.getElementById('edit-m-age').value;
  const gender = document.getElementById('edit-m-gender').value;
  const isActive = document.getElementById('edit-m-active').checked;

  if (!fullName) {
    showToast('Ad Soyad zorunludur.', 'error');
    return;
  }

  const payload = {
    fullName: fullName,
    phone: phone || null,
    email: email || null,
    notes: notes || null,
    isActive: isActive,
    heightCm: heightVal ? parseInt(heightVal) : null,
    weightKg: weightVal ? parseFloat(weightVal) : null,
    age: ageVal ? parseInt(ageVal) : null,
    gender: gender || null
  };

  try {
    const updated = await Api.updateMember(id, payload);
    showToast(`✓ ${updated.fullName} başarıyla güncellendi!`);
    closeModal('modal-edit-member');
    await loadMembersView();
    // Attendance listesi de açıksa güncelle
    if (document.getElementById('view-yoklama')?.style.display !== 'none') {
      await loadAttendanceView();
    }
  } catch (err) {
    showToast(`Güncelleme Hatası: ${err.message}`, 'error');
  }
};

window.openEditMemberNotesModal = function(memberId, memberName, notes) {
  const idInput = document.getElementById('edit-member-notes-id');
  const nameEl = document.getElementById('edit-member-notes-name');
  const textarea = document.getElementById('edit-member-notes-textarea');

  if (idInput) idInput.value = memberId;
  if (nameEl) nameEl.innerText = memberName;
  if (textarea) textarea.value = notes || '';

  openModal('modal-edit-member-notes');
  if (textarea) setTimeout(() => textarea.focus(), 150);
};

window.handleSaveMemberNotes = async function(e) {
  e.preventDefault();
  const memberId = parseInt(document.getElementById('edit-member-notes-id').value);
  const notes = document.getElementById('edit-member-notes-textarea').value.trim();

  try {
    await Api.updateMemberNotes(memberId, notes);
    showToast('⚡ Sporcu sağlık kısıtı / sakatlık notu güncellendi!');
    closeModal('modal-edit-member-notes');
    if (currentTab === 'yoklama') {
      await loadAttendanceView();
    } else if (currentTab === 'uyeler') {
      await loadMembersView();
    }
  } catch (err) {
    showToast(`Not kaydedilemedi: ${err.message}`, 'error');
  }
};


window.openNewSubModalForMember = async function(memberId, memberName) {
  document.getElementById('sub-member-id').value = memberId;
  document.getElementById('sub-member-title').innerText = memberName;

  const select = document.getElementById('sub-package-select');
  try {
    packages = await Api.getPackages();
    select.innerHTML = packages.map(p => `
      <option value="${p.id}" data-price="${p.defaultPrice}" data-lessons="${p.lessonCount}">
        ${escapeHtml(p.name)} (${p.lessonCount} Ders - ${formatMoney(p.defaultPrice)})
      </option>
    `).join('');

    const trainerSelect = document.getElementById('sub-trainer-select');
    if (trainerSelect) {
      if (!allTrainers || allTrainers.length === 0) {
        allTrainers = await Api.getTrainers();
      }
      trainerSelect.innerHTML = `<option value="">Varsayılan Eğitmen</option>` + allTrainers.map(t =>
        `<option value="${t.id}">${escapeHtml(t.fullName)} (${escapeHtml(t.role)})</option>`
      ).join('');
    }

    updatePackagePriceField();
    openModal('modal-new-sub');
  } catch (err) {
    showToast("Paket listesi alınamadı.", 'error');
  }
};

window.updatePackagePriceField = function() {
  const select = document.getElementById('sub-package-select');
  const opt = select.options[select.selectedIndex];
  if (opt) {
    const price = opt.getAttribute('data-price');
    document.getElementById('sub-price').value = price;
    document.getElementById('sub-payment').value = price;
  }
};

window.handleCreateSubscription = async function(e) {
  e.preventDefault();
  const memberId = parseInt(document.getElementById('sub-member-id').value);
  const packageId = parseInt(document.getElementById('sub-package-select').value);
  const trainerVal = document.getElementById('sub-trainer-select')?.value;
  const primaryTrainerId = trainerVal ? parseInt(trainerVal) : null;
  const price = parseFloat(document.getElementById('sub-price').value);
  const salonShareRate = parseFloat(document.getElementById('sub-salon-rate').value);
  const initialPayment = parseFloat(document.getElementById('sub-payment').value || 0);
  const paymentMethod = document.getElementById('sub-pay-method').value;

  try {
    await Api.createSubscription({
      memberId,
      packageId,
      primaryTrainerId,
      price,
      startDate: new Date().toISOString(),
      salonShareRate,
      initialPaymentAmount: initialPayment,
      paymentMethod,
      notes: "Sistem kaydı"
    });

    showToast("⚡ Yeni paket başarıyla tanımlandı!");
    closeModal('modal-new-sub');
    switchTab('yoklama');
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

window.openPaymentModal = function(subId, memberName, remainingBalance) {
  document.getElementById('pay-sub-id').value = subId;
  document.getElementById('pay-member-name').innerText = memberName;
  document.getElementById('pay-amount').value = remainingBalance;
  openModal('modal-payment');
};

window.handleAddPayment = async function(e) {
  e.preventDefault();
  const subId = parseInt(document.getElementById('pay-sub-id').value);
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const method = document.getElementById('pay-method').value;

  try {
    await Api.addPayment({
      subscriptionId: subId,
      amount,
      paymentMethod: method,
      notes: "Kasa tahsilatı"
    });

    showToast(`⚡ ${formatMoney(amount)} tahsilat kaydedildi!`);
    closeModal('modal-payment');
    if (currentTab === 'dashboard') loadDashboardView();
    else if (currentTab === 'uyeler') loadMembersView();
    else loadAttendanceView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

// ==================== WHATSAPP ŞABLONLARI (PRD Madde 4) ====================
window.openWhatsAppModal = function(subId) {
  waTargetSub = activeSubscriptions.find(s => s.id === subId);
  if (!waTargetSub) return;

  document.getElementById('wa-modal-member-name').innerText = `${waTargetSub.memberName} (${waTargetSub.packageName})`;

  const name = waTargetSub.memberName;
  const pkg = waTargetSub.packageName;
  const remaining = waTargetSub.remainingLessons;
  const balance = formatMoney(waTargetSub.remainingBalance);

  const t1 = `Merhaba ${name}, bugünkü seansımız planlanan saatte yapılacaktır. Salon kuralımız gereği telafi/iptal durumunda en az 3 saat öncesinden haber vermenizi rica ederiz. Görüşmek üzere! 💪⚡`;
  const t2 = `Merhaba ${name}, Compound Athletic'teki ${pkg} paketinizde son ${remaining} dersiniz kaldı. Yeni dönem antrenmanlarınızı aksatmadan devam ettirmek için şimdiden yerinizi ayırtabilirsiniz! ⚡`;
  const t3 = `Merhaba ${name}, devam eden ${pkg} paketinizden kalan ${balance} tutarındaki bakiyeyi havale veya salonda nakit/kart ile iletebilirsiniz. İyi antrenmanlar! 🤝`;

  document.getElementById('wa-template-text-1').innerText = t1;
  document.getElementById('wa-template-text-2').innerText = t2;
  document.getElementById('wa-template-text-3').innerText = t3;

  openModal('modal-whatsapp-templates');
};

window.sendWhatsAppTemplate = function(templateNum) {
  if (!waTargetSub) return;
  const cleanPhone = (waTargetSub.memberPhone || '').replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('90') ? cleanPhone : (cleanPhone.startsWith('0') ? '9' + cleanPhone : '90' + cleanPhone);

  const el = document.getElementById(`wa-template-text-${templateNum}`);
  const msg = el ? el.innerText : '';
  const url = cleanPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  closeModal('modal-whatsapp-templates');
};

// ==================== SEANS PLANLAMA (KAPASİTE YÖNETİMİ) ====================
window.openScheduleSessionModal = function() {
  const subSelect = document.getElementById('schedule-sub-select');
  if (activeSubscriptions.length === 0) {
    showToast('Planlama yapmak için en az bir aktif üye paketi olmalıdır.', 'warning');
    return;
  }

  subSelect.innerHTML = activeSubscriptions.map(s =>
    `<option value="${s.id}">${escapeHtml(s.memberName)} — ${escapeHtml(s.packageName)} (${s.remainingLessons} Ders Kaldı)</option>`
  ).join('');

  const trainerSelect = document.getElementById('schedule-trainer-select');
  trainerSelect.innerHTML = allTrainers.map(t =>
    `<option value="${t.id}">${escapeHtml(t.fullName)} (${escapeHtml(t.role)})</option>`
  ).join('');

  const dateInput = document.getElementById('schedule-date');
  if (dateInput) dateInput.value = currentCapacityDate;

  openModal('modal-schedule-session');
};

window.handleScheduleSession = async function(e) {
  e.preventDefault();
  const subId = parseInt(document.getElementById('schedule-sub-select').value);
  const trainerId = parseInt(document.getElementById('schedule-trainer-select').value);
  const dateStr = document.getElementById('schedule-date').value;
  const hour = parseInt(document.getElementById('schedule-hour').value);
  const notes = document.getElementById('schedule-notes').value;

  // Local wall-clock ISO string (without trailing Z) so server preserves local hour 19:00
  const sessionTimeStr = `${dateStr}T${hour.toString().padStart(2, '0')}:00:00`;

  try {
    await Api.scheduleSession({
      subscriptionId: subId,
      trainerId: trainerId,
      sessionTime: sessionTimeStr,
      notes: notes
    });

    showToast(`⚡ Seans saat ${hour}:00 için stüdyoya başarıyla planlandı!`);
    closeModal('modal-schedule-session');
    await loadCapacitySlots();
    await loadAttendanceView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

// ==================== VAR OLAN SEANSI DÜZENLEME ====================
window.openEditSessionModal = async function(slotId) {
  try {
    const slot = await Api.getSessionById(slotId);
    if (!slot) {
      showToast('Seans bulunamadı.', 'error');
      return;
    }

    if (!allTrainers || allTrainers.length === 0) {
      allTrainers = await Api.getTrainers().catch(() => []);
    }
    const trainerSelect = document.getElementById('edit-session-trainer');
    if (trainerSelect) {
      trainerSelect.innerHTML = allTrainers.map(t =>
        `<option value="${t.id}" ${t.id === slot.trainerId ? 'selected' : ''}>${escapeHtml(t.fullName)} (${escapeHtml(t.role)})</option>`
      ).join('');
    }

    document.getElementById('edit-session-id').value = slot.id;
    document.getElementById('edit-session-title').value = slot.title || '';
    document.getElementById('edit-session-capacity').value = slot.capacity || 6;
    document.getElementById('edit-session-type').value = slot.sessionType || 'GRUP';
    document.getElementById('edit-session-status').value = slot.status || 'Scheduled';
    document.getElementById('edit-session-notes').value = slot.notes || '';

    // Dates and Times (Local Time)
    const startDate = new Date(slot.startTime);
    const endDate = new Date(slot.endTime);

    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const startH = String(startDate.getHours()).padStart(2, '0');
    const startM = String(startDate.getMinutes()).padStart(2, '0');
    const endH = String(endDate.getHours()).padStart(2, '0');
    const endM = String(endDate.getMinutes()).padStart(2, '0');

    document.getElementById('edit-session-date').value = dateStr;
    document.getElementById('edit-session-start-time').value = `${startH}:${startM}`;
    document.getElementById('edit-session-end-time').value = `${endH}:${endM}`;

    const subtitle = document.getElementById('edit-session-subtitle');
    if (subtitle) {
      subtitle.innerText = `${slot.trainerName} — ${slot.title || 'Seans'} (#${slot.id})`;
    }

    openModal('modal-edit-session');
  } catch (err) {
    showToast(`Seans yüklenemedi: ${err.message}`, 'error');
  }
};

window.handleSaveEditSession = async function(e) {
  e.preventDefault();
  const slotId = parseInt(document.getElementById('edit-session-id').value);
  const title = document.getElementById('edit-session-title').value.trim();
  const trainerId = parseInt(document.getElementById('edit-session-trainer').value);
  const dateStr = document.getElementById('edit-session-date').value;
  const startTimeStr = document.getElementById('edit-session-start-time').value;
  const endTimeStr = document.getElementById('edit-session-end-time').value;
  const capacity = parseInt(document.getElementById('edit-session-capacity').value);
  const sessionType = document.getElementById('edit-session-type').value;
  const status = document.getElementById('edit-session-status').value;
  const notes = document.getElementById('edit-session-notes').value.trim();

  const startIso = `${dateStr}T${startTimeStr}:00`;
  const endIso = `${dateStr}T${endTimeStr}:00`;

  if (endIso <= startIso) {
    showToast('Bitiş saati başlangıç saatinden sonra olmalıdır.', 'error');
    return;
  }

  try {
    await Api.updateSession(slotId, {
      startTime: startIso,
      endTime: endIso,
      trainerId: trainerId,
      capacity: capacity,
      sessionType: sessionType,
      title: title,
      notes: notes,
      status: status
    });

    showToast('✓ Seans saati ve bilgileri başarıyla güncellendi!', 'success');
    closeModal('modal-edit-session');

    await loadAthleteHome();
    if (currentAthleteTab === 'sessions') await loadAthleteSessionsView();
    if (typeof loadCapacitySlots === 'function') await loadCapacitySlots();
    if (typeof loadAttendanceView === 'function') await loadAttendanceView();
  } catch (err) {
    showToast(`Güncelleme Hatası: ${err.message}`, 'error');
  }
};

window.handleDeleteSessionClick = async function() {
  const slotId = parseInt(document.getElementById('edit-session-id').value);
  if (!slotId) return;

  if (!confirm('Bu seansı tamamen iptal etmek/silmek istediğinize emin misiniz?\nKayıtlı tüm sporcuların rezervasyonları iptal edilecektir.')) {
    return;
  }

  try {
    await Api.deleteSession(slotId);
    showToast('✓ Seans başarıyla iptal edildi / kaldırıldı.', 'success');
    closeModal('modal-edit-session');

    await loadAthleteHome();
    if (currentAthleteTab === 'sessions') await loadAthleteSessionsView();
    if (typeof loadCapacitySlots === 'function') await loadCapacitySlots();
    if (typeof loadAttendanceView === 'function') await loadAttendanceView();
  } catch (err) {
    showToast(`İptal Hatası: ${err.message}`, 'error');
  }
};

function formatMoney(num) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(num || 0);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJsString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}
window.escapeJsString = escapeJsString;

function getAthleteInitials(name) {
  if (!name) return 'SP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
window.getAthleteInitials = getAthleteInitials;


/* ==========================================================================
   v0 ATHLETE PWA CONTROLLER & B2B2C RESERVATION ENGINE
   ========================================================================== */

let otpCountdownTimer = null;
let currentOtpPhone = '';

// Segmented Progress Bar
function renderSegmentedBar(used, total) {
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

// Load Athlete Home Data
async function loadAthleteHome() {
  const user = Api.getUser();
  const token = Api.getToken();
  const nameEl = document.getElementById('athlete-greeting-name');
  const greetingSubEl = document.getElementById('athlete-greeting-sub');
  const roleEl = document.getElementById('athlete-status-label');
  const badgeDot = document.getElementById('athlete-badge-dot');
  const loginHeaderBtn = document.getElementById('v0-login-header-btn');

  const guestWelcome = document.getElementById('athlete-guest-welcome');
  const memberSidebar = document.getElementById('athlete-member-sidebar');

  const remainingEl = document.getElementById('pkg-metric-remaining');
  const daysEl = document.getElementById('pkg-metric-days');
  const balanceEl = document.getElementById('pkg-metric-balance');
  const pkgTitleEl = document.getElementById('pkg-card-title');
  const pkgStatusEl = document.getElementById('pkg-card-status');
  const pkgBar = document.getElementById('pkg-segmented-bar');

  if (user && token) {
    if (guestWelcome) guestWelcome.style.display = 'none';
    if (memberSidebar) memberSidebar.style.display = 'block';

    if (greetingSubEl) greetingSubEl.innerText = 'Merhaba,';
    if (nameEl) nameEl.innerText = user.fullName || user.phoneNumber || 'Sporcu';
    if (roleEl) roleEl.innerText = user.role === 'Admin' ? 'Salon Yöneticisi' : user.role === 'Coach' ? 'Antrenör' : 'Aktif Sporcu';
    if (badgeDot) badgeDot.style.background = '#CCFF00';
    if (loginHeaderBtn) loginHeaderBtn.style.display = 'none';

    // Üyenin gerçek aktif paketini yükle
    try {
      let memberId = user.memberId;
      if (!memberId && user.phoneNumber) {
        const members = await Api.getMembers().catch(() => []);
        const m = members.find(x => x.phone === user.phoneNumber || x.phone === user.phoneNumber.replace('+90', '0') || x.phone === user.phoneNumber.replace('+90', ''));
        if (m) {
          memberId = m.id;
          user.memberId = m.id;
          Api.setUser(user);
        }
      }

      if (memberId) {
        const member = await Api.getMember(memberId);
        if (member && member.subscriptions && member.subscriptions.length > 0) {
          const activeSub = member.subscriptions.find(s => s.status === 'Active') || member.subscriptions[0];
          if (activeSub) {
            const pkgCard = document.getElementById('athlete-package-card');
            if (pkgCard) pkgCard.classList.remove('empty-state');
            if (pkgTitleEl) pkgTitleEl.innerText = activeSub.packageName || 'Aktif Paket';
            if (pkgStatusEl) {
              pkgStatusEl.innerText = activeSub.status === 'Active' ? 'Aktif' : 'Pasif';
              pkgStatusEl.className = activeSub.status === 'Active' ? 'v0-status-pill-active' : 'v0-status-pill-waitlist';
            }
            const total = activeSub.totalLessons || 8;
            const remaining = activeSub.remainingLessons ?? 0;
            const used = Math.max(0, total - remaining);
            renderSegmentedBar(used, total);
            if (remainingEl) remainingEl.innerText = `${remaining} Ders`;
            const daysLeft = activeSub.endDate ? Math.max(0, Math.ceil((new Date(activeSub.endDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;
            if (daysEl) daysEl.innerText = `${daysLeft} Gün`;
            const balance = activeSub.remainingBalance ?? 0;
            if (balanceEl) balanceEl.innerText = balance <= 0 ? '₺0 · Ödendi' : formatMoney(balance);
          }
        } else {
          const pkgCard = document.getElementById('athlete-package-card');
          if (pkgCard) pkgCard.classList.add('empty-state');
          if (pkgTitleEl) pkgTitleEl.innerText = 'Aktif Paket Yok';
          if (pkgStatusEl) { pkgStatusEl.innerText = 'Paketsiz'; pkgStatusEl.className = 'v0-status-pill-waitlist'; }
          if (pkgBar) pkgBar.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:4px 0;">Tanımlı aktif paketiniz bulunmuyor.</div>';
          if (remainingEl) remainingEl.innerText = '0 Ders';
          if (daysEl) daysEl.innerText = '--';
          if (balanceEl) balanceEl.innerText = '₺0';
        }
      }

      // Son antrenman teaser kartını güncelle
      const recentHistory = await Api.getMyWorkoutHistory(1).catch(() => []);
      if (recentHistory && recentHistory.length > 0) {
        const lastW = recentHistory[0];
        const lastDate = new Date(lastW.startedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        const tagEl = document.getElementById('teaser-workout-tag');
        const dateEl = document.getElementById('teaser-workout-date');
        const nameElTeaser = document.getElementById('teaser-workout-name');
        const metaEl = document.getElementById('teaser-workout-meta');
        if (tagEl) tagEl.innerText = 'Son Antrenmanım';
        if (dateEl) dateEl.innerText = `· ${lastDate}`;
        if (nameElTeaser) nameElTeaser.innerText = lastW.templateName || 'Antrenman';
        if (metaEl) metaEl.innerText = `${lastW.durationMinutes || 45} dk • ${lastW.exerciseLogs ? lastW.exerciseLogs.length : 0} egzersiz`;
      }
    } catch (err) {
      console.warn('Aktif paket yüklenirken hata:', err);
    }
  } else {
    // Giriş yapılmadıysa Misafir Sporcu görünümü
    if (guestWelcome) guestWelcome.style.display = 'block';
    if (memberSidebar) memberSidebar.style.display = 'none';

    const guestHomeWrap = document.getElementById('athlete-guest-home-wrap');
    const memberSessionsWrap = document.getElementById('athlete-member-sessions-wrap');
    if (guestHomeWrap) guestHomeWrap.style.display = 'block';
    if (memberSessionsWrap) memberSessionsWrap.style.display = 'none';

    if (greetingSubEl) greetingSubEl.innerText = 'Hoş Geldiniz,';
    if (nameEl) nameEl.innerText = 'Misafir Ziyaretçi';
    if (roleEl) roleEl.innerText = 'Giriş Yapılmadı';
    if (badgeDot) badgeDot.style.background = 'rgba(255, 255, 255, 0.3)';
    if (loginHeaderBtn) loginHeaderBtn.style.display = 'inline-flex';
  }

  // Load Today's Sessions (Yalnızca oturum açmış üyeler için seanslar yüklenir)
  if (user && token) {
    const guestHomeWrap = document.getElementById('athlete-guest-home-wrap');
    const memberSessionsWrap = document.getElementById('athlete-member-sessions-wrap');
    if (guestHomeWrap) guestHomeWrap.style.display = 'none';
    if (memberSessionsWrap) memberSessionsWrap.style.display = 'block';
    await renderSessionsList('v0-sessions-container', new Date().toISOString().split('T')[0]);
  }
}

// Load Sessions for a specific date
async function renderSessionsList(containerId, dateStr) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = Api.getUser();
  const token = Api.getToken();

  // GUEST PRIVACY GATE: Misafirler seans saatlerini, hocaları veya dolulukları göremez
  if (!user || !token) {
    const chipsContainer = document.getElementById('v0-day-filter-chips');
    if (chipsContainer) chipsContainer.style.display = 'none';

    const calWrapper = document.getElementById('v0-calendar-wrapper');
    if (calWrapper) calWrapper.style.display = 'none';

    const dateLabel = document.getElementById('v0-sessions-date-label');
    if (dateLabel) dateLabel.innerText = 'Gizli Takvim';

    container.innerHTML = `
      <div class="v0-card" style="text-align:center; padding:32px 20px; border:1px solid rgba(204,255,0,0.25); background:linear-gradient(135deg, rgba(204,255,0,0.06), var(--bg-surface-elevated)); border-radius:20px; box-shadow:var(--shadow-card);">
        <div style="width:64px; height:64px; margin:0 auto 16px auto; border-radius:50%; background:rgba(204,255,0,0.12); display:grid; place-items:center; font-size:30px; border:1px solid rgba(204,255,0,0.3);">
          🔒
        </div>
        <h3 style="font-size:18px; font-weight:800; color:var(--text-primary); margin:0 0 8px 0;">Stüdyo Seans & Doluluk Takvimi</h3>
        <p style="font-size:13px; color:var(--text-secondary); margin:0 0 24px 0; line-height:1.6; max-width:320px; margin-left:auto; margin-right:auto;">
          Eğitmen müsaitlikleri, anlık kontenjan dolulukları ve seans rezervasyonu üyelerimizin gizliliği gereği yalnızca <strong>kayıtlı atletlerimize</strong> açıktır.
        </p>

        <div style="display:flex; flex-direction:column; gap:12px; max-width:280px; margin:0 auto;">
          <button type="button" class="v0-btn-submit" onclick="openOtpDrawer()" style="padding:13px; font-size:13px; margin:0; width:100%;">
            <img src="/images/tiger1_badge.png?v=2.7.5" alt="" class="tiger-icon-inline tiger-icon-sm" style="margin-right:4px;"> Mevcut Üye Girişi Yap
          </button>
          <button type="button" onclick="openLeadModal('Seans Takvimi')" class="btn-primary" style="background:var(--bg-surface-elevated); color:var(--volt-lime); border:1px solid var(--volt-lime); padding:11px 16px; font-size:12.5px; font-weight:800; border-radius:12px; cursor:pointer;">
            📞 Üye Olmak İstiyorum / Bana Ulaşın
          </button>
          <a href="https://wa.me/905321112233?text=Merhaba,%20Compound%20Athletic%20seanslar%C4%B1%20ve%20%C3%BCyelik%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum." target="_blank" style="font-size:12px; color:#25D366; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; margin-top:2px;">
            <span>💬</span> WhatsApp ile Bilgi Alın →
          </a>
        </div>
      </div>
    `;
    return;
  }

  const chipsContainer = document.getElementById('v0-day-filter-chips');
  if (chipsContainer) chipsContainer.style.display = 'none'; // legacy

  const calWrapper = document.getElementById('v0-calendar-wrapper');
  if (calWrapper) calWrapper.style.display = 'block';

  const dObj = new Date(dateStr + 'T00:00:00');
  const nowObj = new Date();
  const todayIso = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}-${String(nowObj.getDate()).padStart(2, '0')}`;
  const isToday = dateStr === todayIso;
  const fullDateLabel = isToday 
    ? `Bugün, ${dObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` 
    : dObj.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  const dateLabel = document.getElementById('v0-sessions-date-label');
  if (dateLabel) dateLabel.innerText = fullDateLabel;

  const dateBadge = document.getElementById('v0-sessions-selected-date-badge');
  if (dateBadge) dateBadge.innerText = fullDateLabel;

  const selectedDateText = document.getElementById('v0-cal-selected-date-text');
  if (selectedDateText) selectedDateText.innerText = fullDateLabel;

  try {
    let slots = [];
    try {
      slots = await Api.getSessions(dateStr, dateStr);
    } catch (e) {
      console.warn('API seansları çekilemedi:', e);
    }

    // Dynamic, day-specific realistic slots if API has no slots for this date
    if (!slots || slots.length === 0) {
      slots = getRealisticSlotsForDate(dateStr);
    }

    const selectedCount = document.getElementById('v0-cal-selected-count');
    if (selectedCount) {
      const availableCount = (slots || []).length;
      selectedCount.innerText = availableCount > 0 ? `· ${availableCount} Seans Mevcut` : '· Seans Bulunmuyor';
    }

    // Check my reservations if logged in
    let myReservationSlotIds = new Set();
    const user = Api.getUser();
    if (user && Api.getToken()) {
      try {
        const myRes = await Api.getMyReservations();
        if (myRes) {
          myRes.forEach(r => {
            if (r.status === 'Confirmed' || r.status === 'Waitlisted') {
              myReservationSlotIds.add(r.slotId);
            }
          });
        }
      } catch (err) {
        console.warn('Rezervasyonlarım kontrol edilemedi:', err);
      }
    }

    container.innerHTML = slots.map(slot => {
      const start = new Date(slot.startTime);
      const end = new Date(slot.endTime);
      const timeStr = `${start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

      const filled = slot.confirmedCount ?? 0;
      const capacity = slot.capacity ?? 6;
      const remaining = capacity - filled;
      const isFull = remaining <= 0;

      let statusKey = 'open';
      let statusLabel = 'Müsait';
      if (isFull) {
        statusKey = 'full';
        statusLabel = 'Kontenjan Dolu';
      } else if (filled >= 4) {
        statusKey = 'filling';
        statusLabel = 'Doluyor';
      }

      // 3-hour cancellation rule
      const cancelDeadline = new Date(start.getTime() - 3 * 60 * 60 * 1000);
      const cancelTimeStr = cancelDeadline.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const now = new Date();
      const isPastDeadline = now > cancelDeadline;

      const isReservedByMe = myReservationSlotIds.has(slot.id);

      const isLoggedIn = !!(Api.getUser() && Api.getToken());
      const userRoles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
      const isCoach = userRoles.includes('Coach') || userRoles.includes('Admin');
      const editButtonHtml = isCoach ? `
        <button type="button" class="v0-btn-edit-slot" onclick="openEditSessionModal(${slot.id})" title="Seans saatini ve detaylarını düzenle">
          <span>✏️</span> Düzenle
        </button>
      ` : '';

      let actionButtonHtml = '';
      if (!isLoggedIn) {
        actionButtonHtml = `
          <button type="button" class="v0-book-btn available" onclick="openOtpDrawer()" style="background:var(--volt-lime-muted); border:1px solid var(--border-subtle); color:var(--volt-lime);">
            <span>📱</span> Giriş Yap & Rezerve Et
          </button>
        `;
      } else if (isReservedByMe) {
        actionButtonHtml = `
          <button type="button" class="v0-book-btn reserved" onclick="handleBookSession(${slot.id})">
            ✓ Rezerve Edildi
          </button>
        `;
      } else if (isFull) {
        actionButtonHtml = `
          <button type="button" class="v0-book-btn waitlist" onclick="handleBookSession(${slot.id})">
            <span>➕</span> Yedek Listeye Katıl (Sıra #${(slot.waitlistCount || 0) + 1})
          </button>
        `;
      } else {
        actionButtonHtml = `
          <button type="button" class="v0-book-btn available" onclick="handleBookSession(${slot.id})">
            Seansı Rezerve Et
          </button>
        `;
      }

      // Katılımcılar & "Derse Kimler Geliyor?" Rozeti (Social Proof)
      const confirmedAthletes = (slot.reservations || []).filter(r => r.status === 'Confirmed');
      const waitlistedAthletes = (slot.reservations || []).filter(r => r.status === 'Waitlisted');

      let avatarBubblesHtml = '';
      if (confirmedAthletes.length === 0) {
        avatarBubblesHtml = `<span class="v0-attendee-avatar-bubble empty" title="İlk katılan sen ol!"><img src="/images/tiger1_badge.png?v=2.7.5" alt="" style="width:14px; height:14px; object-fit:contain;"></span>`;
      } else {
        const maxBubbles = 4;
        const visibleAthletes = confirmedAthletes.slice(0, maxBubbles);
        avatarBubblesHtml = visibleAthletes.map((a, idx) => {
          const initials = getAthleteInitials(a.memberName);
          const hue = (idx * 65 + 195) % 360;
          return `<span class="v0-attendee-avatar-bubble" title="${escapeHtml(a.memberName)}" style="--avatar-hue:${hue};">${initials}</span>`;
        }).join('');
      }

      let attendeesTextHtml = '';
      if (confirmedAthletes.length === 0) {
        attendeesTextHtml = `<span class="v0-attendees-label empty">Henüz katılımcı yok — <em>ilk sen katıl! 🐯</em></span>`;
      } else if (confirmedAthletes.length === 1) {
        attendeesTextHtml = `<span class="v0-attendees-label"><strong>${escapeHtml(confirmedAthletes[0].memberName)}</strong> katılıyor</span>`;
      } else if (confirmedAthletes.length === 2) {
        attendeesTextHtml = `<span class="v0-attendees-label"><strong>${escapeHtml(confirmedAthletes[0].memberName)}</strong> ve <strong>${escapeHtml(confirmedAthletes[1].memberName)}</strong> katılıyor</span>`;
      } else {
        const others = confirmedAthletes.length - 2;
        attendeesTextHtml = `<span class="v0-attendees-label"><strong>${escapeHtml(confirmedAthletes[0].memberName)}</strong>, <strong>${escapeHtml(confirmedAthletes[1].memberName)}</strong> ve +${others} kişi katılıyor</span>`;
      }

      if (waitlistedAthletes.length > 0) {
        attendeesTextHtml += `<span class="v0-waitlist-inline-tag">· ${waitlistedAthletes.length} yedek</span>`;
      }

      return `
        <article class="v0-session-card">
          <div class="v0-session-top">
            <div style="min-width:0; flex:1;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                <span class="v0-time-pill">${timeStr}</span>
                ${editButtonHtml}
              </div>
              <h3 class="v0-session-card-title">${escapeHtml(slot.title || 'Grup Seansı')}</h3>
              <span class="v0-trainer-pill">
                <span>🏋️</span>
                ${escapeHtml(slot.trainerName || 'Eğitmen')}
              </span>
            </div>

            <div class="v0-session-capacity-col">
              <span class="v0-capacity-status ${statusKey}">
                <span class="v0-status-dot"></span>
                ${statusLabel}
              </span>
              <span class="v0-capacity-count">
                <span>👥</span>
                ${filled} / ${capacity} ${isFull ? 'Dolu' : 'Sporcu'}
              </span>
            </div>
          </div>

          <div class="v0-attendees-row">
            <div class="v0-attendees-avatars">
              ${avatarBubblesHtml}
            </div>
            <div class="v0-attendees-text">
              ${attendeesTextHtml}
            </div>
          </div>

          <div class="v0-cancel-notice ${isPastDeadline ? 'passed' : ''}">
            <span class="v0-cancel-icon"><img src="/images/tiger1_badge.png?v=2.7.5" alt="" style="width:16px; height:16px; object-fit:contain;"></span>
            <div>
              <strong style="color:var(--text-primary);">Son İptal: ${cancelTimeStr}</strong>
              — ${isPastDeadline ? 'Son iptal vakti geçti (İptal edilirse ders hakkınız düşer).' : 'Ders hakkınız yanmadan iptal edilebilir.'}
            </div>
          </div>

          ${actionButtonHtml}
        </article>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = `<div style="color:#EF4444; font-size:13px; padding:16px;">Seanslar yüklenemedi: ${err.message}</div>`;
  }
}

// Dynamic realistic fallback for days beyond API data
function getRealisticSlotsForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0: Pazar, 1: Pzt, 2: Sal, 3: Çar, 4: Per, 5: Cum, 6: Cmt

  switch (dayOfWeek) {
    case 1: // Pazartesi
      return [
        { id: 201, startTime: `${dateStr}T10:00:00`, endTime: `${dateStr}T11:00:00`, title: 'Haftalık Başlangıç Güç', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 221, startTime: `${dateStr}T12:30:00`, endTime: `${dateStr}T13:30:00`, title: 'Öğle Fonksiyonel & Core', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 222, startTime: `${dateStr}T14:30:00`, endTime: `${dateStr}T15:30:00`, title: 'Kuvvet & Mobilite', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 202, startTime: `${dateStr}T18:00:00`, endTime: `${dateStr}T19:00:00`, title: 'Hipertrofi & Kuvvet', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 203, startTime: `${dateStr}T19:00:00`, endTime: `${dateStr}T20:00:00`, title: 'Fonksiyonel Güç & Kondisyon', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 5, capacityStatus: 'Filling', waitlistCount: 0 }
      ];
    case 2: // Salı
      return [
        { id: 204, startTime: `${dateStr}T11:00:00`, endTime: `${dateStr}T12:00:00`, title: 'Postür & Omurga Esnekliği', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 1, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 223, startTime: `${dateStr}T13:00:00`, endTime: `${dateStr}T14:00:00`, title: 'Öğle Hızlı Kondisyon', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 224, startTime: `${dateStr}T15:00:00`, endTime: `${dateStr}T16:00:00`, title: 'Atletik Güç', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 205, startTime: `${dateStr}T18:30:00`, endTime: `${dateStr}T19:30:00`, title: 'Metabolic Conditioning & HIIT', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 206, startTime: `${dateStr}T19:30:00`, endTime: `${dateStr}T20:30:00`, title: 'Athletic Performance & Hız', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 5, capacityStatus: 'Filling', waitlistCount: 0 }
      ];
    case 3: // Çarşamba
      return [
        { id: 207, startTime: `${dateStr}T10:00:00`, endTime: `${dateStr}T11:00:00`, title: 'Sabah Güç & Kondisyon', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 225, startTime: `${dateStr}T12:00:00`, endTime: `${dateStr}T13:00:00`, title: 'Core & Omurga Sağlığı', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 226, startTime: `${dateStr}T14:00:00`, endTime: `${dateStr}T15:00:00`, title: 'Kuvvet Gelişimi', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 208, startTime: `${dateStr}T17:30:00`, endTime: `${dateStr}T18:30:00`, title: 'Functional Hypertrophy', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 209, startTime: `${dateStr}T19:00:00`, endTime: `${dateStr}T20:00:00`, title: 'Fonksiyonel Güç & Kondisyon', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 210, startTime: `${dateStr}T20:00:00`, endTime: `${dateStr}T21:00:00`, title: 'Core & Mobilite', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 6, capacityStatus: 'Critical', waitlistCount: 1 }
      ];
    case 4: // Perşembe
      return [
        { id: 211, startTime: `${dateStr}T11:00:00`, endTime: `${dateStr}T12:00:00`, title: 'Postür & Omurga Esnekliği', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 1, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 227, startTime: `${dateStr}T13:30:00`, endTime: `${dateStr}T14:30:00`, title: 'Öğle Mobilite & Güç', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 228, startTime: `${dateStr}T15:30:00`, endTime: `${dateStr}T16:30:00`, title: 'Fonksiyonel Kondisyon', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 212, startTime: `${dateStr}T18:30:00`, endTime: `${dateStr}T19:30:00`, title: 'Metabolic Conditioning & HIIT', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 213, startTime: `${dateStr}T19:30:00`, endTime: `${dateStr}T20:30:00`, title: 'Athletic Performance & Hız', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 5, capacityStatus: 'Filling', waitlistCount: 0 }
      ];
    case 5: // Cuma
      return [
        { id: 214, startTime: `${dateStr}T10:00:00`, endTime: `${dateStr}T11:00:00`, title: 'Sabah Kondisyon & Güç', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 229, startTime: `${dateStr}T12:30:00`, endTime: `${dateStr}T13:30:00`, title: 'Full Body HIIT & Core', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 230, startTime: `${dateStr}T14:30:00`, endTime: `${dateStr}T15:30:00`, title: 'Power & Kettlebell', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 215, startTime: `${dateStr}T17:30:00`, endTime: `${dateStr}T18:30:00`, title: 'Friday Functional Blast', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 216, startTime: `${dateStr}T19:00:00`, endTime: `${dateStr}T20:00:00`, title: 'Total Body Resistance', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 6, capacityStatus: 'Critical', waitlistCount: 2 },
        { id: 217, startTime: `${dateStr}T20:00:00`, endTime: `${dateStr}T21:00:00`, title: 'Foam Roller & Doku Mobilite', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 }
      ];
    case 6: // Cumartesi
      return [
        { id: 218, startTime: `${dateStr}T11:00:00`, endTime: `${dateStr}T12:30:00`, title: 'Compound Weekend Bootcamp', trainerName: 'Gülçin & Sinan', capacity: 8, confirmedCount: 6, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 231, startTime: `${dateStr}T13:00:00`, endTime: `${dateStr}T14:00:00`, title: 'Mobilite & Esneklik', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 219, startTime: `${dateStr}T14:00:00`, endTime: `${dateStr}T15:00:00`, title: 'Squat & Deadlift Teknik Kliniği', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 4, capacityStatus: 'Filling', waitlistCount: 0 },
        { id: 232, startTime: `${dateStr}T15:30:00`, endTime: `${dateStr}T16:30:00`, title: 'Serbest Ağırlık Seansı', trainerName: 'Sinan Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 }
      ];
    case 0: // Pazar
    default:
      return [
        { id: 220, startTime: `${dateStr}T12:00:00`, endTime: `${dateStr}T13:00:00`, title: 'Active Recovery & Yoga Mobilite', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 2, capacityStatus: 'Comfortable', waitlistCount: 0 },
        { id: 233, startTime: `${dateStr}T14:00:00`, endTime: `${dateStr}T15:00:00`, title: 'Hafif Kondisyon & Stretching', trainerName: 'Gülçin Hoca', capacity: 6, confirmedCount: 3, capacityStatus: 'Comfortable', waitlistCount: 0 }
      ];
  }
}

// ==================== CALENDAR ENGINE (BULUNDUĞU VE SONRAKİ HAFTA) ====================
let currentCalendarSelectedDate = '';
let currentCalendarWeekMode = 'all'; // 'all' | 'w1' | 'w2'

function getStartOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0: Paz, 1: Pzt, ..., 6: Cmt
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateToIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

window.setCalendarWeekView = function(mode) {
  currentCalendarWeekMode = mode;
  const btnAll = document.getElementById('v0-btn-cal-all');
  const btnW1 = document.getElementById('v0-btn-cal-w1');
  const btnW2 = document.getElementById('v0-btn-cal-w2');
  const rowW1 = document.getElementById('v0-cal-week-row-1');
  const rowW2 = document.getElementById('v0-cal-week-row-2');

  if (btnAll) btnAll.classList.toggle('active', mode === 'all');
  if (btnW1) btnW1.classList.toggle('active', mode === 'w1');
  if (btnW2) btnW2.classList.toggle('active', mode === 'w2');

  if (rowW1) {
    rowW1.style.display = (mode === 'all' || mode === 'w1') ? 'block' : 'none';
  }
  if (rowW2) {
    rowW2.style.display = (mode === 'all' || mode === 'w2') ? 'block' : 'none';
  }
};

window.selectCalendarToday = function() {
  const now = new Date();
  const todayIso = formatDateToIso(now);
  selectCalendarDate(todayIso);
};

window.selectCalendarDate = async function(dateIso) {
  currentCalendarSelectedDate = dateIso;

  // Highlight cell in calendar
  document.querySelectorAll('.v0-cal-day-cell').forEach(cell => {
    const isTarget = cell.getAttribute('data-date') === dateIso;
    cell.classList.toggle('active', isTarget);
  });

  await renderSessionsList('v0-all-sessions-container', dateIso);
};

// Load Athlete Sessions View (All Dates in 2-Week Calendar)
async function loadAthleteSessionsView() {
  const calWrapper = document.getElementById('v0-calendar-wrapper');
  const user = Api.getUser();
  const token = Api.getToken();

  const now = new Date();
  const todayIso = formatDateToIso(now);

  if (!user || !token) {
    if (calWrapper) calWrapper.style.display = 'none';
    await renderSessionsList('v0-all-sessions-container', todayIso);
    return;
  }

  if (calWrapper) calWrapper.style.display = 'block';

  if (!currentCalendarSelectedDate) {
    currentCalendarSelectedDate = todayIso;
  }

  // Week 1: Bulunduğu Hafta (Pzt - Paz)
  const mondayW1 = getStartOfWeekMonday(now);
  const week1Days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayW1);
    d.setDate(mondayW1.getDate() + i);
    week1Days.push(d);
  }

  // Week 2: Sonraki Hafta (Pzt - Paz)
  const mondayW2 = new Date(mondayW1);
  mondayW2.setDate(mondayW1.getDate() + 7);
  const week2Days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayW2);
    d.setDate(mondayW2.getDate() + i);
    week2Days.push(d);
  }

  // Month Title (e.g. "Eylül 2026" or "Eylül - Ekim 2026")
  const monthTextEl = document.getElementById('v0-cal-month-text');
  if (monthTextEl) {
    const m1Name = mondayW1.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    const lastDayW2 = week2Days[6];
    const m2Name = lastDayW2.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    if (m1Name.toLowerCase() === m2Name.toLowerCase()) {
      monthTextEl.innerText = m1Name.charAt(0).toUpperCase() + m1Name.slice(1);
    } else {
      const m1Short = mondayW1.toLocaleDateString('tr-TR', { month: 'short' });
      const m2Full = lastDayW2.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      monthTextEl.innerText = `${m1Short} – ${m2Full}`;
    }
  }

  // Render Day Cells
  const renderDaysGrid = (containerId, daysList) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = daysList.map(d => {
      const dateIso = formatDateToIso(d);
      const isToday = dateIso === todayIso;
      const isSelected = dateIso === currentCalendarSelectedDate;
      const isPast = dateIso < todayIso;
      const dayNum = d.getDate();
      const weekdayShort = d.toLocaleDateString('tr-TR', { weekday: 'short' });

      return `
        <button type="button" 
                class="v0-cal-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'active' : ''} ${isPast ? 'past' : ''}" 
                data-date="${dateIso}"
                onclick="selectCalendarDate('${dateIso}')"
                title="${d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}">
          <span class="v0-cal-day-num">${dayNum}</span>
          <span class="v0-cal-day-sub">${isToday ? 'Bugün' : weekdayShort}</span>
          <span class="v0-cal-dot"></span>
        </button>
      `;
    }).join('');
  };

  renderDaysGrid('v0-cal-days-w1', week1Days);
  renderDaysGrid('v0-cal-days-w2', week2Days);

  await renderSessionsList('v0-all-sessions-container', currentCalendarSelectedDate);
}

// Session Booking Handler
window.handleBookSession = async function(slotId) {
  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    showToast('⚡ Seans rezervasyonu için lütfen telefon numaranızla giriş yapın.');
    openOtpDrawer();
    return;
  }

  try {
    const res = await Api.bookReservation(slotId);
    if (res.status === 'Waitlisted') {
      showToast(`⚡ Kontenjan dolduğu için Yedek Listeye (#${res.waitlistPosition}) alındınız!`, 'success');
    } else {
      showToast(`🎉 Seans rezervasyonunuz başarıyla onaylandı!`, 'success');
    }
    await loadAthleteHome();
    if (currentAthleteTab === 'sessions') await loadAthleteSessionsView();
  } catch (err) {
    showToast(`Rezervasyon Hatası: ${err.message}`, 'error');
    if (err.message && err.message.includes('Oturum')) {
      Api.clearAuth();
      updateNavForUserRole();
      openOtpDrawer();
    }
  }
};

// Session Cancel Handler
window.handleCancelReservation = async function(reservationId) {
  if (!confirm('Bu rezervasyonu iptal etmek istediğinize emin misiniz?\n(Seansa 3 saatten az kaldıysa ders hakkınız düşer)')) {
    return;
  }

  try {
    const res = await Api.cancelReservation(reservationId, 'Sporcu PWA üzerinden iptal edildi');
    if (res.lessonDeducted) {
      showToast(`⚠️ Rezervasyon iptal edildi. 3 saat kuralı gereği ders hakkı düşüldü. (Kalan Ders: ${res.remainingLessons})`, 'error');
    } else {
      showToast(`✓ Rezervasyon cezasız iptal edildi. Ders hakkınız korundu. (Kalan Ders: ${res.remainingLessons})`, 'success');
    }
    await loadAthleteHome();
    if (currentAthleteTab === 'profile') renderAthleteProfile();
    if (currentAthleteTab === 'sessions') await loadAthleteSessionsView();
  } catch (err) {
    showToast(`İptal Hatası: ${err.message}`, 'error');
  }
};

// Athlete Profile View
window.renderAthleteProfile = async function() {
  const container = document.getElementById('v0-profile-content');
  if (!container) return;

  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    container.innerHTML = `
      <div class="v0-card" style="text-align:center; padding:28px 20px; margin-bottom:16px;">
        <span style="font-size:40px; display:block; margin-bottom:10px;">👤</span>
        <h3 style="font-size:18px; font-weight:800; color:var(--text-primary); margin:0 0 6px 0;">Henüz Giriş Yapmadınız</h3>
        <p style="font-size:13px; color:var(--text-secondary); margin:0 0 20px 0; line-height:1.5;">
          Aktif ders haklarınızı, geçerlilik sürenizi ve rezervasyon geçmişinizi takip etmek için telefon numaranızla giriş yapın.
        </p>
        <div style="display:flex; flex-direction:column; gap:10px; max-width:280px; margin:0 auto;">
          <button class="v0-book-btn available" style="width:100%; margin:0;" onclick="openOtpDrawer()">
            Giriş Yap / Doğrula
          </button>
          <button type="button" onclick="openLeadModal('Üyelik Bilgisi')" class="btn-primary" style="background:var(--bg-surface-elevated); color:var(--volt-lime); border:1px solid var(--volt-lime); padding:10px 14px; font-size:12.5px; font-weight:800; border-radius:12px; cursor:pointer;">
            📞 Üye Olmak İstiyorum / Bilgi Al
          </button>
        </div>
      </div>

      <!-- Studio Information & Contact Card -->
      <div class="v0-card" style="padding:20px; border-radius:16px; margin-bottom:16px;">
        <h4 style="font-size:15px; font-weight:800; margin:0 0 12px 0; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
          <span>🏢</span> Compound Athletic Stüdyosu
        </h4>
        <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px; color:var(--text-secondary);">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <span style="color:var(--volt-lime); font-size:16px;">📍</span>
            <div>
              <span style="font-weight:600; color:var(--text-primary); display:block;">İhsaniye, Erkal Sk. No:5A, 16600 Nilüfer / Bursa</span>
              <a href="https://maps.google.com/?q=%C4%B0hsaniye,+Erkal+Sk.+No:5A,+16600+Nil%C3%BCfer/Bursa" target="_blank" style="display:inline-block; font-size:11px; color:var(--volt-lime); margin-top:3px; text-decoration:underline; font-weight:700;">Haritada Aç (Google Maps) ↗</a>
            </div>
          </div>
          <div style="display:flex; gap:10px;">
            <span style="color:var(--volt-lime);">⏰</span>
            <span>Hafta İçi: 07:00 – 22:00 | Hafta Sonu: 09:00 – 18:00</span>
          </div>
          <div style="display:flex; gap:10px;">
            <span style="color:var(--volt-lime);">📞</span>
            <span>+90 532 111 22 33</span>
          </div>
        </div>
        <div style="margin-top:14px; display:flex; gap:8px;">
          <a href="https://wa.me/905321112233?text=Merhaba,%20Compound%20Athletic%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum." target="_blank" style="flex:1; padding:9px 12px; border-radius:10px; background:#25D366; color:#fff; text-align:center; font-size:12px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            <span>💬</span> WhatsApp
          </a>
          <a href="tel:+905321112233" style="flex:1; padding:9px 12px; border-radius:10px; background:var(--bg-surface-elevated); color:var(--text-primary); border:1px solid var(--border-subtle); text-align:center; font-size:12px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            <span>📞</span> Hemen Ara
          </a>
        </div>
      </div>

      <!-- PWA Card -->
      <div class="v0-card" style="padding:18px 20px; border-radius:16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div>
          <div style="font-size:13px; font-weight:800; color:var(--text-primary);">SporTakip Mobil Uygulaması</div>
          <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Ana ekranınıza ekleyerek tam ekran kullanın</div>
        </div>
        <button type="button" class="btn-primary" onclick="openModal('modal-pwa-ios-guide')" style="padding:8px 14px; font-size:11.5px; font-weight:800; border-radius:999px; flex-shrink:0;">
          Yükle 📲
        </button>
      </div>
    `;
    return;
  }

  let reservationsHtml = '<p style="font-size:12px; color:var(--text-muted);">Kayıtlı rezervasyon bulunmuyor.</p>';
  let memberDetails = null;
  try {
    const [myRes, memberData] = await Promise.all([
      Api.getMyReservations(true).catch(() => []),
      user.memberId ? Api.getMember(user.memberId).catch(() => null) : Promise.resolve(null)
    ]);
    memberDetails = memberData;
    if (myRes && myRes.length > 0) {
      reservationsHtml = myRes.map(r => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-radius:12px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); margin-top:8px;">
          <div>
            <div style="font-size:13.5px; font-weight:800; color:var(--text-primary);">
              ${new Date(r.startTime).toLocaleDateString('tr-TR')} · ${new Date(r.startTime).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}
            </div>
            <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(r.trainerName || 'Eğitmen')}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; ${r.status === 'Confirmed' ? 'background:rgba(16,185,129,0.15); color:#10B981;' : r.status === 'Waitlisted' ? 'background:rgba(245,158,11,0.15); color:#F59E0B;' : 'background:rgba(239,68,68,0.15); color:#EF4444;'}">
              ${r.status === 'Confirmed' ? 'Onaylı' : r.status === 'Waitlisted' ? `Yedek #${r.waitlistPosition}` : r.status === 'CancelledByAthlete' ? 'İptal Edildi' : r.status === 'CheckedIn' ? 'Katıldı' : r.status}
            </span>
            ${(r.status === 'Confirmed' || r.status === 'Waitlisted') ? `<button style="background:transparent; border:none; color:var(--text-muted); font-size:11px; text-decoration:underline; cursor:pointer;" onclick="handleCancelReservation(${r.id})">İptal</button>` : ''}
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.warn('Profil verileri çekilemedi', e);
  }

  const customAvatar = localStorage.getItem('sportakip_custom_avatar') || '/images/default-avatar.png?v=2.7.5';
  const hasCustomAvatar = !!localStorage.getItem('sportakip_custom_avatar');

  const curHeight = memberDetails?.heightCm || '';
  const curWeight = memberDetails?.weightKg || '';
  const curAge = memberDetails?.age || '';
  const curGender = memberDetails?.gender || '';
  const curBmi = memberDetails?.bmi || '';
  const curBmiCategory = memberDetails?.bmiCategory || '';

  container.innerHTML = `
    <!-- 1. Üye Kimlik Kartı & Avatar -->
    <div class="v0-card">
      <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
        <div style="position:relative; width:68px; height:68px; border-radius:50%; border:2px solid var(--volt-lime-accent); padding:2px; box-shadow:0 0 16px var(--volt-lime-glow);">
          <img src="${customAvatar}" alt="Profil Fotoğrafı" id="profile-avatar-img" class="v0-avatar-img" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
          <button type="button" onclick="document.getElementById('v0-avatar-file-input').click()" title="Fotoğraf Yükle" style="position:absolute; bottom:-4px; right:-4px; width:26px; height:26px; border-radius:50%; background:var(--volt-lime-accent); border:2px solid var(--bg-surface); display:grid; place-items:center; cursor:pointer; font-size:12px; box-shadow:0 2px 6px rgba(0,0,0,0.3);">
            📸
          </button>
        </div>
        <div style="flex:1; min-width:160px;">
          <h3 style="font-size:18px; font-weight:800; color:var(--text-primary); margin:0 0 2px 0;">${escapeHtml(user.fullName || 'Sporcu')}</h3>
          <p style="font-size:13px; font-family:monospace; color:var(--text-muted); margin:0 0 6px 0;">${escapeHtml(user.phoneNumber)}</p>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span style="font-size:11px; font-weight:700; color:var(--volt-lime); background:var(--volt-lime-muted); padding:2px 8px; border-radius:999px; border:1px solid var(--border-subtle);">
              ${user.role === 'Admin' ? 'Salon Yöneticisi' : user.role === 'Coach' ? 'Antrenör' : 'Aktif Üye'}
            </span>
            <button type="button" onclick="document.getElementById('v0-avatar-file-input').click()" style="background:transparent; border:1px solid var(--border-medium); color:var(--text-secondary); font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; cursor:pointer;">
              Fotoğraf Değiştir
            </button>
            ${hasCustomAvatar ? `
              <button type="button" onclick="resetAvatarToDefault()" style="background:transparent; border:none; color:var(--volt-lime); font-size:11px; font-weight:700; cursor:pointer; text-decoration:underline;">
                Compound Avatarına Dön
              </button>` : ''}
          </div>
        </div>
      </div>

      <!-- Gizli dosya inputu -->
      <input type="file" id="v0-avatar-file-input" accept="image/*" style="display:none;" onchange="handleAvatarFileUpload(event)">
    </div>

    <!-- 2. Fiziksel Metrikler & Vücut Profili (Boy / Kilo / Yaş / Cinsiyet) -->
    <div class="v0-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px;">
        <h4 style="font-size:14px; font-weight:800; color:var(--text-primary); margin:0; display:flex; align-items:center; gap:8px; white-space:nowrap;">
          <span>📏</span> Vücut Metrikleri
        </h4>
        <span id="profile-bmi-badge" style="${curBmi ? 'display:inline-flex;' : 'display:none;'} align-items:center; gap:6px; font-size:11.5px; font-weight:800; padding:4px 10px; border-radius:999px; background:var(--volt-lime-muted); color:var(--volt-lime); border:1px solid var(--border-subtle); flex-shrink:0; white-space:nowrap;">
          <span id="profile-bmi-text">VKİ: ${curBmi} · ${curBmiCategory}</span>
        </span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Boy (cm)</label>
          <input type="number" id="athlete-input-height" class="v0-phone-input" style="width:100%; box-sizing:border-box; font-size:13px; padding:10px 12px; border-radius:10px; background:var(--bg-surface-elevated); color:var(--text-primary); border:1px solid var(--border-subtle);" value="${curHeight}" placeholder="180" oninput="recalcProfileBmi()">
        </div>
        <div>
          <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Kilo (kg)</label>
          <input type="number" step="0.1" id="athlete-input-weight" class="v0-phone-input" style="width:100%; box-sizing:border-box; font-size:13px; padding:10px 12px; border-radius:10px; background:var(--bg-surface-elevated); color:var(--text-primary); border:1px solid var(--border-subtle);" value="${curWeight}" placeholder="78.5" oninput="recalcProfileBmi()">
        </div>
        <div>
          <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Yaş</label>
          <input type="number" id="athlete-input-age" class="v0-phone-input" style="width:100%; box-sizing:border-box; font-size:13px; padding:10px 12px; border-radius:10px; background:var(--bg-surface-elevated); color:var(--text-primary); border:1px solid var(--border-subtle);" value="${curAge}" placeholder="28">
        </div>
        <div>
          <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Cinsiyet</label>
          <select id="athlete-input-gender" class="v0-phone-input" style="width:100%; box-sizing:border-box; font-size:13px; padding:10px 12px; border-radius:10px; background:var(--bg-surface-elevated); color:var(--text-primary); border:1px solid var(--border-subtle);">
            <option value="" ${!curGender ? 'selected' : ''}>Seçiniz</option>
            <option value="Erkek" ${curGender === 'Erkek' ? 'selected' : ''}>Erkek</option>
            <option value="Kadın" ${curGender === 'Kadın' ? 'selected' : ''}>Kadın</option>
            <option value="Belirtmek İstemiyorum" ${curGender === 'Belirtmek İstemiyorum' ? 'selected' : ''}>Belirtmek İstemiyorum</option>
          </select>
        </div>
      </div>

      <button type="button" class="v0-btn-submit" onclick="submitSaveAthleteMetrics(${user.memberId || 0})" style="margin-top:16px; padding:11px; font-size:12.5px; font-weight:800;">
        <span>💾</span> Fiziksel Bilgileri Kaydet
      </button>
    </div>

    <!-- 3. Rezervasyonlarım -->
    <div class="v0-card">
      <h4 style="font-size:13px; font-weight:700; color:var(--text-secondary); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Rezervasyonlarım</h4>
      ${reservationsHtml}
    </div>

    <!-- 4. Uygulama & Mobil Cihaz Durumu (PWA) -->
    <div class="v0-card" style="${isAppInstalled() ? 'border:1px solid rgba(16,185,129,0.35); background:rgba(16,185,129,0.06);' : 'border:1px solid var(--volt-lime); background:linear-gradient(135deg, rgba(204,255,0,0.08), var(--bg-surface-elevated));'}">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="/images/tiger2_badge.png?v=2.7.5" alt="SporTakip" style="width:36px; height:36px; object-fit:contain; filter:drop-shadow(0 0 10px rgba(204,255,0,0.4));">
          <div>
            <h4 style="margin:0; font-size:13.5px; font-weight:800; color:var(--text-primary);">${isAppInstalled() ? 'SporTakip Mobil Uygulaması Aktif' : 'Uygulamayı Cihazınıza Yükleyin'}</h4>
            <p style="margin:2px 0 0 0; font-size:11.5px; color:var(--text-secondary);">${isAppInstalled() ? 'Uygulama tam ekran modunda cihazınızda kurulu çalışıyor.' : 'Ana ekrana ekleyerek 1 saniyede açılan mobil deneyim yaşayın.'}</p>
          </div>
        </div>
        ${isAppInstalled() ? `
          <span style="font-size:11px; font-weight:800; color:var(--volt-lime); background:var(--volt-lime-muted); padding:4px 10px; border-radius:999px; border:1px solid var(--border-subtle);">
            ✓ Kurulu
          </span>
        ` : `
          <button type="button" class="btn-primary" style="padding:8px 14px; font-size:12px; font-weight:800;" onclick="triggerPwaInstall()">
            <img src="/images/tiger1_badge.png?v=2.7.5" class="tiger-icon-inline tiger-icon-xs" style="margin-right:4px;"> ${isIosDevice() ? 'Nasıl Yüklenir?' : 'Hemen Yükle'}
          </button>
        `}
      </div>
    </div>

    <button style="width:100%; border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.08); color:var(--pulse-rose); border-radius:12px; padding:12px; font-weight:700; font-size:13px; cursor:pointer; margin-top:8px;" onclick="handleLogout()">
      Çıkış Yap
    </button>
  `;
};

window.recalcProfileBmi = function() {
  const h = parseFloat(document.getElementById('athlete-input-height')?.value || 0);
  const w = parseFloat(document.getElementById('athlete-input-weight')?.value || 0);
  const badge = document.getElementById('profile-bmi-badge');
  const text = document.getElementById('profile-bmi-text');
  if (!badge) return;

  if (h > 50 && w > 20) {
    const hm = h / 100;
    const bmi = Math.round((w / (hm * hm)) * 10) / 10;
    let cat = 'Normal / Fit';
    let color = '#CCFF00';
    if (bmi < 18.5) { cat = 'Zayıf'; color = '#38BDF8'; }
    else if (bmi >= 25 && bmi <= 29.9) { cat = 'Fazla Kilolu'; color = '#F59E0B'; }
    else if (bmi >= 30) { cat = 'Yüksek'; color = '#EF4444'; }

    badge.style.display = 'inline-flex';
    badge.style.flexShrink = '0';
    badge.style.whiteSpace = 'nowrap';
    badge.style.color = color;
    badge.style.borderColor = color;
    if (text) text.innerText = `VKİ: ${bmi} · ${cat}`;
  } else {
    badge.style.display = 'none';
  }
};

window.submitSaveAthleteMetrics = async function(memberId) {
  if (!memberId) {
    showToast('Kayıtlı sporcu profili bulunamadı.', 'error');
    return;
  }
  const heightVal = parseInt(document.getElementById('athlete-input-height')?.value || 0);
  const weightVal = parseFloat(document.getElementById('athlete-input-weight')?.value || 0);
  const ageVal = parseInt(document.getElementById('athlete-input-age')?.value || 0);
  const genderVal = document.getElementById('athlete-input-gender')?.value;

  try {
    showToast('⚡ Metrikler kaydediliyor...');
    await Api.updateMemberMetrics(memberId, {
      heightCm: heightVal > 0 ? heightVal : null,
      weightKg: weightVal > 0 ? weightVal : null,
      age: ageVal > 0 ? ageVal : null,
      gender: genderVal || null
    });
    showToast('✓ Fiziksel profiliniz başarıyla kaydedildi!');
    renderAthleteProfile();
  } catch (err) {
    showToast(`Kayıt Hatası: ${err.message}`, 'error');
  }
};

window.handleAvatarFileUpload = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('Fotoğraf boyutu 5 MB\'tan küçük olmalıdır.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    localStorage.setItem('sportakip_custom_avatar', dataUrl);
    updateAppAvatars();
    showToast('📸 Profil fotoğrafınız başarıyla güncellendi!');
    if (currentAthleteTab === 'profile') renderAthleteProfile();
  };
  reader.readAsDataURL(file);
};

window.resetAvatarToDefault = function() {
  localStorage.removeItem('sportakip_custom_avatar');
  updateAppAvatars();
  showToast('🐯 Varsayılan Compound Athletic kaplan amblemine dönüldü.');
  if (currentAthleteTab === 'profile') renderAthleteProfile();
};

function updateAppAvatars() {
  const avatarUrl = localStorage.getItem('sportakip_custom_avatar') || '/images/default-avatar.png?v=2.7.5';
  document.querySelectorAll('.v0-avatar-img, #athlete-avatar-img, #profile-avatar-img').forEach(img => {
    img.src = avatarUrl;
  });
}
window.updateAppAvatars = updateAppAvatars;

window.handleLogout = function() {
  Api.clearAuth();
  showToast('Çıkış yapıldı.');
  updateNavForUserRole();
  navigateTo('home');
};

window.handleAvatarClick = function() {
  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    openOtpDrawer();
  } else {
    navigateTo('profile');
  }
};

window.handleNotificationClick = function() {
  openNotificationDrawer();
};

window.openNotificationDrawer = function() {
  const drawer = document.getElementById('v0-notification-drawer');
  if (drawer) {
    drawer.classList.add('open');
    renderNotificationItems();
  }
  const dot = document.querySelector('.v0-bell-dot');
  if (dot) dot.style.display = 'none';
};

window.closeNotificationDrawer = function() {
  const drawer = document.getElementById('v0-notification-drawer');
  if (drawer) drawer.classList.remove('open');
};

window.handleNotificationBackdropClick = function(e) {
  if (e.target.id === 'v0-notification-drawer') closeNotificationDrawer();
};

window.togglePushPermission = async function() {
  if (!('Notification' in window)) {
    showToast('Tarayıcınız anlık bildirimleri desteklemiyor.', 'warning');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    updatePushUi();
    if (perm === 'granted') {
      showToast('✓ Bildirim izinleri başarıyla aktif edildi!', 'success');
      try {
        new Notification('SporTakip | Compound Athletic', {
          body: 'Seans ve paket hatırlatma bildirimleriniz aktif! 🐯',
          icon: '/icons/icon-192.png'
        });
      } catch (e) {
        // Notification constructor may throw on mobile
      }
    } else {
      showToast('Bildirim izni verilmedi veya engellendi.', 'warning');
    }
  } catch (err) {
    showToast('Bildirim izni alınamadı.', 'error');
  }
};

function updatePushUi() {
  const btn = document.getElementById('btn-toggle-push');
  const label = document.getElementById('push-status-label');
  if (!btn || !label) return;
  if (!('Notification' in window)) {
    label.innerText = 'Bu tarayıcıda bildirim desteklenmiyor';
    btn.style.display = 'none';
    return;
  }
  if (Notification.permission === 'granted') {
    label.innerText = 'Bildirimler aktif ve çalışıyor ✓';
    btn.innerText = 'Aktif ✓';
    btn.style.background = 'rgba(34, 197, 94, 0.2)';
    btn.style.color = '#4ade80';
    btn.style.cursor = 'default';
  } else if (Notification.permission === 'denied') {
    label.innerText = 'Bildirim izni tarayıcı ayarlarından engelli';
    btn.innerText = 'Engelli';
    btn.style.background = 'rgba(239, 68, 68, 0.2)';
    btn.style.color = '#f87171';
  } else {
    label.innerText = 'Seans saatinden önce anlık uyarı al';
    btn.innerText = 'İzin Ver';
    btn.style.background = 'var(--volt-lime-accent)';
    btn.style.color = '#000';
    btn.style.cursor = 'pointer';
  }
}

function renderNotificationItems() {
  const container = document.getElementById('v0-notification-list');
  if (!container) return;
  updatePushUi();

  const user = Api.getUser();
  const notifs = [
    {
      id: 1,
      unread: true,
      icon: '📅',
      title: 'Bugünkü Seans Hatırlatması',
      desc: user ? `${user.fullName || 'Sporcu'}, bugün planlanan seansınız için stüdyoya 10 dakika önce gelmenizi öneririz.` : 'Seanslarınızı ve doluluk durumunu Seanslar sekmesinden takip edebilirsiniz.',
      time: 'Bugün'
    },
    {
      id: 2,
      unread: true,
      icon: '⚡',
      title: 'Paket ve Seans Durumu',
      desc: 'Kalan derslerinizi ve seans hakkınızı Profilim sekmesindeki karttan anlık takip edebilirsiniz.',
      time: '1 saat önce'
    },
    {
      id: 3,
      unread: false,
      icon: '🐯',
      title: 'Compound Athletic Mobil PWA',
      desc: 'SporTakip uygulamasını ana ekranınıza ekleyerek tam ekran ve çevrimdışı hızlı erişim sağlayabilirsiniz.',
      time: 'Dün'
    }
  ];

  const unreadCount = notifs.filter(n => n.unread).length;
  const summary = document.getElementById('notification-unread-summary');
  if (summary) summary.innerText = `${unreadCount} okunmamış bildirim`;

  container.innerHTML = notifs.map(n => `
    <div class="v0-notification-card ${n.unread ? 'unread' : ''}">
      <div class="v0-notif-icon-box">${n.icon}</div>
      <div class="v0-notif-body">
        <div class="v0-notif-title">${escapeHtml(n.title)}</div>
        <div class="v0-notif-desc">${escapeHtml(n.desc)}</div>
        <div class="v0-notif-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

window.markAllNotificationsRead = function() {
  document.querySelectorAll('.v0-notification-card.unread').forEach(el => el.classList.remove('unread'));
  const summary = document.getElementById('notification-unread-summary');
  if (summary) summary.innerText = 'Tümü okundu ✓';
  showToast('✓ Tüm bildirimler okundu olarak işaretlendi.');
};


// ==================== OTP DRAWER CONTROLLER ====================
window.openOtpDrawer = function() {
  const drawer = document.getElementById('v0-otp-drawer');
  if (drawer) drawer.classList.add('open');
  goToPhoneStep();
};

window.closeOtpDrawer = function() {
  const drawer = document.getElementById('v0-otp-drawer');
  if (drawer) drawer.classList.remove('open');
  if (otpCountdownTimer) clearInterval(otpCountdownTimer);
};

window.handleOtpBackdropClick = function(e) {
  if (e.target.id === 'v0-otp-drawer') closeOtpDrawer();
};

window.goToPhoneStep = function() {
  document.getElementById('v0-otp-step-phone').style.display = 'block';
  document.getElementById('v0-otp-step-code').style.display = 'none';
  document.getElementById('v0-otp-step-subtitle').innerText = 'Telefon numaranızı girerek hemen giriş yapın';
  const input = document.getElementById('v0-input-phone');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 200);
  }
  document.getElementById('v0-btn-send-otp').disabled = true;
  if (otpCountdownTimer) clearInterval(otpCountdownTimer);
};

window.goToCodeStep = function() {
  document.getElementById('v0-otp-step-phone').style.display = 'none';
  document.getElementById('v0-otp-step-code').style.display = 'block';
  document.getElementById('v0-otp-step-subtitle').innerText = 'SMS ile gelen 6 haneli kodu girin';
  
  const boxes = document.querySelectorAll('.v0-otp-box');
  boxes.forEach(b => {
    b.value = '';
    b.classList.remove('has-val');
  });
  document.getElementById('v0-btn-verify-otp').disabled = true;
  setTimeout(() => boxes[0]?.focus(), 250);

  startOtpTimer(180);
};

function startOtpTimer(seconds) {
  if (otpCountdownTimer) clearInterval(otpCountdownTimer);
  let remain = seconds;
  const timerEl = document.getElementById('v0-otp-timer');
  const update = () => {
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
    if (timerEl) timerEl.innerText = `${mm}:${ss}`;
    if (remain <= 0) {
      clearInterval(otpCountdownTimer);
      if (timerEl) timerEl.innerText = 'Süre Doldu';
    }
    remain--;
  };
  update();
  otpCountdownTimer = setInterval(update, 1000);
}

window.handlePhoneInput = function(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 10);
  let parts = [val.slice(0, 3), val.slice(3, 6), val.slice(6, 8), val.slice(8, 10)].filter(Boolean);
  input.value = parts.join(' ');
  const btn = document.getElementById('v0-btn-send-otp');
  btn.disabled = val.length !== 10;
};

window.submitSendOtp = async function() {
  const input = document.getElementById('v0-input-phone');
  const raw = input.value.replace(/\D/g, '');
  if (raw.length !== 10) return;
  const fullPhone = `+90${raw}`;
  currentOtpPhone = fullPhone;

  try {
    const res = await Api.sendOtp(fullPhone);
    const codeToShow = res.devCode || '123456';
    showToast(`⚡ Doğrulama kodu: ${codeToShow}`, 'success');
    goToCodeStep();

    const subtitle = document.getElementById('v0-otp-step-subtitle');
    if (subtitle) {
      subtitle.innerHTML = `SMS Doğrulama Kodu: <strong style="color:#CCFF00; font-size:16px; letter-spacing:3px;">${codeToShow}</strong>`;
    }

    // Geliştirme ortamında kutuları kolayca doldur
    const boxes = document.querySelectorAll('.v0-otp-box');
    codeToShow.split('').forEach((ch, i) => {
      if (boxes[i]) {
        boxes[i].value = ch;
        boxes[i].classList.add('has-val');
      }
    });
    checkCodeComplete();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

window.resendOtp = async function() {
  if (!currentOtpPhone) return;
  try {
    await Api.sendOtp(currentOtpPhone);
    showToast('⚡ Yeni doğrulama kodu gönderildi!');
    startOtpTimer(180);
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

function checkCodeComplete() {
  const boxes = Array.from(document.querySelectorAll('.v0-otp-box'));
  const code = boxes.map(b => b.value).join('');
  const btn = document.getElementById('v0-btn-verify-otp');
  if (btn) btn.disabled = code.length !== 6;
}

window.submitVerifyOtp = async function() {
  const boxes = Array.from(document.querySelectorAll('.v0-otp-box'));
  const code = boxes.map(b => b.value).join('');
  if (code.length !== 6 || !currentOtpPhone) return;

  try {
    const res = await Api.verifyOtp(currentOtpPhone, code);
    Api.setToken(res.accessToken);
    Api.setRefreshToken(res.refreshToken);
    Api.setUser(res.user);
    showToast(`🎉 Hoş geldin, ${res.user.fullName || 'Sporcu'}! Giriş yapıldı.`);
    closeOtpDrawer();
    updateNavForUserRole();
    updateAppAvatars();

    const roles = res.user && res.user.roles ? res.user.roles : (res.user && res.user.role ? [res.user.role] : []);
    if (roles.includes('Coach') || roles.includes('Admin')) {
      navigateTo('yoklama');
    } else {
      navigateTo('home');
    }
  } catch (err) {
    showToast(`Doğrulama Hatası: ${err.message}`, 'error');
  }
};

function setupOtpBoxListeners() {
  const boxes = document.querySelectorAll('.v0-otp-box');
  boxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      const digit = box.value.replace(/\D/g, '').slice(-1);
      box.value = digit;
      box.classList.toggle('has-val', !!digit);
      if (digit && idx < 5) {
        boxes[idx + 1].focus();
      }
      checkCodeComplete();
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        boxes[idx - 1].focus();
      }
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      paste.split('').forEach((ch, i) => {
        if (boxes[i]) {
          boxes[i].value = ch;
          boxes[i].classList.add('has-val');
        }
      });
      if (boxes[Math.min(5, paste.length - 1)]) boxes[Math.min(5, paste.length - 1)].focus();
      checkCodeComplete();
    });
  });
}

// ==================== WORKOUT ENGINE (HEVY & NIKE TRAINING STYLE) ====================
let currentWorkoutSubTab = 'templates';
let activeWorkoutSession = null;
let workoutTimerInterval = null;
let currentWorkoutRating = 5;

window.switchWorkoutSubTab = function(subtab) {
  currentWorkoutSubTab = subtab;
  document.querySelectorAll('.v0-subtab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `btn-wsub-${subtab}`);
  });

  const views = {
    templates: document.getElementById('v0-workout-subview-templates'),
    live: document.getElementById('v0-workout-subview-live'),
    progress: document.getElementById('v0-workout-subview-progress')
  };

  Object.keys(views).forEach(k => {
    if (views[k]) views[k].style.display = k === subtab ? 'block' : 'none';
  });

  if (subtab === 'templates') loadWorkoutTemplates();
  else if (subtab === 'live') renderLiveWorkoutView();
  else if (subtab === 'progress') loadWorkoutProgress();
};

window.loadWorkoutHub = async function() {
  const activeId = localStorage.getItem('sportakip_active_workout_id');
  const dot = document.getElementById('v0-live-pulse-dot');

  if (activeId) {
    if (dot) dot.style.display = 'inline-block';
    try {
      activeWorkoutSession = await Api.getWorkoutLog(activeId);
      if (activeWorkoutSession && !activeWorkoutSession.completedAt) {
        startWorkoutTimer(activeWorkoutSession.startedAt);
        window.switchWorkoutSubTab('live');
        return;
      } else {
        localStorage.removeItem('sportakip_active_workout_id');
        activeWorkoutSession = null;
        if (dot) dot.style.display = 'none';
      }
    } catch {
      localStorage.removeItem('sportakip_active_workout_id');
      activeWorkoutSession = null;
      if (dot) dot.style.display = 'none';
    }
  }

  if (dot) dot.style.display = 'none';
  window.switchWorkoutSubTab('templates');
};

async function loadWorkoutTemplates() {
  const container = document.getElementById('v0-workout-templates-list');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4); font-size:13px;">Programlar yükleniyor...</div>';

  try {
    const templates = await Api.getWorkoutTemplates(true);
    if (!templates || templates.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:rgba(255,255,255,0.4); font-size:13px;">
          Henüz yayınlanmış antrenman programı bulunmuyor.
        </div>`;
      return;
    }

    container.innerHTML = templates.map(t => `
      <div class="v0-template-card">
        <div>
          <div class="v0-template-header">
            <h4 class="v0-template-title">${t.name}</h4>
            <span class="v0-template-category">${t.category || 'GÜÇ'}</span>
          </div>
          <p style="font-size:12.5px; color:rgba(255,255,255,0.6); margin:0 0 10px 0; line-height:1.4;">
            ${t.description || 'Antrenör tarafından hazırlanan özel program.'}
          </p>
          <div class="v0-template-meta">
            <span>⏱ ~${t.estimatedDurationMinutes} dk</span>
            <span>🏋️ ${t.exercises ? t.exercises.length : 0} Egzersiz</span>
            <span>👤 ${t.trainerName || 'Eğitmen'}</span>
          </div>
          <ul class="v0-template-exercises-list">
            ${(t.exercises || []).slice(0, 4).map(e => `
              <li class="v0-template-ex-item">
                <span>${e.exerciseNameTr || e.exerciseName}</span>
                <span style="font-weight:700; color:#CCFF00;">${e.targetSets} set × ${e.targetReps || '10'}</span>
              </li>
            `).join('')}
            ${t.exercises && t.exercises.length > 4 ? `
              <li class="v0-template-ex-item" style="color:rgba(255,255,255,0.4); font-style:italic;">
                +${t.exercises.length - 4} egzersiz daha...
              </li>` : ''}
          </ul>
        </div>
        <button type="button" class="v0-btn-submit" onclick="startNewWorkout(${t.id})" style="margin-top:12px; padding:12px; font-size:13px;">
          <span>🚀</span> İdmanı Başlat
        </button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#FF453A; font-size:13px;">Yükleme Hatası: ${err.message}</div>`;
  }
}

window.startNewWorkout = async function(templateId) {
  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    showToast('⚡ Antrenman başlatmak için lütfen giriş yapın.');
    openOtpDrawer();
    return;
  }

  try {
    showToast('⚡ Antrenman başlatılıyor...');
    const workout = await Api.startWorkout(templateId);
    activeWorkoutSession = workout;
    localStorage.setItem('sportakip_active_workout_id', workout.id);

    const dot = document.getElementById('v0-live-pulse-dot');
    if (dot) dot.style.display = 'inline-block';

    startWorkoutTimer(workout.startedAt);
    showToast(`🔥 "${workout.templateName || 'Serbest İdman'}" başladı! İyi antrenmanlar!`);
    window.switchWorkoutSubTab('live');
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

function startWorkoutTimer(startTimeStr) {
  if (workoutTimerInterval) clearInterval(workoutTimerInterval);
  const startMs = new Date(startTimeStr).getTime();

  function update() {
    const el = document.getElementById('v0-live-timer-display');
    if (!el) return;
    const diff = Math.max(0, Date.now() - startMs);
    const secs = Math.floor((diff / 1000) % 60);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    el.innerText = `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  update();
  workoutTimerInterval = setInterval(update, 1000);
}

function renderLiveWorkoutView() {
  const container = document.getElementById('v0-live-workout-container');
  if (!container) return;

  const user = Api.getUser();
  const token = Api.getToken();
  if (!user || !token) {
    container.innerHTML = `
      <div style="background:#141418; border:1px solid #222228; border-radius:18px; padding:48px 24px; text-align:center;">
        <span style="font-size:42px; display:block; margin-bottom:12px;">🔒</span>
        <h3 style="font-size:18px; font-weight:800; color:#FFFFFF; margin:0 0 8px 0;">Canlı İdman Kaydı Kilitli</h3>
        <p style="font-size:13px; color:rgba(255,255,255,0.6); margin:0 auto 20px auto; max-width:360px; line-height:1.5;">
          Set ağırlıklarını ve tekrarlarını canlı kaydetmek, otomatik 1RM hesaplamasından yararlanmak için giriş yapın.
        </p>
        <button type="button" class="v0-btn-submit" onclick="openOtpDrawer()" style="max-width:240px; margin:0 auto; padding:12px 20px; font-size:13px;">
          <span>📱</span> SMS ile Giriş Yap
        </button>
      </div>`;
    return;
  }

  if (!activeWorkoutSession) {
    container.innerHTML = `
      <div style="background:#141418; border:1px solid #222228; border-radius:18px; padding:48px 24px; text-align:center;">
        <span style="font-size:42px; display:block; margin-bottom:12px;">🏋️‍♂️</span>
        <h3 style="font-size:18px; font-weight:800; color:#FFFFFF; margin:0 0 8px 0;">Şu Anda Aktif İdman Yok</h3>
        <p style="font-size:13px; color:rgba(255,255,255,0.6); margin:0 0 20px 0;">
          Bir program seçerek canlı set kayıtlarına hemen başlayabilirsin.
        </p>
        <button type="button" class="v0-btn-submit" onclick="switchWorkoutSubTab('templates')" style="max-width:240px; margin:0 auto; padding:12px 20px; font-size:13px;">
          Programları İncele
        </button>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="v0-live-bar">
      <div>
        <span style="font-size:11px; font-weight:800; color:#CCFF00; letter-spacing:0.06em; text-transform:uppercase;">● CANLI İDMAN</span>
        <h3 style="font-size:18px; font-weight:800; color:#FFFFFF; margin:2px 0 0 0;">${activeWorkoutSession.templateName || 'Serbest Antrenman'}</h3>
      </div>
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="v0-live-timer" id="v0-live-timer-display">00:00</div>
        <button type="button" onclick="openFinishWorkoutModal()" style="padding:9px 18px; font-size:12.5px; border-radius:9999px; background:#FF453A; color:#FFF; border:none; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          <span>🏁</span> Bitir
        </button>
      </div>
    </div>

    <div class="v0-live-exercises-container">
      ${(activeWorkoutSession.exerciseLogs || []).map(el => `
        <div class="v0-live-exercise-card" id="card-el-${el.id}">
          <div class="v0-live-ex-header">
            <div>
              <span style="font-size:10.5px; font-weight:700; color:rgba(255,255,255,0.4); text-transform:uppercase;">
                ${el.muscleGroup || 'FullBody'} • ${el.equipment || 'Serbest Ağırlık'}
              </span>
              <div class="v0-live-ex-title">${el.exerciseNameTr || el.exerciseName}</div>
            </div>
            ${el.notes ? `<span style="font-size:11px; color:#CCFF00; background:rgba(204,255,0,0.1); border:1px solid rgba(204,255,0,0.25); padding:3px 8px; border-radius:6px;">${el.notes}</span>` : ''}
          </div>

          <table class="v0-set-table">
            <thead>
              <tr>
                <th style="width:36px;">SET</th>
                <th>KG</th>
                <th>TEKRAR</th>
                <th style="width:68px;">1RM</th>
                <th style="width:44px;">DURUM</th>
              </tr>
            </thead>
            <tbody>
              ${(el.sets || []).map(s => `
                <tr class="v0-set-row ${s.isCompleted ? 'completed' : ''}" id="set-row-${s.id}">
                  <td style="font-weight:800; color:rgba(255,255,255,0.6); font-size:12px;">${s.setNumber}</td>
                  <td>
                    <input type="number" step="0.5" class="v0-set-input" id="set-weight-${s.id}" value="${s.weightKg ?? ''}" placeholder="0" onchange="autoCalc1Rm(${s.id})">
                  </td>
                  <td>
                    <input type="number" step="1" class="v0-set-input" id="set-reps-${s.id}" value="${s.reps ?? ''}" placeholder="0" onchange="autoCalc1Rm(${s.id})">
                  </td>
                  <td>
                    <span id="set-1rm-${s.id}" class="v0-1rm-badge" style="${s.estimatedOneRepMax ? '' : 'display:none;'}">
                      ${s.estimatedOneRepMax ? s.estimatedOneRepMax + ' kg' : ''}
                    </span>
                  </td>
                  <td>
                    <button type="button" class="v0-set-check-btn ${s.isCompleted ? 'checked' : ''}" id="set-btn-${s.id}" onclick="toggleSetLog(${s.id}, ${el.id})">
                      ${s.isCompleted ? '✓' : '○'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

window.autoCalc1Rm = function(setId) {
  const w = parseFloat(document.getElementById(`set-weight-${setId}`)?.value || 0);
  const r = parseInt(document.getElementById(`set-reps-${setId}`)?.value || 0);
  const badge = document.getElementById(`set-1rm-${setId}`);
  if (!badge) return;

  if (w > 0 && r > 0) {
    const e1rm = r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10;
    badge.innerText = `${e1rm} kg`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
};

window.toggleSetLog = async function(setId, exerciseLogId) {
  const weightInput = document.getElementById(`set-weight-${setId}`);
  const repsInput = document.getElementById(`set-reps-${setId}`);
  const btn = document.getElementById(`set-btn-${setId}`);
  const row = document.getElementById(`set-row-${setId}`);

  const weight = parseFloat(weightInput?.value || 0);
  const reps = parseInt(repsInput?.value || 0);
  const currentlyCompleted = btn?.classList.contains('checked');
  const nextCompleted = !currentlyCompleted;

  try {
    const res = await Api.updateWorkoutSet(setId, {
      weightKg: weight > 0 ? weight : null,
      reps: reps > 0 ? reps : null,
      isCompleted: nextCompleted
    });

    if (btn) {
      btn.classList.toggle('checked', nextCompleted);
      btn.innerText = nextCompleted ? '✓' : '○';
    }
    if (row) {
      row.classList.toggle('completed', nextCompleted);
    }

    const badge = document.getElementById(`set-1rm-${setId}`);
    if (badge) {
      if (res.estimatedOneRepMax) {
        badge.innerText = `${res.estimatedOneRepMax} kg`;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (nextCompleted) {
      showToast(`✓ Set Kaydedildi (${weight} kg × ${reps} tekrar)`);
    }
  } catch (err) {
    showToast(`Set Kaydetme Hatası: ${err.message}`, 'error');
  }
};

window.openFinishWorkoutModal = function() {
  const modal = document.getElementById('v0-modal-finish-workout');
  const durEl = document.getElementById('v0-finish-modal-duration');
  if (activeWorkoutSession) {
    const startMs = new Date(activeWorkoutSession.startedAt).getTime();
    const min = Math.max(1, Math.round((Date.now() - startMs) / 60000));
    if (durEl) durEl.innerText = `Toplam Süre: ${min} dakika`;
  }
  window.setWorkoutRating(5);
  openModal('v0-modal-finish-workout');
};

window.setWorkoutRating = function(rating) {
  currentWorkoutRating = rating;
  const stars = document.querySelectorAll('.v0-star');
  stars.forEach((s, idx) => {
    s.style.opacity = idx < rating ? '1' : '0.3';
    s.style.transform = idx < rating ? 'scale(1.15)' : 'scale(1)';
    s.style.transition = 'all 0.15s ease';
  });
};

window.submitFinishWorkout = async function() {
  if (!activeWorkoutSession) return;
  const notes = document.getElementById('v0-finish-notes')?.value;

  try {
    showToast('Antrenman kaydediliyor...');
    await Api.finishWorkout(activeWorkoutSession.id, currentWorkoutRating, notes);

    clearInterval(workoutTimerInterval);
    workoutTimerInterval = null;
    localStorage.removeItem('sportakip_active_workout_id');
    activeWorkoutSession = null;

    const dot = document.getElementById('v0-live-pulse-dot');
    if (dot) dot.style.display = 'none';

    closeModal('v0-modal-finish-workout');
    showToast('🏆 Harika iş! Antrenmanın başarıyla tamamlandı ve kaydedildi.');

    window.switchWorkoutSubTab('progress');
  } catch (err) {
    showToast(`Kayıt Hatası: ${err.message}`, 'error');
  }
};

async function loadWorkoutProgress() {
  const container = document.getElementById('v0-progress-container');
  if (!container) return;

  const user = Api.getUser();
  const token = Api.getToken();

  if (!user || !token) {
    container.innerHTML = `
      <div style="background:#141418; border:1px solid #222228; border-radius:18px; padding:36px 20px; text-align:center;">
        <span style="font-size:38px; display:block; margin-bottom:12px;">🔒</span>
        <h3 style="font-size:17px; font-weight:800; color:#FFFFFF; margin:0 0 6px 0;">Kişisel Rekorlar ve İlerleme Takibi Kilitli</h3>
        <p style="font-size:13px; color:rgba(255,255,255,0.6); margin:0 auto 20px auto; max-width:380px; line-height:1.5;">
          Geçmiş antrenmanlarınızı, Epley formülü ile hesaplanan 1RM ağırlıklarınızı ve kırdığınız PR'ları takip etmek için telefon numaranızla giriş yapın.
        </p>
        <button type="button" class="v0-btn-submit" onclick="openOtpDrawer()" style="max-width:220px; margin:0 auto; padding:12px; font-size:13px;">
          <span>📱</span> SMS ile Giriş Yap
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4); font-size:13px;">Gelişim ve rekorlar yükleniyor...</div>';

  try {
    // Egzersiz listesi ve geçmiş antrenmanları paralel çek
    const [exercises, history] = await Promise.all([
      Api.getExercises().catch(() => []),
      Api.getMyWorkoutHistory(10).catch(() => [])
    ]);

    // Barbell Squat ve Barbell Bench Press için PR'ları sorgula
    const squatEx = exercises.find(e => e.name.includes('Squat'));
    const benchEx = exercises.find(e => e.name.includes('Bench Press'));

    let squatProgress = null;
    let benchProgress = null;

    if (squatEx) squatProgress = await Api.getExerciseProgress(squatEx.id).catch(() => null);
    if (benchEx) benchProgress = await Api.getExerciseProgress(benchEx.id).catch(() => null);

    let html = `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:15px; font-weight:800; color:var(--text-primary); margin-bottom:12px; display:flex; align-items:center; gap:8px;">
          <span>🥇</span> Kişisel Rekorlar (Personal Records)
        </h3>
        <div class="v0-pr-grid">
          <div class="v0-pr-card">
            <span style="font-size:11px; font-weight:800; color:var(--volt-lime); text-transform:uppercase;">BARBELL SQUAT</span>
            <div class="v0-pr-weight">${squatProgress && squatProgress.personalRecordWeightKg ? squatProgress.personalRecordWeightKg + ' kg' : '-- kg'}</div>
            <div style="font-size:12px; color:var(--text-secondary);">
              ${squatProgress && squatProgress.bestRepsAtPr ? squatProgress.bestRepsAtPr + ' Tekrar' : 'Henüz kayıt yok'} 
              ${squatProgress && squatProgress.bestEstimatedOneRepMax ? `• ⚡ 1RM: <strong style="color:var(--volt-lime);">${squatProgress.bestEstimatedOneRepMax} kg</strong>` : ''}
            </div>
          </div>

          <div class="v0-pr-card">
            <span style="font-size:11px; font-weight:800; color:var(--volt-lime); text-transform:uppercase;">BARBELL BENCH PRESS</span>
            <div class="v0-pr-weight">${benchProgress && benchProgress.personalRecordWeightKg ? benchProgress.personalRecordWeightKg + ' kg' : '-- kg'}</div>
            <div style="font-size:12px; color:var(--text-secondary);">
              ${benchProgress && benchProgress.bestRepsAtPr ? benchProgress.bestRepsAtPr + ' Tekrar' : 'Henüz kayıt yok'} 
              ${benchProgress && benchProgress.bestEstimatedOneRepMax ? `• ⚡ 1RM: <strong style="color:var(--volt-lime);">${benchProgress.bestEstimatedOneRepMax} kg</strong>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 style="font-size:15px; font-weight:800; color:var(--text-primary); margin-bottom:12px; display:flex; align-items:center; gap:8px;">
          <span>📈</span> Geçmiş Antrenmanlarım
        </h3>
        ${history && history.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${history.map(h => {
              const d = new Date(h.startedAt);
              const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
              return `
                <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:14px; padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; box-shadow:var(--shadow-card);">
                  <div>
                    <div style="font-size:14px; font-weight:800; color:var(--text-primary);">${h.templateName || 'Serbest Antrenman'}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                      ${dateStr} • ${h.durationMinutes || 45} dk • ${h.exerciseLogs ? h.exerciseLogs.length : 0} egzersiz
                    </div>
                    ${h.notes ? `<div style="font-size:11.5px; color:var(--volt-lime); margin-top:4px; font-style:italic;">"${h.notes}"</div>` : ''}
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:14px;">${'⭐'.repeat(h.rating || 5)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:14px; padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">
            Henüz tamamlanmış antrenman oturumunuz bulunmuyor.
          </div>
        `}
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#FF453A; font-size:13px;">Yükleme Hatası: ${err.message}</div>`;
  }
}

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
  // Capture beforeinstallprompt for Chrome / Android / Edge (ready for user click)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // Track appinstalled event
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    showToast('🎉 SporTakip başarıyla ana ekranınıza yüklendi!');
    if (currentAthleteTab === 'profile') renderAthleteProfile();
  });
}

// App Initialization
// Guest Lead Modal Handlers
window.openLeadModal = function(interest = 'Genel') {
  const modal = document.getElementById('modal-lead-contact');
  const interestSelect = document.getElementById('lead-interest');
  if (interestSelect && interest) {
    if (interest.includes('PT')) interestSelect.value = 'PT';
    else if (interest.includes('Grup')) interestSelect.value = 'Grup';
    else interestSelect.value = 'Uyelik';
  }
  if (modal) modal.classList.add('active');
};

window.handleLeadSubmit = function(event) {
  event.preventDefault();
  const name = document.getElementById('lead-name')?.value?.trim();
  const phone = document.getElementById('lead-phone')?.value?.trim();
  const interest = document.getElementById('lead-interest')?.value;

  if (!name || !phone) {
    showToast('Lütfen adınızı ve telefon numaranızı girin.', 'error');
    return;
  }

  try {
    const leads = JSON.parse(localStorage.getItem('sportakip_guest_leads') || '[]');
    leads.push({
      name,
      phone,
      interest,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('sportakip_guest_leads', JSON.stringify(leads));
  } catch (e) {}

  closeModal('modal-lead-contact');
  showToast('🎉 Talebiniz alındı! Eğitmenlerimiz en kısa sürede sizinle iletişime geçecektir.', 'success');

  const form = document.getElementById('form-lead-contact');
  if (form) form.reset();
};

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] ServiceWorker registration failed:', err);
    });
  }
  setupOtpBoxListeners();
  updateAppAvatars();
  updateNavForUserRole();
  initPwaInstallFlow();

  const urlParams = new URLSearchParams(window.location.search);
  const requestedTab = urlParams.get('tab') || localStorage.getItem('sportakip_tab') || 'home';
  window.navigateTo(requestedTab);
});


