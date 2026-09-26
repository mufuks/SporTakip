import { Api } from '../api.js?v=3.0.0';
import { state } from './state.js';
import { 
  showToast, openModal, closeModal, escapeHtml, escapeJsString, 
  formatMoney, formatCurrency, getAthleteInitials 
} from './utils.js';

// Staff Module Scoped State
let activeSubscriptions = [];
let allMembers = [];
let packages = [];
let allTrainers = [];
let capacitySlotsData = [];
let selectedSlotHour = null;
let currentCapacityDate = new Date().toISOString().split('T')[0];
let waTargetSub = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;

// ==================== 1. HIZLI YOKLAMA (ATTENDANCE & CAPACITY) ====================
async function loadAttendanceView() {
  const container = document.getElementById('attendance-list');

  // SWR Pattern: Eğer önceden yüklenmiş veri varsa anında çiz (0ms gecikme)
  if (activeSubscriptions && activeSubscriptions.length > 0) {
    applyAttendanceFilter(currentFilter);
    renderCapacityWeekStrip();
  } else {
    container.innerHTML = '<div style="color:var(--text-muted); padding:40px; text-align:center;">Antrenman listesi yükleniyor...</div>';
  }

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
    if (!activeSubscriptions || activeSubscriptions.length === 0) {
      container.innerHTML = `<div style="color:var(--pulse-rose); padding:20px;">Hata: ${err.message}</div>`;
    }
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
  const markAllBtn = document.getElementById('btn-mark-all-attended');

  if (slot && detailsBox && detailsText) {
    const athletes = slot.members.map(m => `${m.memberName} (${m.status === 'Attended' ? 'Geldi' : 'Planlı'})`).join(', ');
    detailsText.innerHTML = `<strong>Saat ${slot.timeSlot}:</strong> Toplam ${slot.totalMembers} kişi ${athletes ? `— ${escapeHtml(athletes)}` : '(Henüz kayıt yok)'}`;

    if (markAllBtn) {
      const pendingMembers = slot.members.filter(m => m.status !== 'Attended');
      if (pendingMembers.length === 0 && slot.members.length > 0) {
        markAllBtn.disabled = true;
        markAllBtn.style.opacity = '0.6';
        markAllBtn.title = 'Tüm sporcular zaten katıldı olarak işlenmiş';
      } else if (slot.members.length === 0) {
        markAllBtn.disabled = true;
        markAllBtn.style.opacity = '0.4';
        markAllBtn.title = 'Kayıtlı sporcu yok';
      } else {
        markAllBtn.disabled = false;
        markAllBtn.style.opacity = '1';
        markAllBtn.title = `Kayıtlı ${pendingMembers.length} sporcunun yoklamasını 'Geldi' olarak kaydet`;
      }
    }

    detailsBox.style.display = 'flex';
  }

  renderCapacitySlots(capacitySlotsData);
  applyAttendanceFilter(currentFilter);
};

window.handleMarkAllAttendedForSlot = async function() {
  if (selectedSlotHour === null) return;
  const slot = capacitySlotsData?.find(s => s.hour === selectedSlotHour);
  if (!slot || !slot.members || slot.members.length === 0) {
    showToast('Bu saatte kayıtlı sporcu bulunmuyor.', 'info');
    return;
  }

  const pendingMembers = slot.members.filter(m => m.status !== 'Attended');
  if (pendingMembers.length === 0) {
    showToast(`Saat ${slot.timeSlot} seansındaki tüm sporcular zaten 'Geldi' olarak işlenmiş.`, 'info');
    return;
  }

  const confirmed = confirm(`Saat ${slot.timeSlot} seansındaki ${pendingMembers.length} sporcunun yoklaması 'Geldi' olarak kaydedilsin mi?`);
  if (!confirmed) return;

  const btn = document.getElementById('btn-mark-all-attended');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Kaydediliyor...';
  }

  try {
    const res = await Api.markAllSlotAttendance({
      date: currentCapacityDate ? new Date(currentCapacityDate + 'T00:00:00Z').toISOString() : new Date().toISOString(),
      hour: selectedSlotHour
    });

    showToast(res.message || `${res.updatedCount} sporcunun yoklaması kaydedildi!`, 'success');

    // Kapasite ve yoklama listesini yenile
    await loadAttendanceView();
  } catch (err) {
    console.error('Toplu yoklama hatası:', err);
    showToast(err.message || 'Toplu yoklama kaydedilirken bir hata oluştu.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✓</span> Tümünü Katıldı Say';
    }
  }
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


function renderMembersTable(members, container) {
  if (!members || members.length === 0) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:32px;">Kayıtlı üye bulunamadı.</td></tr>';
    return;
  }

  container.innerHTML = members.map(m => {
    const sub = m.activeSubscription;
    const subBadge = sub 
      ? `<span class="lesson-badge badge-green">${escapeHtml(sub.packageName)} (${sub.remainingLessons} Ders Kaldı)</span>`
      : `<span style="color:var(--text-muted); font-size:12px;">Aktif Paket Yok</span>`;

    return `
      <tr>
        <td>
          <strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(m.fullName)}</strong>
          ${m.medicalConditions ? `<div style="font-size:11.5px; font-weight:700; color:#FF453A; margin-top:3px; display:inline-flex; align-items:center; gap:4px; background:rgba(255,69,58,0.12); padding:2px 8px; border-radius:6px; border:1px solid rgba(255,69,58,0.25);">⚠️ ${escapeHtml(m.medicalConditions)}</div>` : ''}
          ${m.notes ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">📝 ${escapeHtml(m.notes)}</div>` : ''}
        </td>
        <td>${m.phone ? escapeHtml(m.phone) : '<span style="color:var(--text-muted);">-</span>'}</td>
        <td>${subBadge}</td>
        <td><strong style="color:var(--cyber-cyan);">${m.totalSubscriptionsCount}</strong> Dönem</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-primary" style="padding:7px 14px; font-size:12px;" onclick="openNewSubModalForMember(${m.id}, '${escapeHtml(m.fullName)}')">
              + Paket Sat
            </button>
            <button class="btn-secondary" style="padding:7px 12px; font-size:12px; color:var(--volt-lime); border-color:rgba(204,255,0,0.3);" onclick="openTemplateBuilderForMember(${m.id}, '${escapeJsString(m.fullName)}')">
              🏋️ Program Yaz
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
}

// ==================== 3. ÜYELER ====================
async function loadMembersView(search = '') {
  const container = document.getElementById('members-table-body');

  // SWR Pattern: Arama yapılmıyorsa ve hafızada üye listesi varsa anında göster (0ms)
  if (!search && allMembers && allMembers.length > 0) {
    renderMembersTable(allMembers, container);
  } else if (!allMembers || allMembers.length === 0 || search) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Yükleniyor...</td></tr>';
  }

  try {
    allMembers = await Api.getMembers(search);
    renderMembersTable(allMembers, container);
  } catch (err) {
    if (!allMembers || allMembers.length === 0) {
      container.innerHTML = `<tr><td colspan="6" style="color:var(--pulse-rose);">Hata: ${err.message}</td></tr>`;
    }
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">Kayıtlı eğitmen bulunamadı.</td></tr>';
    return;
  }
  tbody.innerHTML = trainers.map(t => `
    <tr>
      <td style="white-space:nowrap;"><strong style="color:var(--text-primary); font-size:15px;">${escapeHtml(t.fullName)}</strong></td>
      <td>${getRoleBadgeHtml(t.role)}</td>
      <td style="white-space:nowrap;">${t.phone ? escapeHtml(t.phone) : '<span style="color:var(--text-muted);">-</span>'}</td>
      <td style="white-space:nowrap;"><strong style="color:var(--flame-orange);">%${Math.round(t.defaultShareRate * 100)}</strong></td>
      <td><span class="lesson-badge ${t.isActive ? 'badge-green' : 'badge-red'}">${t.isActive ? 'Aktif' : 'Pasif'}</span></td>
      <td style="text-align:right;">
        <button class="btn-secondary" style="padding:4px 9px; font-size:11px; color:var(--cyber-cyan); border-color:rgba(0,242,254,0.3);" onclick="openEditTrainerModal(${t.id})">
          ✏️ Düzenle
        </button>
      </td>
    </tr>
  `).join('');
}

window.openEditTrainerModal = function(id) {
  const trainer = allTrainers.find(t => t.id === id);
  if (!trainer) return;
  document.getElementById('edit-t-id').value = trainer.id;
  document.getElementById('edit-t-name').value = trainer.fullName || '';
  document.getElementById('edit-t-role').value = trainer.role || 'Eğitmen';
  document.getElementById('edit-t-phone').value = trainer.phone || '';
  document.getElementById('edit-t-share-rate').value = Math.round((trainer.defaultShareRate || 0.40) * 100);
  document.getElementById('edit-t-active').checked = trainer.isActive !== false;
  openModal('modal-edit-trainer');
};

window.handleUpdateTrainerSubmit = async function(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('edit-t-id').value);
  const fullName = document.getElementById('edit-t-name').value.trim();
  const role = document.getElementById('edit-t-role').value;
  const phone = document.getElementById('edit-t-phone').value.trim();
  const shareRate = parseFloat(document.getElementById('edit-t-share-rate').value) / 100;
  const isActive = document.getElementById('edit-t-active').checked;

  try {
    const updated = await Api.updateTrainer(id, {
      fullName,
      role,
      phone: phone || null,
      defaultShareRate: shareRate,
      isActive
    });
    showToast(`✅ Eğitmen ${updated.fullName} güncellendi!`);
    closeModal('modal-edit-trainer');
    await loadInitialData();
  } catch (err) {
    showToast(`Eğitmen güncellenemedi: ${err.message}`, 'error');
  }
};

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
  if (allPackagesAdmin && allPackagesAdmin.length > 0) {
    renderPackagesTable(allPackagesAdmin);
  }
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
  const medicalConditions = document.getElementById('m-medical')?.value?.trim() || null;
  const notes = document.getElementById('m-notes').value;

  try {
    const created = await Api.createMember({ fullName, phone, notes, medicalConditions });
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
  if (document.getElementById('edit-m-medical')) {
    document.getElementById('edit-m-medical').value = m.medicalConditions || '';
  }
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
    medicalConditions: document.getElementById('edit-m-medical')?.value?.trim() || null,
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
function openScheduleSessionModal() {
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
}
window.openScheduleSessionModal = openScheduleSessionModal;

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


// Global window assignments for staff functions
window.loadAttendanceView = loadAttendanceView;
window.renderCapacityWeekStrip = renderCapacityWeekStrip;
window.loadCapacitySlots = loadCapacitySlots;
window.renderCapacitySlots = renderCapacitySlots;
window.applyAttendanceFilter = applyAttendanceFilter;
window.renderAttendanceList = renderAttendanceList;
window.loadDashboardView = loadDashboardView;
window.loadMembersView = loadMembersView;
window.getRoleBadgeHtml = getRoleBadgeHtml;
window.loadKasaView = loadKasaView;
window.loadTrainers = loadTrainers;
window.renderTrainersTable = renderTrainersTable;
window.updateTrainerSelects = updateTrainerSelects;
window.loadPackagesAdmin = loadPackagesAdmin;
window.renderPackagesTable = renderPackagesTable;
window.loadCalendarView = loadCalendarView;
window.renderCalendarGrid = renderCalendarGrid;
window.openScheduleModal = openScheduleSessionModal;

export {
  loadAttendanceView, renderCapacityWeekStrip, loadCapacitySlots, renderCapacitySlots,
  applyAttendanceFilter, renderAttendanceList, loadDashboardView, renderMembersTable,
  loadMembersView, getRoleBadgeHtml, loadKasaView, loadMyEarningsView,
  loadTrainers, renderTrainersTable, updateTrainerSelects, loadPackagesAdmin,
  renderPackagesTable, loadCalendarView, renderCalendarGrid
};
