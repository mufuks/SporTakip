import { Api } from '../api.js?v=3.8.7';
import { state } from './state.js';
import { 
  showToast, openModal, closeModal, escapeHtml, escapeJsString, 
  formatMoney, formatCurrency, getAthleteInitials, formatDateToIso, getStartOfWeekMonday
} from './utils.js?v=3.8.7';

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
let currentFilter = 'all';

// Option A: Live Floor Feed State
let currentDayScope = 'today'; // 'yesterday' | 'today'
let attendanceSessions = [];
let workoutTemplatesCache = [];
let sessionSearchQuery = '';

// ==================== 1. HIZLI YOKLAMA (LIVE FLOOR SESSIONS FEED) ====================

function getScopeTargetDate(scope) {
  const d = new Date();
  if (scope === 'yesterday') {
    d.setDate(d.getDate() - 1);
  }
  return formatDateToIso(d);
}

function updateDayScopeLabels() {
  const now = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const lblYest = document.getElementById('label-scope-yesterday');
  const lblToday = document.getElementById('label-scope-today');
  if (lblYest) {
    lblYest.innerText = `(${yest.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})`;
  }
  if (lblToday) {
    lblToday.innerText = `(Canlı · ${now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})`;
  }
}

async function switchAttendanceDayScope(scope) {
  if (scope !== 'yesterday' && scope !== 'today') scope = 'today';
  currentDayScope = scope;
  const btnYest = document.getElementById('btn-scope-yesterday');
  const btnToday = document.getElementById('btn-scope-today');
  if (btnYest) btnYest.classList.toggle('active', scope === 'yesterday');
  if (btnToday) btnToday.classList.toggle('active', scope === 'today');
  await loadAttendanceView();
}
window.switchAttendanceDayScope = switchAttendanceDayScope;

async function loadAttendanceView() {
  updateDayScopeLabels();
  const feedContainer = document.getElementById('attendance-sessions-feed');
  const targetDateIso = getScopeTargetDate(currentDayScope);
  currentCapacityDate = targetDateIso;

  if (feedContainer && (!attendanceSessions || attendanceSessions.length === 0)) {
    feedContainer.innerHTML = '<div style="color:var(--text-muted); padding:30px; text-align:center;">Seanslar ve sporcu listesi yükleniyor...</div>';
  }

  try {
    const [sessions, capacity, trainers, subs, templates] = await Promise.all([
      Api.getSessions(targetDateIso, targetDateIso).catch(() => []),
      Api.getCapacity(targetDateIso).catch(() => []),
      allTrainers.length > 0 ? Promise.resolve(allTrainers) : Api.getTrainers().catch(() => []),
      activeSubscriptions.length > 0 ? Promise.resolve(activeSubscriptions) : Api.getActiveSubscriptions().catch(() => []),
      workoutTemplatesCache.length > 0 ? Promise.resolve(workoutTemplatesCache) : Api.getWorkoutTemplates(true).catch(() => [])
    ]);

    allTrainers = trainers || [];
    activeSubscriptions = subs || [];
    workoutTemplatesCache = templates || [];
    capacitySlotsData = capacity || [];

    attendanceSessions = processSessionsFeedData(sessions || [], capacitySlotsData || [], activeSubscriptions);

    renderSessionsAttendanceFeed(attendanceSessions);

    // Legacy sync
    if (typeof renderCapacityWeekStrip === 'function') renderCapacityWeekStrip();
  } catch (err) {
    console.error('Yoklama akışı yükleme hatası:', err);
    if (feedContainer) {
      feedContainer.innerHTML = `<div style="color:var(--pulse-rose); padding:24px; text-align:center;">Hata: ${escapeHtml(err.message || 'Seanslar alınamadı.')}</div>`;
    }
  }
}

function processSessionsFeedData(slots, capacitySlots, subscriptions) {
  const result = [];
  const processedSlotIds = new Set();
  const coveredHours = new Set();

  // 1. Session Slots (Faz 3)
  for (const s of slots) {
    processedSlotIds.add(s.id);
    const startD = new Date(s.startTime);
    const endD = new Date(s.endTime);
    const startHour = startD.getHours();
    coveredHours.add(startHour);

    const timeSlotStr = `${startD.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - ${endD.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

    // Build reservation attendees
    const attendees = (s.reservations || []).map(r => {
      const sub = subscriptions.find(subItem => subItem.memberId === r.memberId);
      return {
        reservationId: r.reservationId,
        attendanceId: null,
        subscriptionId: sub ? sub.id : null,
        memberId: r.memberId,
        memberName: r.memberName,
        memberPhone: r.memberPhone,
        status: r.status, // "Confirmed", "CheckedIn", "Attended", "Cancelled", "Waitlisted"
        packageName: sub ? sub.packageName : 'Rezervasyon',
        remainingLessons: sub ? sub.remainingLessons : '-',
        completedLessons: sub ? sub.completedLessons : 0,
        totalLessons: sub ? sub.totalLessons : 0,
        memberNotes: sub ? sub.memberNotes : null,
        primaryTrainerId: sub ? sub.primaryTrainerId : null
      };
    });

    result.push({
      id: s.id,
      isVirtual: false,
      startTime: s.startTime,
      timeSlot: timeSlotStr,
      hour: startHour,
      title: s.title || (s.sessionType === 'PT' ? 'Özel Ders (PT)' : 'Fonksiyonel Grup Dersi'),
      sessionType: s.sessionType || 'GRUP',
      trainerName: s.trainerName || 'Eğitmen',
      trainerId: s.trainerId,
      capacity: s.capacity || 6,
      status: s.status || 'Scheduled',
      notes: s.notes || '',
      workoutTemplateId: s.workoutTemplateId,
      workoutTemplateName: s.workoutTemplateName,
      attendees: attendees
    });
  }

  // 2. Capacity Slots (AttendanceRecords not already in a SessionSlot)
  for (const cap of capacitySlots) {
    if (cap.totalMembers > 0 && !coveredHours.has(cap.hour)) {
      coveredHours.add(cap.hour);
      const capAttendees = (cap.members || []).map(m => {
        const sub = subscriptions.find(subItem => subItem.id === m.subscriptionId || subItem.memberId === m.memberId);
        return {
          reservationId: null,
          attendanceId: m.attendanceId,
          subscriptionId: m.subscriptionId,
          memberId: m.memberId,
          memberName: m.memberName,
          memberPhone: m.memberPhone,
          status: m.status, // "Scheduled", "Attended", "Missed", "Excused"
          packageName: m.packageName,
          remainingLessons: m.remainingLessons,
          completedLessons: sub ? sub.completedLessons : 0,
          totalLessons: sub ? sub.totalLessons : 0,
          memberNotes: sub ? sub.memberNotes : null,
          primaryTrainerId: m.trainerId || (sub ? sub.primaryTrainerId : null)
        };
      });

      result.push({
        id: `cap-${cap.hour}`,
        isVirtual: true,
        startTime: `${currentCapacityDate}T${String(cap.hour).padStart(2, '0')}:00:00`,
        timeSlot: `${cap.timeSlot} - ${String(cap.hour + 1).padStart(2, '0')}:00`,
        hour: cap.hour,
        title: `${cap.timeSlot} Stüdyo Dersi`,
        sessionType: 'GRUP',
        trainerName: cap.trainers && cap.trainers.length > 0 ? cap.trainers[0].trainerName : 'Nöbetçi Eğitmen',
        trainerId: cap.trainers && cap.trainers.length > 0 ? cap.trainers[0].trainerId : null,
        capacity: cap.capacityLimit || 6,
        status: 'Scheduled',
        notes: '',
        workoutTemplateId: null,
        workoutTemplateName: null,
        attendees: capAttendees
      });
    }
  }

  // Sort chronologically
  result.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  return result;
}

function renderSessionsAttendanceFeed(sessions) {
  const container = document.getElementById('attendance-sessions-feed');
  if (!container) return;

  const query = sessionSearchQuery.toLowerCase().trim();
  let filtered = sessions;

  if (query) {
    filtered = sessions.filter(s => {
      const matchTitle = (s.title || '').toLowerCase().includes(query);
      const matchTrainer = (s.trainerName || '').toLowerCase().includes(query);
      const matchNotes = (s.notes || '').toLowerCase().includes(query);
      const matchAttendees = (s.attendees || []).some(a => 
        (a.memberName || '').toLowerCase().includes(query) || 
        (a.packageName || '').toLowerCase().includes(query)
      );
      return matchTitle || matchTrainer || matchNotes || matchAttendees;
    });
  }

  if (filtered.length === 0) {
    const isYesterday = currentDayScope === 'yesterday';
    const dayLabel = isYesterday ? 'Dün' : 'Bugün';
    container.innerHTML = `
      <div class="glass-card" style="text-align:center; padding:44px 20px;">
        <div class="v0-guest-tiger-wrap" style="margin-bottom:12px;">
          <img src="/images/tiger2_badge.png?v=2.7.5" alt="" class="v0-guest-tiger-img">
        </div>
        <h3 style="font-size:18px; font-weight:800; color:var(--text-primary); margin-bottom:6px;">
          ${query ? 'Aramaya Uygun Seans Bulunamadı' : `${dayLabel} için Planlanmış Seans Yok`}
        </h3>
        <p style="color:var(--text-secondary); font-size:13px; max-width:320px; margin:0 auto 18px auto; line-height:1.4;">
          ${query ? 'Farklı bir isim veya hareket deneyebilirsiniz.' : 'Hemen yeni bir stüdyo seansı oluşturabilir veya plansız sporcu katılımı açabilirsiniz.'}
        </p>
        ${!query ? `
          <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
            <button type="button" class="btn-primary" onclick="openScheduleSessionModal()" style="padding:10px 20px; font-size:13px; font-weight:800;">
              <span>+</span> Seans Planla
            </button>
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(session => {
    const attendees = session.attendees || [];
    const attendedCount = attendees.filter(a => a.status === 'Attended' || a.status === 'CheckedIn').length;
    const totalCount = attendees.length;
    const isFull = totalCount >= session.capacity;
    const isFilling = totalCount >= 4 && !isFull;
    const dotColor = isFull ? 'var(--pulse-rose)' : (isFilling ? 'var(--flame-orange)' : 'var(--volt-lime)');

    // WOD Card rendering
    const hasWodNote = (session.notes && session.notes.trim().length > 0) || session.workoutTemplateName;
    const wodHtml = hasWodNote ? `
      <div class="session-wod-card">
        <div class="session-wod-header">
          <span style="display:flex; align-items:center; gap:5px;">
            <span>📝</span> GÜNÜN İDMANI & HAREKETLER (WOD)
            ${session.workoutTemplateName ? `<span class="lesson-badge badge-green" style="font-size:9.5px; padding:2px 6px;">🔥 ${escapeHtml(session.workoutTemplateName)}</span>` : ''}
          </span>
          <button type="button" class="btn-link" style="font-size:11px; color:var(--volt-lime); background:none; border:none; cursor:pointer; font-weight:700; text-decoration:underline;" onclick="openSessionWodNoteModal('${session.id}')">
            ✏️ Düzenle
          </button>
        </div>
        ${session.notes ? `<div class="session-wod-content">${escapeHtml(session.notes)}</div>` : ''}
      </div>
    ` : `
      <div class="session-wod-card" style="border-style:dotted; opacity:0.85;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:5px;">
            <span>📝</span> Günün idmanı veya hareketleri henüz girilmedi.
          </span>
          <button type="button" class="btn-sm btn-secondary" onclick="openSessionWodNoteModal('${session.id}')" style="height:30px; font-size:11px; padding:0 10px; font-weight:700; border-color:rgba(204,255,0,0.3); color:var(--volt-lime);">
            + Not & Hareket Yaz
          </button>
        </div>
      </div>
    `;

    // Attendees list rendering
    const attendeesHtml = attendees.length === 0 ? `
      <div style="padding:14px; text-align:center; background:rgba(255,255,255,0.02); border:1px dashed var(--border-subtle); border-radius:10px;">
        <span style="color:var(--text-muted); font-size:12px;">Bu seansa henüz kayıtlı sporcu yok.</span>
        <button type="button" class="btn-link" style="display:block; margin:6px auto 0 auto; font-size:12px; font-weight:800; color:var(--volt-lime); text-decoration:underline; background:none; border:none; cursor:pointer;" onclick="openAddMemberToSessionModal('${session.id}')">
          + Sporcu Ekle
        </button>
      </div>
    ` : attendees.map(a => {
      const isAttended = a.status === 'Attended' || a.status === 'CheckedIn';
      const isMissed = a.status === 'Missed';
      const isExcused = a.status === 'Excused';

      const cardStateClass = isAttended ? 'attended' : (isMissed ? 'missed' : (isExcused ? 'excused' : ''));

      return `
        <div class="session-attendee-card ${cardStateClass}">
          <div class="attendee-info-col">
            <div class="attendee-name" onclick="openStudentProgressDrawer(${a.memberId}, '${escapeJsString(a.memberName)}')" title="Gelişim profilini gör">
              <span>👤 ${escapeHtml(a.memberName)}</span>
              <span class="student-profile-link-icon" style="font-size:11px;">📈</span>
            </div>
            <div class="attendee-sub-meta">
              <span>${escapeHtml(a.packageName)}</span>
              ${a.remainingLessons !== '-' ? `<span>· <strong>${a.remainingLessons} Ders</strong></span>` : ''}
              ${a.memberNotes ? `<span style="color:var(--flame-orange); font-weight:700;" title="${escapeHtml(a.memberNotes)}">⚠️ ${escapeHtml(a.memberNotes)}</span>` : ''}
            </div>
          </div>

          <div class="attendee-actions-col">
            ${isAttended ? `
              <span class="lesson-badge badge-green" style="font-size:11px; padding:4px 8px;">✓ GELDİ</span>
              <button type="button" class="btn-quick-secondary" onclick="openAttendeeMicroNoteModal(${a.subscriptionId || 0}, ${a.reservationId || 0}, '${escapeJsString(a.memberName)}', ${a.memberId}, '${escapeJsString(a.memberNotes || '')}')" title="İdman notu yaz">
                <span>💬</span> Not
              </button>
              ${a.subscriptionId ? `
                <button type="button" class="btn-quick-secondary whatsapp" onclick="openWhatsAppModal(${a.subscriptionId})" title="WhatsApp">
                  <span>💬</span>
                </button>
              ` : ''}
            ` : isMissed ? `
              <span class="lesson-badge badge-red" style="font-size:11px; padding:4px 8px;">❌ GELMEDİ (YANDI)</span>
              ${a.subscriptionId ? `
                <button type="button" class="btn-quick-secondary whatsapp" onclick="openWhatsAppModal(${a.subscriptionId})" title="WhatsApp">
                  <span>💬</span>
                </button>
              ` : ''}
            ` : isExcused ? `
              <span class="lesson-badge badge-amber" style="font-size:11px; padding:4px 8px;">🕒 TELAFİ</span>
              ${a.subscriptionId ? `
                <button type="button" class="btn-quick-secondary whatsapp" onclick="openWhatsAppModal(${a.subscriptionId})" title="WhatsApp">
                  <span>💬</span>
                </button>
              ` : ''}
            ` : `
              <!-- 1-Tap Quick Attendance Button (Thumb-Zone Friendly) -->
              <button type="button" class="btn-quick-attend" onclick="handleQuickSessionAttendance(${a.reservationId || 'null'}, ${a.subscriptionId || 'null'}, '${escapeJsString(a.memberName)}', 'Attended', '${session.id}')" title="Bu sporcunun yoklamasını al (Ders düş)">
                <span>✓</span> Geldi
              </button>
              <button type="button" class="btn-quick-secondary" style="color:var(--pulse-rose);" onclick="handleQuickSessionAttendance(${a.reservationId || 'null'}, ${a.subscriptionId || 'null'}, '${escapeJsString(a.memberName)}', 'Missed', '${session.id}')" title="Habersiz gelmedi (Ders Yanar)">
                <span>❌</span>
              </button>
              <button type="button" class="btn-quick-secondary" style="color:var(--flame-orange);" onclick="handleQuickSessionAttendance(${a.reservationId || 'null'}, ${a.subscriptionId || 'null'}, '${escapeJsString(a.memberName)}', 'Excused', '${session.id}')" title="Mazeretli (Hak Saklı)">
                <span>🕒</span>
              </button>
              <button type="button" class="btn-quick-secondary" onclick="openAttendeeMicroNoteModal(${a.subscriptionId || 0}, ${a.reservationId || 0}, '${escapeJsString(a.memberName)}', ${a.memberId}, '${escapeJsString(a.memberNotes || '')}')" title="İdman notu yaz">
                <span>💬</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    const pendingAttendees = attendees.filter(a => a.status !== 'Attended' && a.status !== 'CheckedIn');
    const canCompleteAll = pendingAttendees.length > 0;

    return `
      <div class="session-feed-card" id="session-feed-${session.id}">
        <!-- Header -->
        <div class="session-feed-header">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div class="session-feed-time-badge">
              <span>🕒</span> ${escapeHtml(session.timeSlot)}
            </div>
            <div class="session-feed-meta">
              <div class="session-feed-title">
                ${escapeHtml(session.title)}
              </div>
              <div class="session-feed-trainer">
                <span>🏋️</span> ${escapeHtml(session.trainerName)}
                <span style="display:inline-block; width:4px; height:4px; border-radius:50%; background:var(--text-muted); margin:0 2px;"></span>
                <span style="color:${dotColor}; font-weight:800;">
                  <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${dotColor}; margin-right:3px;"></span>
                  ${totalCount}/${session.capacity} Kişi
                </span>
              </div>
            </div>
          </div>

          <!-- Top-Right Actions -->
          <div class="session-feed-actions">
            ${!session.isVirtual ? `
              <button type="button" class="btn-sm btn-secondary" onclick="openEditSessionModal(${session.id})" title="Seans Saat & Detaylarını Düzenle">
                <span>✏️</span> Düzenle
              </button>
            ` : ''}
            <button type="button" class="btn-sm btn-secondary" onclick="openAddMemberToSessionModal('${session.id}')" title="Plansız gelen sporcuyu bu seansa dahil et">
              <span>⚡</span> + Sporcu
            </button>
            ${canCompleteAll ? `
              <button type="button" class="btn-sm btn-primary" onclick="handleMarkAllSessionAttended('${session.id}')" title="Kayıtlı ${pendingAttendees.length} sporcunun yoklamasını 'Geldi' say">
                <span>✓</span> Tümünü Onayla
              </button>
            ` : `
              <span class="lesson-badge badge-green" style="font-size:11px; padding:6px 10px;">✓ Tamamlandı</span>
            `}
          </div>
        </div>

        <!-- WOD Notes Box -->
        ${wodHtml}

        <!-- Attendees Section -->
        <div>
          <div class="session-attendees-header">
            <span>KATILIMCI SPORCULAR (${attendees.length})</span>
            <span style="font-size:11px; font-weight:600; color:var(--text-muted);">${attendedCount} Geldi</span>
          </div>
          <div class="session-attendees-list" style="margin-top:8px;">
            ${attendeesHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterSessionAttendees(query) {
  sessionSearchQuery = query || '';
  renderSessionsAttendanceFeed(attendanceSessions);
}
window.filterSessionAttendees = filterSessionAttendees;

async function handleQuickSessionAttendance(resId, subId, memberName, status, sessionId) {
  try {
    let noteText = "Normal katılım";
    if (status === "Missed") noteText = "3 saat kuralı: Habersiz / geç iptal, hak yandı";
    else if (status === "Excused") noteText = "3 saat kuralı: En az 3 saat önce haber verildi, telafi hakkı";

    const session = attendanceSessions.find(s => String(s.id) === String(sessionId));

    if (resId && status === 'Attended') {
      await Api.checkInReservation(resId);
    } else if (subId) {
      await Api.markAttendance({
        subscriptionId: subId,
        trainerId: session ? session.trainerId : null,
        lessonDate: session ? session.startTime : null,
        status: status,
        notes: noteText
      });
    } else {
      showToast('Sporcu rezervasyon veya paket bilgisi bulunamadı.', 'warning');
      return;
    }

    if (status === 'Attended') {
      showToast(`⚡ ${memberName} yoklaması alındı!`, 'success');
    } else if (status === 'Missed') {
      showToast(`❌ ${memberName} gelmedi olarak işlendi (Ders hakkı düştü).`, 'warning');
    } else if (status === 'Excused') {
      showToast(`🕒 ${memberName} için mazeretli telafi işlendi (Ders hakkı saklı).`, 'warning');
    }

    await loadAttendanceView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
}
window.handleQuickSessionAttendance = handleQuickSessionAttendance;

async function handleMarkAllSessionAttended(sessionId) {
  const session = attendanceSessions.find(s => String(s.id) === String(sessionId));
  if (!session || !session.attendees || session.attendees.length === 0) {
    showToast('Bu seansta sporcu bulunmuyor.', 'info');
    return;
  }

  const pending = session.attendees.filter(a => a.status !== 'Attended' && a.status !== 'CheckedIn');
  if (pending.length === 0) {
    showToast('Tüm sporcular zaten katıldı olarak işlenmiş.', 'info');
    return;
  }

  const confirmed = confirm(`${session.timeSlot} seansındaki ${pending.length} sporcunun yoklaması 'Geldi' olarak onaylansın mı?`);
  if (!confirmed) return;

  try {
    showToast('⏳ Yoklamalar kaydediliyor...');
    let count = 0;
    for (const a of pending) {
      try {
        if (a.reservationId) {
          await Api.checkInReservation(a.reservationId);
          count++;
        } else if (a.subscriptionId) {
          await Api.markAttendance({
            subscriptionId: a.subscriptionId,
            trainerId: session.trainerId,
            lessonDate: session.startTime,
            status: 'Attended',
            notes: 'Toplu seans onayı'
          });
          count++;
        }
      } catch (itemErr) {
        console.warn(`Sporcu #${a.memberId} onaylanırken hata:`, itemErr);
      }
    }

    showToast(`✓ ${count} sporcunun yoklaması başarıyla tamamlandı!`, 'success');
    await loadAttendanceView();
  } catch (err) {
    showToast(`Toplu onaylama hatası: ${err.message}`, 'error');
  }
}
window.handleMarkAllSessionAttended = handleMarkAllSessionAttended;

function openSessionWodNoteModal(sessionId) {
  const session = attendanceSessions.find(s => String(s.id) === String(sessionId));
  if (!session) return;

  const idInput = document.getElementById('wod-note-session-id');
  const subtitleEl = document.getElementById('wod-note-session-subtitle');
  const textareaEl = document.getElementById('wod-note-textarea');
  const selectEl = document.getElementById('wod-note-template-select');

  if (idInput) idInput.value = session.id;
  if (subtitleEl) subtitleEl.innerText = `${session.title} (${session.timeSlot})`;
  if (textareaEl) textareaEl.value = session.notes || '';

  if (selectEl) {
    selectEl.innerHTML = '<option value="">— Serbest İdman / Şablon Seçilmedi —</option>' +
      workoutTemplatesCache.map(t => 
        `<option value="${t.id}" ${session.workoutTemplateId === t.id ? 'selected' : ''}>${escapeHtml(t.name)} (${escapeHtml(t.category || 'WOD')})</option>`
      ).join('');
  }

  openModal('modal-session-wod-note');
}
window.openSessionWodNoteModal = openSessionWodNoteModal;

function handleWodTemplateSelectChange(templateId) {
  if (!templateId) return;
  const tmpl = workoutTemplatesCache.find(t => String(t.id) === String(templateId));
  const textareaEl = document.getElementById('wod-note-textarea');
  if (tmpl && textareaEl) {
    let text = `🔥 ${tmpl.name}\n`;
    if (tmpl.description) text += `${tmpl.description}\n\n`;
    if (tmpl.exercises && tmpl.exercises.length > 0) {
      text += tmpl.exercises.map((e, idx) => 
        `${idx + 1}. ${e.exerciseName || e.name}: ${e.sets} Set x ${e.reps || e.targetReps} Tekrar${e.restSeconds ? ` (${e.restSeconds}sn dinlenme)` : ''}`
      ).join('\n');
    }
    textareaEl.value = text;
  }
}
window.handleWodTemplateSelectChange = handleWodTemplateSelectChange;

async function handleSaveSessionWodNote(e) {
  e.preventDefault();
  const sessionId = document.getElementById('wod-note-session-id').value;
  const notesText = document.getElementById('wod-note-textarea').value;
  const tmplSelect = document.getElementById('wod-note-template-select');
  const templateId = tmplSelect && tmplSelect.value ? parseInt(tmplSelect.value) : null;

  try {
    if (sessionId.startsWith('cap-')) {
      const session = attendanceSessions.find(s => String(s.id) === String(sessionId));
      if (session) {
        session.notes = notesText;
        session.workoutTemplateId = templateId;
      }
      showToast('📝 İdman notu kaydedildi!', 'success');
      closeModal('modal-session-wod-note');
      renderSessionsAttendanceFeed(attendanceSessions);
      return;
    }

    const slotId = parseInt(sessionId);
    await Api.updateSession(slotId, {
      notes: notesText,
      workoutTemplateId: templateId
    });

    showToast('📝 Seans günün idmanı ve hareketleri kaydedildi!', 'success');
    closeModal('modal-session-wod-note');
    await loadAttendanceView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
}
window.handleSaveSessionWodNote = handleSaveSessionWodNote;

function openAddMemberToSessionModal(sessionId) {
  const session = attendanceSessions.find(s => String(s.id) === String(sessionId));
  if (!session) return;

  const idInput = document.getElementById('add-attendee-session-id');
  const subtitleEl = document.getElementById('add-attendee-session-subtitle');
  const selectEl = document.getElementById('add-attendee-sub-select');

  if (idInput) idInput.value = session.id;
  if (subtitleEl) subtitleEl.innerText = `${session.title} (${session.timeSlot})`;

  // Filter out members already in this session
  const existingMemberIds = new Set((session.attendees || []).map(a => a.memberId));
  const availableSubs = activeSubscriptions.filter(s => !existingMemberIds.has(s.memberId));

  if (selectEl) {
    if (availableSubs.length === 0) {
      selectEl.innerHTML = '<option value="">Tüm aktif sporcular zaten bu seansta</option>';
    } else {
      selectEl.innerHTML = availableSubs.map(s => 
        `<option value="${s.id}" data-member-id="${s.memberId}">${escapeHtml(s.memberName)} — ${escapeHtml(s.packageName)} (${s.remainingLessons} Ders Kaldı)</option>`
      ).join('');
    }
  }

  openModal('modal-session-add-attendee');
}
window.openAddMemberToSessionModal = openAddMemberToSessionModal;

async function handleSaveAddMemberToSession(e) {
  e.preventDefault();
  const sessionId = document.getElementById('add-attendee-session-id').value;
  const subSelect = document.getElementById('add-attendee-sub-select');
  const autoCheckIn = document.getElementById('add-attendee-auto-checkin')?.checked ?? true;

  if (!subSelect || !subSelect.value) {
    showToast('Lütfen seansa eklenecek bir sporcu seçin.', 'warning');
    return;
  }

  const subId = parseInt(subSelect.value);
  const selectedOption = subSelect.options[subSelect.selectedIndex];
  const memberName = selectedOption ? selectedOption.text.split('—')[0].trim() : 'Sporcu';

  const session = attendanceSessions.find(s => String(s.id) === String(sessionId));
  const trainerId = session ? session.trainerId : null;
  const sessionTime = session ? session.startTime : `${currentCapacityDate}T18:00:00`;

  try {
    await Api.scheduleSession({
      subscriptionId: subId,
      trainerId: trainerId,
      sessionTime: sessionTime,
      notes: 'Hızlı seans katılımı (Walk-in)'
    });

    if (autoCheckIn) {
      await Api.markAttendance({
        subscriptionId: subId,
        trainerId: trainerId,
        status: 'Attended',
        notes: 'Hızlı seans girişi (Plansız katılım)'
      });
      showToast(`⚡ ${memberName} seansa eklendi ve yoklaması alındı!`, 'success');
    } else {
      showToast(`⚡ ${memberName} seansa dahil edildi!`, 'success');
    }

    closeModal('modal-session-add-attendee');
    await loadAttendanceView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
}
window.handleSaveAddMemberToSession = handleSaveAddMemberToSession;

function openAttendeeMicroNoteModal(subId, resId, memberName, memberId, currentNote) {
  const subIdInput = document.getElementById('attendee-note-sub-id');
  const resIdInput = document.getElementById('attendee-note-res-id');
  const subtitleEl = document.getElementById('attendee-note-modal-subtitle');
  const textareaEl = document.getElementById('attendee-note-textarea');

  if (subIdInput) subIdInput.value = subId || '';
  if (resIdInput) resIdInput.value = resId || '';
  if (subtitleEl) subtitleEl.innerText = `${memberName} · Ders & İdman Notu`;
  if (textareaEl) {
    textareaEl.value = currentNote || '';
    textareaEl.dataset.memberId = memberId || '';
    textareaEl.dataset.memberName = memberName || '';
  }

  openModal('modal-attendee-micro-note');
}
window.openAttendeeMicroNoteModal = openAttendeeMicroNoteModal;

async function handleSaveAttendeeMicroNote(e) {
  e.preventDefault();
  const textareaEl = document.getElementById('attendee-note-textarea');
  const noteText = textareaEl ? textareaEl.value.trim() : '';
  const memberId = textareaEl ? parseInt(textareaEl.dataset.memberId) : null;
  const memberName = textareaEl ? textareaEl.dataset.memberName : 'Sporcu';

  if (!memberId) {
    showToast('Sporcu ID bulunamadı.', 'warning');
    return;
  }

  try {
    await Api.updateMemberNotes(memberId, noteText);
    showToast(`💬 ${memberName} için idman notu kaydedildi!`, 'success');

    const sub = activeSubscriptions.find(s => s.memberId === memberId);
    if (sub) sub.memberNotes = noteText;

    closeModal('modal-attendee-micro-note');
    await loadAttendanceView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
}
window.handleSaveAttendeeMicroNote = handleSaveAttendeeMicroNote;


// Kapasite Çizelgesi (BR-03)
function renderCapacityWeekStrip() {
  const now = new Date();
  const todayIso = formatDateToIso(now);
  const curDate = new Date(currentCapacityDate + 'T00:00:00');

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

  const stripEl = document.getElementById('capacity-week-strip');
  if (!stripEl || stripEl.style.display === 'none') return;

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

  const now = new Date();
  const todayIso = formatDateToIso(now);
  const isToday = currentCapacityDate === todayIso;
  const currentHour = now.getHours();

  container.innerHTML = slots.map(slot => {
    const count = slot.totalMembers || 0;
    const cap = slot.capacityLimit || 6;
    const isFull = count >= cap;
    const isFilling = count >= 4 && !isFull;
    const isComfortable = count > 0 && count < 4;
    const isEmpty = count === 0;
    const isActive = selectedSlotHour === slot.hour;
    const isPast = isToday && slot.hour < currentHour;

    let dotColor = '#10B981';
    let dotText = 'Rahat';
    let pillBg = 'rgba(255, 255, 255, 0.03)';
    let pillBorder = 'rgba(255, 255, 255, 0.08)';

    if (isFull) {
      dotColor = '#EF4444';
      dotText = 'Dolu';
      pillBg = 'rgba(239, 68, 68, 0.12)';
      pillBorder = 'rgba(239, 68, 68, 0.3)';
    } else if (isFilling) {
      dotColor = '#F59E0B';
      dotText = 'Doluyor';
      pillBg = 'rgba(245, 158, 11, 0.12)';
      pillBorder = 'rgba(245, 158, 11, 0.3)';
    } else if (isComfortable) {
      dotColor = '#10B981';
      dotText = `${count} Kişi`;
      pillBg = 'rgba(16, 185, 129, 0.09)';
      pillBorder = 'rgba(16, 185, 129, 0.25)';
    } else if (isEmpty) {
      dotColor = 'var(--text-muted)';
      dotText = 'Boş';
    }

    let trainerShort = '';
    if (slot.trainers && slot.trainers.length > 0) {
      trainerShort = slot.trainers.map(t => `${t.trainerName.split(' ')[0]}:${t.memberCount}`).join(' ');
    }

    const activeStyles = isActive
      ? 'background:rgba(204,255,0,0.18) !important; border-color:#CCFF00 !important; box-shadow:0 0 12px rgba(204,255,0,0.28); transform:translateY(-1px);'
      : '';

    return `
      <button type="button"
              class="capacity-slot-pill ${isActive ? 'active' : ''}"
              onclick="selectSlotHour(${slot.hour})"
              style="flex:0 0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:7px 11px; border-radius:12px; background:${pillBg}; border:1px solid ${pillBorder}; cursor:pointer; min-width:72px; transition:all 0.2s ease; ${isPast ? 'opacity:0.55;' : ''} ${activeStyles}"
              title="${slot.timeSlot} - ${count}/${cap} kişi ${trainerShort ? '(' + trainerShort + ')' : ''}">
        <span style="font-size:12px; font-weight:800; color:var(--text-primary); letter-spacing:0.02em;">${slot.timeSlot.split(' ')[0]}</span>
        <span style="font-size:11px; font-weight:700; color:${count > 0 ? dotColor : 'var(--text-muted)'};">${count}/${cap}</span>
        <span style="font-size:9.5px; font-weight:700; color:${dotColor}; display:inline-flex; align-items:center; gap:3px;">
          <span style="width:5px; height:5px; border-radius:50%; background:${dotColor};"></span>
          ${dotText}
        </span>
        ${trainerShort ? `<span style="font-size:8.5px; color:var(--text-muted); max-width:64px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:1px;">${escapeHtml(trainerShort)}</span>` : ''}
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
    const isFull = slot.totalMembers >= slot.capacityLimit;
    const isFilling = slot.totalMembers >= 4 && !isFull;
    
    const statusPill = isFull
      ? `<span style="background:rgba(239,68,68,0.18); color:#ef4444; border:1px solid rgba(239,68,68,0.35); font-weight:800; font-size:11px; padding:2px 8px; border-radius:999px;">🔴 DOLU (${slot.totalMembers}/${slot.capacityLimit}) - Çakışma Riski</span>`
      : isFilling
      ? `<span style="background:rgba(245,158,11,0.18); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); font-weight:800; font-size:11px; padding:2px 8px; border-radius:999px;">🟡 DOLUYOR (${slot.totalMembers}/${slot.capacityLimit}) - ${slot.capacityLimit - slot.totalMembers} Boş Yer</span>`
      : `<span style="background:rgba(204,255,0,0.14); color:var(--volt-lime); border:1px solid rgba(204,255,0,0.3); font-weight:800; font-size:11px; padding:2px 8px; border-radius:999px;">🟢 RAHAT (${slot.totalMembers}/${slot.capacityLimit}) - ${slot.capacityLimit - slot.totalMembers} Boş Yer</span>`;

    let trainersBreakdown = '';
    if (slot.trainers && slot.trainers.length > 0) {
      trainersBreakdown = slot.trainers.map(t => {
        const names = t.memberNames && t.memberNames.length > 0 ? ` (${escapeHtml(t.memberNames.join(', '))})` : '';
        return `<span style="display:inline-flex; align-items:center; gap:4px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); padding:3px 8px; border-radius:6px; font-size:11.5px; color:var(--text-primary);">🏋️ <strong>${escapeHtml(t.trainerName)}:</strong> ${t.memberCount} sporcu${names}</span>`;
      }).join(' ');
    }

    detailsText.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong>Saat ${slot.timeSlot}:</strong>
          ${statusPill}
        </div>
        ${trainersBreakdown ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:2px;">${trainersBreakdown}</div>` : `<span style="color:var(--text-muted); font-size:12px;">Henüz bu saatte kayıtlı sporcu yok.</span>`}
      </div>
    `;

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

  const countLabel = document.getElementById('attendance-count-label');
  if (countLabel) {
    countLabel.innerText = `Kayıtlı Sporcular (${subs.length})`;
  }

  container.innerHTML = subs.map(sub => {
    const isCritical = sub.remainingLessons <= 1;
    const isExpiring = sub.remainingLessons === 2;
    // User requested cards start collapsed by default
    const cardClass = (isCritical ? 'attendee-card critical' : (isExpiring ? 'attendee-card expiring' : 'attendee-card')) + ' collapsed';

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
    let statusDotClass = 'status-pending';
    let statusSummaryBadge = `<span class="lesson-badge ${badgeColor}">${sub.remainingLessons} DERS KALDI</span>`;
    if (attendanceStatus === 'Attended') {
      statusDotClass = 'status-attended';
      statusSummaryBadge = `<span class="lesson-badge badge-green" style="font-size:10.5px;">✓ GELDİ</span>`;
    } else if (attendanceStatus === 'Missed') {
      statusDotClass = 'status-missed';
      statusSummaryBadge = `<span class="lesson-badge badge-red" style="font-size:10.5px;">❌ GELMEDİ</span>`;
    } else if (attendanceStatus === 'Excused') {
      statusDotClass = 'status-excused';
      statusSummaryBadge = `<span class="lesson-badge badge-amber" style="font-size:10.5px;">🕒 TELAFİ</span>`;
    }

    return `
      <div class="${cardClass}" id="sub-card-${sub.id}">
        <!-- 1. Compact Clickable Header Summary (Always Visible) -->
        <div class="attendee-card-summary" onclick="toggleAttendeeCard(${sub.id})" title="Detayları aç / daralt">
          <div class="attendee-summary-left">
            <span class="attendee-status-indicator ${statusDotClass}"></span>
            <div class="attendee-summary-names">
              <div class="member-name clickable-name" onclick="event.stopPropagation(); openStudentProgressDrawer(${sub.memberId}, '${escapeJsString(sub.memberName)}')" title="Öğrencinin gelişimini ve ölçümlerini gör">
                ${escapeHtml(sub.memberName)} <span class="student-profile-link-icon" title="Gelişim Çizelgesi">📈</span>
              </div>
              <div class="package-name">${escapeHtml(sub.packageName)}</div>
            </div>
          </div>
          <div class="attendee-summary-right">
            ${(sub.memberMedicalConditions || sub.memberNotes) ? `<span class="summary-injury-badge" title="${escapeHtml(sub.memberMedicalConditions ? ('⚠️ ' + sub.memberMedicalConditions) : (sub.memberNotes || ''))}">⚠️</span>` : ''}
            ${statusSummaryBadge}
            <span class="attendee-chevron" id="chevron-${sub.id}">▼</span>
          </div>
        </div>

        <!-- 2. Collapsible Details Body (Hidden by default when .collapsed) -->
        <div class="attendee-card-details" id="card-details-${sub.id}">
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

          <div class="v0-injury-badge-wrap ${(sub.memberMedicalConditions || sub.memberNotes) ? '' : 'no-notes'}">
            <div class="v0-injury-badge-content" title="${escapeHtml(sub.memberMedicalConditions || sub.memberNotes || 'Sağlık / Sakatlık notu yok')}">
              <span>${sub.memberMedicalConditions ? '⚠️' : (sub.memberNotes ? '📝' : '🩺')}</span>
              <span class="v0-injury-badge-text">${escapeHtml(sub.memberMedicalConditions ? ('⚠️ ' + sub.memberMedicalConditions) : (sub.memberNotes || 'Sağlık / Sakatlık notu yok'))}</span>
            </div>
            <button type="button" class="v0-injury-edit-btn" onclick="openEditMemberNotesModal(${sub.memberId}, '${escapeHtml(sub.memberName)}', '${escapeJsString(sub.memberMedicalConditions || sub.memberNotes || '')}')" title="Sporcunun sakatlık/sağlık kısıtını düzenle">
              <span>✏️</span> ${(sub.memberMedicalConditions || sub.memberNotes) ? 'Düzenle' : 'Not Ekle'}
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
            <div style="display:flex; align-items:center; gap:8px;">
              <button type="button" class="btn-link" style="font-size:11.5px; color:var(--volt-lime); background:none; border:none; padding:0; cursor:pointer; font-weight:700; text-decoration:underline;" onclick="openStudentProgressDrawer(${sub.memberId}, '${escapeJsString(sub.memberName)}')">
                📈 Gelişimi Gör
              </button>
              ${sub.remainingBalance > 0 
                ? `<span style="color:var(--flame-orange); font-weight:800;">Kalan: ${formatMoney(sub.remainingBalance)}</span>` 
                : '<span style="color:var(--volt-lime); font-weight:700;">Ödendi ✓</span>'}
            </div>
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
              <div class="attendee-actions-secondary">
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
      </div>
    `;
  }).join('');
}

window.toggleAttendeeCard = function(subId) {
  const card = document.getElementById(`sub-card-${subId}`);
  if (!card) return;
  card.classList.toggle('collapsed');
  const chev = document.getElementById(`chevron-${subId}`);
  if (chev) {
    chev.innerText = card.classList.contains('collapsed') ? '▼' : '▲';
  }
};

window.toggleAllAttendanceCards = function() {
  const cards = document.querySelectorAll('.attendance-grid .attendee-card');
  if (cards.length === 0) return;
  const anyCollapsed = Array.from(cards).some(c => c.classList.contains('collapsed'));
  cards.forEach(c => {
    c.classList.toggle('collapsed', !anyCollapsed);
    const subId = c.id.replace('sub-card-', '');
    const chev = document.getElementById(`chevron-${subId}`);
    if (chev) chev.innerText = anyCollapsed ? '▲' : '▼';
  });
  const btn = document.getElementById('btn-toggle-all-cards');
  if (btn) btn.innerHTML = anyCollapsed ? '<span>↕️</span> Tümünü Kapat' : '<span>↕️</span> Tümünü Aç';
};

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

// ==================== 2. DASHBOARD (SALON MASASI YÖNETİMİ) ====================
function switchDashboardSubTab(subTab) {
  const tabs = ['finance', 'payroll', 'members'];
  tabs.forEach(t => {
    const btn = document.getElementById(`dash-tab-btn-${t}`);
    const view = document.getElementById(`dash-subview-${t}`);
    if (btn) btn.classList.toggle('active', t === subTab);
    if (view) view.style.display = t === subTab ? 'block' : 'none';
  });

  if (subTab === 'payroll') {
    loadKasaView();
  } else if (subTab === 'members') {
    loadMembersView();
  } else if (subTab === 'finance') {
    loadDashboardView();
  }
};

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
    let subBadge = `<span style="color:var(--text-muted); font-size:12px;">Aktif Paket Yok</span>`;
    if (sub) {
      if (sub.status === 'Frozen') {
        subBadge = `<span class="lesson-badge badge-cyan" style="background:rgba(56,189,248,0.15); color:#38BDF8; border:1px solid rgba(56,189,248,0.3);">❄️ Donduruldu (${escapeHtml(sub.packageName)})</span>`;
      } else {
        subBadge = `<span class="lesson-badge badge-green">${escapeHtml(sub.packageName)} (${sub.remainingLessons} Ders Kaldı)</span>`;
      }
    }

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
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-primary" style="padding:7px 14px; font-size:12px;" onclick="openNewSubModalForMember(${m.id}, '${escapeHtml(m.fullName)}')">
              + Paket Sat
            </button>
            <button class="btn-secondary" style="padding:7px 12px; font-size:12px; color:var(--volt-lime); border-color:rgba(204,255,0,0.3);" onclick="openTemplateBuilderForMember(${m.id}, '${escapeJsString(m.fullName)}')">
              🏋️ Program Yaz
            </button>
            <button class="btn-secondary" style="padding:7px 12px; font-size:12px;" onclick="openEditMemberModal(${m.id})">
              ✏️ Düzenle
            </button>
            ${sub && sub.status === 'Frozen' ? `
              <button class="btn-secondary" style="padding:7px 12px; font-size:12px; color:#38BDF8; border-color:rgba(56,189,248,0.4);" onclick="handleStaffUnfreezeSub(${sub.id}, '${escapeJsString(m.fullName)}')">
                ☀️ Çöz
              </button>
            ` : (sub && sub.status === 'Active' ? `
              <button class="btn-secondary" style="padding:7px 12px; font-size:12px; color:#38BDF8; border-color:rgba(56,189,248,0.3);" onclick="openFreezeModal(${sub.id}, '${escapeJsString(m.fullName)}', '${escapeJsString(sub.packageName)}')">
                ❄️ Dondur
              </button>
            ` : '')}
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

// ==================== 3. ÜYELER & ÖĞRENCİLERİM GELİŞİM HUB ====================
async function loadMembersView(search = '') {
  const container = document.getElementById('members-table-body');
  const cardsContainer = document.getElementById('student-cards-grid');

  // SWR Pattern: Arama yapılmıyorsa ve hafızada üye listesi varsa anında göster (0ms)
  if (!search && allMembers && allMembers.length > 0) {
    if (container) renderMembersTable(allMembers, container);
    if (cardsContainer) renderStudentCards(allMembers, cardsContainer);
  } else if (!allMembers || allMembers.length === 0 || search) {
    if (container) container.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Yükleniyor...</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '<div style="color:var(--text-muted); padding:32px; text-align:center;">Öğrenci listesi yükleniyor...</div>';
  }

  try {
    allMembers = await Api.getMembers(search);
    if (container) renderMembersTable(allMembers, container);
    if (cardsContainer) renderStudentCards(allMembers, cardsContainer);
  } catch (err) {
    if (!allMembers || allMembers.length === 0) {
      if (container) container.innerHTML = `<tr><td colspan="6" style="color:var(--pulse-rose);">Hata: ${err.message}</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = `<div style="color:var(--pulse-rose); padding:24px; text-align:center;">Hata: ${err.message}</div>`;
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

function renderStudentCards(members, container) {
  if (!container) return;
  if (!members || members.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--text-muted); padding:40px 16px; background:var(--bg-surface); border-radius:16px; border:1px dashed var(--border-subtle);">
        <div style="font-size:28px; margin-bottom:8px;">👥</div>
        <div style="font-weight:700; font-size:14px; color:var(--text-secondary);">Kayıtlı Öğrenci Bulunamadı</div>
        <div style="font-size:12px; margin-top:4px;">Arama kriterini değiştirin veya yeni sporcu ekleyin.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = members.map(m => {
    const sub = m.activeSubscription;
    const initials = getAthleteInitials(m.fullName);
    let subStatusBadge = `<span style="font-size:11.5px; color:var(--text-muted);">Aktif Paket Yok</span>`;
    let remainingText = '';
    if (sub) {
      if (sub.status === 'Frozen') {
        subStatusBadge = `<span class="lesson-badge badge-cyan" style="font-size:11px; background:rgba(56,189,248,0.15); color:#38BDF8; border:1px solid rgba(56,189,248,0.3);">❄️ Donduruldu</span>`;
      } else {
        const isCritical = sub.remainingLessons <= 1;
        const isExpiring = sub.remainingLessons === 2;
        const colorClass = isCritical ? 'badge-red' : (isExpiring ? 'badge-amber' : 'badge-green');
        subStatusBadge = `<span class="lesson-badge ${colorClass}" style="font-size:11px;">⚡ ${escapeHtml(sub.packageName)}</span>`;
        remainingText = `<strong style="color:${isCritical ? 'var(--pulse-rose)' : 'var(--volt-lime)'}; font-size:12px;">${sub.remainingLessons} Ders Kaldı</strong>`;
      }
    }

    const hasMedical = !!(m.medicalConditions);

    return `
      <div class="student-card" id="student-card-${m.id}">
        <div class="student-card-header">
          <div class="student-card-identity">
            <div class="student-avatar">${escapeHtml(initials)}</div>
            <div class="student-meta">
              <div class="student-name">${escapeHtml(m.fullName)}</div>
              <div class="student-phone">
                <span>📞</span> ${m.phone ? escapeHtml(m.phone) : '-'}
              </div>
            </div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            ${subStatusBadge}
            ${remainingText}
          </div>
        </div>

        ${hasMedical ? `
          <div style="font-size:11.5px; font-weight:700; color:#FF453A; background:rgba(255,69,58,0.12); padding:5px 10px; border-radius:8px; border:1px solid rgba(255,69,58,0.25); display:flex; align-items:flex-start; gap:6px;">
            <span style="flex-shrink:0;">⚠️</span> <span style="line-height:1.35;">${escapeHtml(m.medicalConditions)}</span>
          </div>
        ` : ''}

        ${m.notes ? `
          <div style="font-size:11.5px; color:var(--text-secondary); background:var(--bg-surface-elevated); padding:5px 10px; border-radius:8px; display:flex; align-items:flex-start; gap:6px; border:1px solid var(--border-subtle);">
            <span style="flex-shrink:0;">📝</span> <span style="line-height:1.35;">${escapeHtml(m.notes)}</span>
          </div>
        ` : ''}

        <div class="student-card-actions">
          <button type="button" class="btn-primary btn-sm" onclick="openStudentProgressDrawer(${m.id}, '${escapeJsString(m.fullName)}')">
            <span>📈</span> Gelişim & Tartı
          </button>
          <button type="button" class="btn-secondary btn-sm" style="color:var(--volt-lime); border-color:rgba(204,255,0,0.3);" onclick="openTemplateBuilderForMember(${m.id}, '${escapeJsString(m.fullName)}')">
            <span>🏋️</span> Program Yaz
          </button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid var(--border-subtle); font-size:11.5px;">
          <span style="color:var(--text-muted);">${m.totalSubscriptionsCount || 1}. Sezon / Dönem</span>
          <div style="display:flex; gap:8px;">
            ${m.phone ? `
              <button type="button" class="btn-link" style="color:#25D366; background:none; border:none; padding:0; cursor:pointer; font-size:11.5px; font-weight:700;" onclick="window.open('https://wa.me/${encodeURIComponent(m.phone.replace(/[^0-9]/g, ''))}', '_blank')">
                💬 WhatsApp
              </button>
            ` : ''}
            <button type="button" class="btn-link" style="color:var(--text-secondary); background:none; border:none; padding:0; cursor:pointer; font-size:11.5px;" onclick="openEditMemberModal(${m.id})">
              ✏️ Düzenle
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterStudentsList(filterType) {
  document.querySelectorAll('[data-student-filter]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.studentFilter === filterType);
  });

  if (!allMembers) return;

  let filtered = allMembers;
  if (filterType === 'active') {
    filtered = allMembers.filter(m => m.activeSubscription && m.activeSubscription.status === 'Active' && m.activeSubscription.remainingLessons > 0);
  } else if (filterType === 'expiring') {
    filtered = allMembers.filter(m => m.activeSubscription && m.activeSubscription.remainingLessons <= 2 && m.activeSubscription.remainingLessons > 0);
  } else if (filterType === 'medical') {
    filtered = allMembers.filter(m => !!(m.medicalConditions || m.notes));
  }

  const grid = document.getElementById('student-cards-grid');
  if (grid) renderStudentCards(filtered, grid);
  const table = document.getElementById('members-table-body');
  if (table) renderMembersTable(filtered, table);
}

async function openStudentProgressDrawer(memberId, memberName) {
  const nameEl = document.getElementById('student-progress-name');
  const avatarEl = document.getElementById('student-progress-avatar');
  const subBadgeEl = document.getElementById('student-progress-sub-badge');
  const injuryBox = document.getElementById('student-progress-injury-box');
  const injuryText = document.getElementById('student-progress-injury-text');
  const chartContainer = document.getElementById('student-progress-chart-container');
  const historySection = document.getElementById('student-metrics-history-section');
  const btnWeighIn = document.getElementById('btn-open-student-weighin');
  const btnWaShare = document.getElementById('btn-student-wa-share');
  const btnEditInjury = document.getElementById('btn-edit-student-injury');

  if (nameEl) nameEl.textContent = memberName;
  if (avatarEl) avatarEl.textContent = getAthleteInitials(memberName);
  if (subBadgeEl) subBadgeEl.textContent = 'Veriler yükleniyor...';
  if (chartContainer) chartContainer.innerHTML = '<div style="color:var(--text-muted); padding:30px; text-align:center;">Ölçüm geçmişi yükleniyor...</div>';
  if (historySection) historySection.innerHTML = '<div style="color:var(--text-muted); padding:16px; text-align:center; font-size:12px;">Ölçüm geçmişi yükleniyor...</div>';

  if (btnWeighIn) {
    btnWeighIn.onclick = () => openAddStudentMetricModal(memberId, memberName);
  }

  // Open modal early for snappy UX
  openModal('modal-student-progress');

  try {
    const [progress, member] = await Promise.all([
      Api.getMemberMetricProgress(memberId),
      Api.getMember(memberId).catch(() => null)
    ]);

    if (member && subBadgeEl) {
      const activeSub = member.activeSubscription;
      if (activeSub) {
        subBadgeEl.textContent = `${activeSub.packageName} · ${activeSub.remainingLessons}/${activeSub.totalLessons} Ders Kaldı`;
      } else {
        subBadgeEl.textContent = 'Aktif Paket Yok';
      }

      // Injury / Medical condition alert box
      const medNotes = member.medicalConditions || member.notes;
      if (medNotes) {
        if (injuryBox) injuryBox.style.display = 'block';
        if (injuryText) injuryText.textContent = medNotes;
        if (btnEditInjury) {
          btnEditInjury.onclick = () => openEditMemberNotesModal(memberId, memberName, medNotes);
        }
      } else {
        if (injuryBox) injuryBox.style.display = 'none';
      }

      // WhatsApp Share button
      if (btnWaShare) {
        if (member.phone) {
          btnWaShare.style.display = 'inline-flex';
          btnWaShare.onclick = () => {
            const currentKg = progress?.currentWeightKg ? `${progress.currentWeightKg} kg` : '-';
            const changeKg = progress?.totalChangeKg != null ? (progress.totalChangeKg > 0 ? '+' : '') + progress.totalChangeKg + ' kg' : '-';
            const text = encodeURIComponent(`Merhaba ${memberName},\nSporTakip gelişim özetin:\nGüncel Kilo: ${currentKg}\nToplam Değişim: ${changeKg}\nHarika gidiyorsun! 💪`);
            window.open(`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
          };
        } else {
          btnWaShare.style.display = 'none';
        }
      }
    }

    // KPIs
    const startW = document.getElementById('student-kpi-start-weight');
    const currW = document.getElementById('student-kpi-current-weight');
    const diffW = document.getElementById('student-kpi-diff-weight');
    const bmiW = document.getElementById('student-kpi-bmi');

    if (startW) startW.textContent = progress?.startingWeightKg ? `${progress.startingWeightKg} kg` : '-';
    if (currW) currW.textContent = progress?.currentWeightKg ? `${progress.currentWeightKg} kg` : '-';

    if (diffW) {
      if (progress?.totalChangeKg != null) {
        const sign = progress.totalChangeKg > 0 ? '+' : '';
        diffW.textContent = `${sign}${progress.totalChangeKg} kg`;
        diffW.style.color = progress.totalChangeKg <= 0 ? 'var(--volt-lime)' : 'var(--flame-orange)';
      } else {
        diffW.textContent = '-';
        diffW.style.color = 'var(--text-primary)';
      }
    }

    if (bmiW) {
      if (progress?.bmi) {
        bmiW.innerHTML = `${Number(progress.bmi).toFixed(1)} <span style="font-size:9.5px; color:var(--text-muted); font-weight:600;">(${escapeHtml(progress.bmiCategory || '')})</span>`;
      } else {
        bmiW.textContent = '-';
      }
    }

    // Chart
    const history = progress?.history || [];

    if (history.length >= 2) {
      renderStudentProgressChart(history, chartContainer);
    } else if (history.length === 1) {
      chartContainer.innerHTML = `
        <div style="padding:20px; text-align:center; background:rgba(0,0,0,0.25); border-radius:12px; border:1px solid var(--border-subtle);">
          <div style="font-size:24px; margin-bottom:6px;">⚖️</div>
          <div style="font-size:13.5px; font-weight:700; color:var(--text-primary);">İlk Ölçüm: ${history[0].weightKg} kg</div>
          <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Trend grafiği çizmek için en az 2 ölçüm gereklidir.</div>
        </div>
      `;
    } else {
      chartContainer.innerHTML = `
        <div style="padding:24px; text-align:center; background:rgba(0,0,0,0.25); border-radius:12px; border:1px dashed var(--border-subtle);">
          <div style="font-size:24px; margin-bottom:6px;">📊</div>
          <div style="font-size:13px; font-weight:700; color:var(--text-muted);">Henüz kilo / tartı kaydı bulunmuyor.</div>
          <button type="button" class="btn-primary" style="margin-top:10px; font-size:12px; padding:6px 14px; border-radius:8px;" onclick="openAddStudentMetricModal(${memberId}, '${escapeJsString(memberName)}')">
            + İlk Tartıyı Ekle
          </button>
        </div>
      `;
    }

    // Render Collapsible & Paginated History Section
    renderStudentMetricsHistory(history, memberId, memberName);

  } catch (err) {
    if (chartContainer) chartContainer.innerHTML = `<div style="color:var(--pulse-rose); padding:16px;">Gelişim verisi alınamadı: ${err.message}</div>`;
  }
}

function renderStudentProgressChart(logs, chartCard) {
  if (!chartCard || !logs || logs.length < 2) return;

  const w = 480;
  const h = 180;
  const padL = 38;
  const padR = 25;
  const padT = 24;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const sorted = [...logs].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const weights = sorted.map(l => Number(l.weightKg));
  const minW = Math.min(...weights) - 0.5;
  const maxW = Math.max(...weights) + 0.5;
  const range = (maxW - minW) || 1;

  const points = sorted.map((l, i) => {
    const x = padL + (i / (sorted.length - 1)) * plotW;
    const y = padT + ((maxW - Number(l.weightKg)) / range) * plotH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, log: l };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${h - padB} L ${points[0].x} ${h - padB} Z`;

  const firstDate = new Date(sorted[0].recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const lastDate = new Date(sorted[sorted.length - 1].recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

  const dotsSvg = points.map(p => {
    const dStr = new Date(p.log.recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    const tipText = `${dStr}: ${Number(p.log.weightKg).toFixed(1)} kg${p.log.notes ? ` (${p.log.notes})` : ''}`;
    return `
      <g class="chart-point" style="cursor:pointer;" onclick="showToast('${escapeJsString(tipText)}')">
        <circle cx="${p.x}" cy="${p.y}" r="6" fill="#0E0E12" stroke="#CCFF00" stroke-width="2.5" />
        <circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#CCFF00" />
        <title>${escapeHtml(tipText)}</title>
      </g>
    `;
  }).join('');

  chartCard.innerHTML = `
    <div style="position:relative; width:100%; overflow:hidden; border-radius:12px; background:rgba(0,0,0,0.28); border:1px solid var(--border-subtle); padding:10px 8px 6px 8px; box-sizing:border-box;">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="student-progress-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#CCFF00" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#CCFF00" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
        <line x1="${padL}" y1="${padT + plotH / 2}" x2="${w - padR}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
        <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(255,255,255,0.12)" />

        <text x="${padL - 6}" y="${padT + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(maxW)}k</text>
        <text x="${padL - 6}" y="${h - padB + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(minW)}k</text>

        <path d="${areaD}" fill="url(#student-progress-area-grad)" />
        <path d="${pathD}" fill="none" stroke="#CCFF00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        ${dotsSvg}

        <text x="${padL}" y="${h - 10}" fill="var(--text-muted)" font-size="10" font-weight="600">${firstDate}</text>
        <text x="${w - padR}" y="${h - 10}" fill="var(--text-muted)" font-size="10" text-anchor="end" font-weight="600">${lastDate}</text>
      </svg>
    </div>
  `;
}

function openAddStudentMetricModal(memberId, memberName) {
  document.getElementById('add-log-member-id').value = memberId;
  const nameEl = document.getElementById('add-student-log-member-name');
  if (nameEl) nameEl.textContent = memberName;
  document.getElementById('add-log-weight').value = '';
  document.getElementById('add-log-bodyfat').value = '';
  document.getElementById('add-log-muscle').value = '';
  document.getElementById('add-log-notes').value = '';
  document.getElementById('add-log-date').value = new Date().toISOString().split('T')[0];
  openModal('modal-add-student-log');
}

async function handleSaveStudentMetricLog(e) {
  e.preventDefault();
  const memberId = document.getElementById('add-log-member-id').value;
  const weight = parseFloat(document.getElementById('add-log-weight').value);
  const bodyFat = document.getElementById('add-log-bodyfat').value ? parseFloat(document.getElementById('add-log-bodyfat').value) : null;
  const muscle = document.getElementById('add-log-muscle').value ? parseFloat(document.getElementById('add-log-muscle').value) : null;
  const dateStr = document.getElementById('add-log-date').value;
  const notes = document.getElementById('add-log-notes').value.trim() || null;

  if (!memberId || isNaN(weight)) {
    showToast('Lütfen geçerli bir kilo değeri girin.', 'error');
    return;
  }

  try {
    await Api.addMemberMetricLog(memberId, {
      weightKg: weight,
      bodyFatPercentage: bodyFat,
      muscleMassKg: muscle,
      recordedAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      notes: notes
    });

    showToast('Ölçüm ve tartı kaydı başarıyla eklendi! ⚖️', 'success');
    closeModal('modal-add-student-log');

    // If student progress drawer is open, refresh it!
    const memberName = document.getElementById('add-student-log-member-name')?.textContent || '';
    if (document.getElementById('modal-student-progress')?.classList.contains('open')) {
      openStudentProgressDrawer(memberId, memberName);
    }
  } catch (err) {
    showToast(`Ölçüm kaydedilemedi: ${err.message}`, 'error');
  }
}


// ==================== STUDENT METRICS HISTORY (COLLAPSIBLE & PAGINATED) ====================
let cachedStudentMetricLogs = [];
let cachedStudentMemberId = null;
let cachedStudentMemberName = '';
let currentStudentMetricPage = 1;
let isStudentMetricsHistoryOpen = false;
const STUDENT_METRIC_PAGE_SIZE = 3;

function toggleStudentMetricsHistory() {
  isStudentMetricsHistoryOpen = !isStudentMetricsHistoryOpen;
  renderStudentMetricsHistory(cachedStudentMetricLogs, cachedStudentMemberId, cachedStudentMemberName);
}

function changeStudentMetricPage(newPage) {
  currentStudentMetricPage = newPage;
  renderStudentMetricsHistory(cachedStudentMetricLogs, cachedStudentMemberId, cachedStudentMemberName);
}

async function handleDeleteStudentMetric(memberId, logId) {
  if (!confirm('Bu tartı kaydını silmek istediğinizden emin misiniz?')) return;
  try {
    await Api.deleteMemberMetricLog(memberId, logId);
    showToast('Ölçüm kaydı silindi.', 'info');
    openStudentProgressDrawer(memberId, cachedStudentMemberName);
  } catch (err) {
    showToast(`Kayıt silinemedi: ${err.message}`, 'error');
  }
}

function renderStudentMetricsHistory(logs, memberId, memberName) {
  cachedStudentMetricLogs = logs || [];
  cachedStudentMemberId = memberId;
  if (memberName) cachedStudentMemberName = memberName;

  const historyCard = document.getElementById('student-metrics-history-section');
  if (!historyCard) return;

  const totalItems = cachedStudentMetricLogs.length;
  if (totalItems === 0) {
    historyCard.innerHTML = `
      <div style="padding:14px 12px; background:rgba(0,0,0,0.22); border-radius:12px; border:1px dashed var(--border-subtle); text-align:center;">
        <span style="font-size:12px; color:var(--text-muted);">Henüz ölçüm & tartı kaydı bulunmuyor.</span>
      </div>
    `;
    return;
  }

  // Sorted reverse chronological (newest first)
  const sorted = [...cachedStudentMetricLogs].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  const totalPages = Math.max(1, Math.ceil(totalItems / STUDENT_METRIC_PAGE_SIZE));
  if (currentStudentMetricPage > totalPages) currentStudentMetricPage = totalPages;
  if (currentStudentMetricPage < 1) currentStudentMetricPage = 1;

  const startIdx = (currentStudentMetricPage - 1) * STUDENT_METRIC_PAGE_SIZE;
  const pageItems = sorted.slice(startIdx, startIdx + STUDENT_METRIC_PAGE_SIZE);

  const itemsHtml = pageItems.map((log, idx) => {
    const globalIdx = startIdx + idx;
    const dStr = new Date(log.recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    
    // Compare with the one right after in reverse array (which was prior in time)
    const prevItem = sorted[globalIdx + 1];
    let diffBadge = '';
    if (prevItem) {
      const diff = Number(log.weightKg) - Number(prevItem.weightKg);
      if (diff < 0) {
        diffBadge = `<span style="font-size:10.5px; font-weight:800; color:#10B981; background:rgba(16,185,129,0.14); padding:1px 6px; border-radius:6px; border:1px solid rgba(16,185,129,0.25);">▼ ${Math.abs(diff).toFixed(1)} kg</span>`;
      } else if (diff > 0) {
        diffBadge = `<span style="font-size:10.5px; font-weight:800; color:#F59E0B; background:rgba(245,158,11,0.14); padding:1px 6px; border-radius:6px; border:1px solid rgba(245,158,11,0.25);">▲ +${diff.toFixed(1)} kg</span>`;
      } else {
        diffBadge = `<span style="font-size:10px; color:var(--text-muted); background:var(--bg-surface-elevated); padding:1px 6px; border-radius:6px;">0.0 kg</span>`;
      }
    }

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--bg-surface-elevated); border-radius:10px; border:1px solid var(--border-subtle);">
        <div>
          <div style="font-size:13px; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${Number(log.weightKg).toFixed(1)} kg</span>
            ${diffBadge}
            ${log.bodyFatPercentage ? `<span style="font-size:10.5px; color:var(--cyber-cyan); font-weight:600;">%${log.bodyFatPercentage} Yağ</span>` : ''}
            ${log.muscleMassKg ? `<span style="font-size:10.5px; color:var(--volt-lime); font-weight:600;">${log.muscleMassKg}kg Kas</span>` : ''}
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:3px; display:flex; align-items:center; gap:6px;">
            <span>📅 ${dStr}</span>
            ${log.notes ? `<span>· 📝 <em>${escapeHtml(log.notes)}</em></span>` : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button type="button" class="btn-icon-subtle" onclick="handleDeleteStudentMetric(${memberId}, ${log.id})" title="Bu ölçüm kaydını sil" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:13px; padding:6px; border-radius:6px; opacity:0.75; transition:opacity 0.2s ease;">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');

  const paginationHtml = totalPages > 1 ? `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid var(--border-subtle);">
      <button type="button" class="res-page-btn" ${currentStudentMetricPage === 1 ? 'disabled' : ''} style="background:var(--bg-surface-elevated); border:1px solid var(--border-medium); color:var(--text-primary); font-size:11px; font-weight:800; padding:5px 12px; border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; ${currentStudentMetricPage === 1 ? 'opacity:0.3; cursor:not-allowed; border-color:transparent; background:rgba(255,255,255,0.02); color:var(--text-muted);' : ''}" onclick="changeStudentMetricPage(${currentStudentMetricPage - 1})">
        <span>◀</span> Önceki
      </button>
      <div style="font-size:10.5px; font-weight:800; color:var(--volt-lime); background:var(--volt-lime-muted); padding:3px 10px; border-radius:999px; border:1px solid rgba(204,255,0,0.25); display:inline-flex; align-items:center; gap:4px;">
        <span>Sayfa</span>
        <strong style="color:var(--text-primary); font-size:11px;">${currentStudentMetricPage}</strong>
        <span style="color:var(--text-muted);">/</span>
        <span style="color:var(--text-secondary);">${totalPages}</span>
      </div>
      <button type="button" class="res-page-btn" ${currentStudentMetricPage === totalPages ? 'disabled' : ''} style="background:var(--bg-surface-elevated); border:1px solid var(--border-medium); color:var(--text-primary); font-size:11px; font-weight:800; padding:5px 12px; border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; ${currentStudentMetricPage === totalPages ? 'opacity:0.3; cursor:not-allowed; border-color:transparent; background:rgba(255,255,255,0.02); color:var(--text-muted);' : ''}" onclick="changeStudentMetricPage(${currentStudentMetricPage + 1})">
        Sonraki <span>▶</span>
      </button>
    </div>
  ` : '';

  historyCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:12px; transition:background 0.2s ease;" onclick="toggleStudentMetricsHistory()">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:14px;">📋</span>
        <span style="font-size:12px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.03em;">
          Ölçüm & Tartı Geçmişi
        </span>
        <span style="font-size:10px; font-weight:800; color:var(--volt-lime); background:var(--volt-lime-muted); padding:2px 8px; border-radius:999px; border:1px solid rgba(204,255,0,0.25);">
          ${totalItems} Kayıt
        </span>
      </div>
      <button type="button" style="background:var(--bg-surface-elevated); border:1px solid var(--border-medium); color:var(--text-secondary); font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; pointer-events:none;">
        <span>${isStudentMetricsHistoryOpen ? 'Gizle' : 'Görüntüle'}</span>
        <span style="transition:transform 0.2s ease; display:inline-block; transform:${isStudentMetricsHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)'};">▾</span>
      </button>
    </div>

    ${isStudentMetricsHistoryOpen ? `
      <div class="animate-fade-in" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
        ${itemsHtml}
        ${paginationHtml}
      </div>
    ` : ''}
  `;
}

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

  // Populate month select dropdown if empty (dynamically 6 months starting from current month)
  const select = document.getElementById('hakedis-month-select');
  if (select && select.options.length === 0) {
    const now = new Date();
    const months = [];
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const optY = d.getFullYear();
      const optM = d.getMonth() + 1;
      const isCurrentMonth = (i === 0);
      const label = `${monthNames[d.getMonth()]} ${optY}${isCurrentMonth ? ' (Bu Ay)' : ''}`;
      months.push({ y: optY, m: optM, label });
    }
    select.innerHTML = months.map(opt => `<option value="${opt.y}-${opt.m}" ${opt.y === y && opt.m === m ? 'selected' : ''}>${opt.label}</option>`).join('');
  }

  const tbody = document.getElementById('hakedis-table-body');
  const cardsFeed = document.getElementById('hakedis-cards-feed');
  const countEl = document.getElementById('hakedis-table-count');
  const totalLessonsEl = document.getElementById('hakedis-total-lessons');
  const lessonsMetaEl = document.getElementById('hakedis-lessons-meta');
  const subLessonsEl = document.getElementById('hakedis-sub-lessons');
  const totalAmountEl = document.getElementById('hakedis-total-amount');
  const amountMetaEl = document.getElementById('hakedis-amount-meta');

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px;">Hakediş bilgileri yükleniyor...</td></tr>';
  if (cardsFeed) cardsFeed.innerHTML = '<div style="color:var(--text-muted); padding:32px; text-align:center;">Hakediş bilgileri yükleniyor...</div>';

  try {
    const data = await Api.getMyEarnings(y, m);

    if (totalLessonsEl) totalLessonsEl.innerText = data.totalLessonsGiven;
    if (lessonsMetaEl) lessonsMetaEl.innerText = `${data.ownStudentLessons} Asıl · ${data.substituteLessons} İkame Ders`;
    if (subLessonsEl) subLessonsEl.innerText = `${data.substituteLessons} Seans`;
    if (totalAmountEl) totalAmountEl.innerText = formatMoney(data.totalEarnings);
    if (amountMetaEl) amountMetaEl.innerText = `${formatMoney(data.totalLessonEarnings)} prim + ${formatMoney(data.totalPackageShare)} paket payı`;
    if (countEl) countEl.innerText = `${data.lessonHistory ? data.lessonHistory.length : 0} seans listelendi`;

    if (!data.lessonHistory || data.lessonHistory.length === 0) {
      const emptyMsg = 'Bu ay için henüz verilmiş seans kaydı bulunmuyor.';
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px;">${emptyMsg}</td></tr>`;
      if (cardsFeed) cardsFeed.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:36px 16px; border:1px dashed var(--border-subtle); border-radius:14px;"><span style="font-size:32px; display:block; margin-bottom:8px;">📭</span>${emptyMsg}</div>`;
      return;
    }

    // 1. Masaüstü Tablosu Render
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

    // 2. Mobilde Reels / Feed Tarzı Seans Prim Kartları Render
    if (cardsFeed) {
      cardsFeed.innerHTML = data.lessonHistory.map(item => {
        const d = new Date(item.lessonDate);
        const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
        const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        const typeBadge = item.isSubstitute 
          ? `<span class="hakedis-badge-substitute" title="İkame hoca olarak girildi (%40 prim)">⚡ %40 İkame</span>`
          : `<span class="hakedis-badge-primary">Asıl Hoca</span>`;

        const statusBadge = item.status === 'Attended'
          ? `<span class="lesson-badge badge-green" style="font-size:11px;">Geldi ✓</span>`
          : `<span class="lesson-badge badge-red" style="font-size:11px;">Yandı / Gelmedi</span>`;

        return `
          <div class="hakedis-session-card">
            <div class="hakedis-card-header">
              <div class="hakedis-card-time">
                <span class="hakedis-card-cal-icon">📅</span>
                <span class="hakedis-card-date">${dateStr}</span>
                <span class="hakedis-card-hour">· ${timeStr}</span>
              </div>
              <div class="hakedis-card-amount">
                +${formatMoney(item.earnedAmount)}
              </div>
            </div>
            <div class="hakedis-card-body">
              <div class="hakedis-card-member-row">
                <span class="hakedis-card-member-name">${escapeHtml(item.memberName)}</span>
                <span class="lesson-badge badge-cyan" style="font-size:11px;">${item.lessonNumber}. Ders</span>
              </div>
              <div class="hakedis-card-package">${escapeHtml(item.packageName)}</div>
            </div>
            <div class="hakedis-card-footer">
              <div class="hakedis-card-badges">
                ${typeBadge}
                ${statusBadge}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    const errText = `Hata: ${err.message}`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:var(--pulse-rose); padding:24px; text-align:center;">${errText}</td></tr>`;
    if (cardsFeed) cardsFeed.innerHTML = `<div style="color:var(--pulse-rose); padding:24px; text-align:center;">${errText}</div>`;
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

  const d = new Date();
  if (typeof year !== 'number' || isNaN(year) || year <= 0) {
    year = calYear || d.getFullYear();
  }
  if (typeof month !== 'number' || isNaN(month) || month < 1 || month > 12) {
    month = calMonth || (d.getMonth() + 1);
  }
  calYear = year;
  calMonth = month;

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
  const fullName = document.getElementById('m-name')?.value?.trim();
  const phone = document.getElementById('m-phone')?.value?.trim() || null;
  const email = document.getElementById('m-email')?.value?.trim() || null;
  const medicalConditions = document.getElementById('m-medical')?.value?.trim() || null;
  const notes = document.getElementById('m-notes')?.value?.trim() || null;

  if (!fullName) {
    showToast('Ad Soyad zorunludur.', 'error');
    return;
  }

  try {
    const created = await Api.createMember({ fullName, phone, email, notes, medicalConditions });
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

  let m = (typeof allMembers !== 'undefined' ? allMembers : []).find(x => x.id === memberId);
  const currentVal = (m ? (m.medicalConditions || m.notes) : null) || notes || '';

  if (idInput) idInput.value = memberId;
  if (nameEl) nameEl.innerText = memberName;
  if (textarea) textarea.value = currentVal;

  openModal('modal-edit-member-notes');
  if (textarea) setTimeout(() => textarea.focus(), 150);
};

window.handleSaveMemberNotes = async function(e) {
  e.preventDefault();
  const memberId = parseInt(document.getElementById('edit-member-notes-id').value);
  const notes = document.getElementById('edit-member-notes-textarea').value.trim();

  try {
    await Api.updateMemberNotes(memberId, notes, notes);
    showToast('⚡ Sporcu sağlık kısıtı / sakatlık notu güncellendi!');
    closeModal('modal-edit-member-notes');
    if (currentTab === 'yoklama') {
      await loadAttendanceView();
    } else if (currentTab === 'uyeler') {
      await loadMembersView();
    }
    if (document.getElementById('modal-student-progress')?.classList.contains('open')) {
      const name = document.getElementById('student-progress-name')?.textContent || '';
      openStudentProgressDrawer(memberId, name);
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
async function populateScheduleHourOptions(targetDate) {
  const hourSelect = document.getElementById('schedule-hour');
  if (!hourSelect) return;

  let slots = capacitySlotsData;
  if (!slots || currentCapacityDate !== targetDate) {
    try {
      slots = await Api.getCapacity(targetDate);
    } catch {
      slots = capacitySlotsData || [];
    }
  }

  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const selectedVal = parseInt(hourSelect.value) || 19;

  hourSelect.innerHTML = hours.map(h => {
    const slot = slots?.find(s => s.hour === h);
    const startStr = h.toString().padStart(2, '0') + ':00';
    const endStr = (h + 1).toString().padStart(2, '0') + ':00';
    const timeLabel = `${startStr} - ${endStr}`;

    let statusText = '(Boş 🟢)';
    let trainerInfo = '';
    const total = slot?.totalMembers || 0;
    const limit = slot?.capacityLimit || 6;

    if (total >= limit) {
      statusText = `(${total}/${limit} DOLU 🔴 Çakışma!)`;
    } else if (total >= 4) {
      statusText = `(${total}/${limit} Doluyor 🟡)`;
    } else if (total > 0) {
      statusText = `(${total}/${limit} Rahat 🟢)`;
    }

    if (slot?.trainers && slot.trainers.length > 0) {
      trainerInfo = ' · ' + slot.trainers.map(t => `${t.trainerName.split(' ')[0]}:${t.memberCount}`).join(' ');
    }

    const isSelected = h === selectedVal;
    return `<option value="${h}" ${isSelected ? 'selected' : ''}>${timeLabel} ${statusText}${trainerInfo}</option>`;
  }).join('');

  checkScheduleHourWarning();
}

window.handleScheduleModalDateChange = async function(newDate) {
  if (newDate) {
    await populateScheduleHourOptions(newDate);
  }
};

window.handleScheduleModalHourChange = function() {
  checkScheduleHourWarning();
};

function checkScheduleHourWarning() {
  const hourSelect = document.getElementById('schedule-hour');
  const warningBanner = document.getElementById('schedule-capacity-warning');
  if (!hourSelect || !warningBanner) return;

  const hour = parseInt(hourSelect.value);
  const slot = capacitySlotsData?.find(s => s.hour === hour);
  if (slot && slot.totalMembers >= slot.capacityLimit) {
    warningBanner.style.display = 'block';
  } else {
    warningBanner.style.display = 'none';
  }
}

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
  if (dateInput) {
    dateInput.value = currentCapacityDate;
    populateScheduleHourOptions(currentCapacityDate);
  }

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

    // Load Workout Templates (WOD)
    try {
      const templates = await Api.getWorkoutTemplates(true).catch(() => []);
      const templateSelect = document.getElementById('edit-session-workout-template');
      if (templateSelect) {
        templateSelect.innerHTML = `<option value="">— Program Yok / Serbest İdman —</option>` +
          (templates || []).map(t =>
            `<option value="${t.id}" ${t.id === slot.workoutTemplateId ? 'selected' : ''}>${escapeHtml(t.name)} (${t.category} · ${(t.exercises || []).length} egzersiz)</option>`
          ).join('');
      }
    } catch (e) {
      console.warn('WOD şablonları yüklenemedi:', e);
    }

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
  const templateVal = document.getElementById('edit-session-workout-template') ? document.getElementById('edit-session-workout-template').value : '';
  const workoutTemplateId = templateVal ? parseInt(templateVal) : 0;

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
      status: status,
      workoutTemplateId: workoutTemplateId
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


window.openFreezeModal = function(subId, memberName, packageName) {
  const idInput = document.getElementById('freeze-sub-id');
  if (idInput) idInput.value = subId;
  const labelEl = document.getElementById('freeze-sub-label');
  if (labelEl) labelEl.innerText = `${memberName} — ${packageName}`;
  if (typeof selectFreezeDays === 'function') selectFreezeDays(7);
  openModal('modal-freeze-subscription');
};

window.handleStaffUnfreezeSub = async function(subId, memberName) {
  if (!confirm(`${memberName} isimli üyenin paket dondurmasını kaldırmak istiyor musunuz?`)) {
    return;
  }
  try {
    showToast('☀️ Dondurma kaldırılıyor...');
    await Api.unfreezeSubscription(subId);
    showToast(`✓ ${memberName} paket dondurması kaldırıldı ve aktifleştirildi!`, 'success');
    if (typeof loadMembersView === 'function') loadMembersView();
    if (typeof loadAttendanceData === 'function') loadAttendanceData();
    if (typeof loadDashboardView === 'function') loadDashboardView();
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
};

window.switchDashboardSubTab = switchDashboardSubTab;
window.loadAttendanceView = loadAttendanceView;
window.switchAttendanceDayScope = switchAttendanceDayScope;
window.filterSessionAttendees = filterSessionAttendees;
window.handleQuickSessionAttendance = handleQuickSessionAttendance;
window.handleMarkAllSessionAttended = handleMarkAllSessionAttended;
window.openSessionWodNoteModal = openSessionWodNoteModal;
window.handleWodTemplateSelectChange = handleWodTemplateSelectChange;
window.handleSaveSessionWodNote = handleSaveSessionWodNote;
window.openAddMemberToSessionModal = openAddMemberToSessionModal;
window.handleSaveAddMemberToSession = handleSaveAddMemberToSession;
window.openAttendeeMicroNoteModal = openAttendeeMicroNoteModal;
window.handleSaveAttendeeMicroNote = handleSaveAttendeeMicroNote;
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
window.renderStudentCards = renderStudentCards;
window.filterStudentsList = filterStudentsList;
window.openStudentProgressDrawer = openStudentProgressDrawer;
window.openAddStudentMetricModal = openAddStudentMetricModal;
window.handleSaveStudentMetricLog = handleSaveStudentMetricLog;
window.renderStudentMetricsHistory = renderStudentMetricsHistory;
window.toggleStudentMetricsHistory = toggleStudentMetricsHistory;
window.changeStudentMetricPage = changeStudentMetricPage;
window.handleDeleteStudentMetric = handleDeleteStudentMetric;

export {
  switchDashboardSubTab,
  loadAttendanceView, switchAttendanceDayScope, filterSessionAttendees,
  handleQuickSessionAttendance, handleMarkAllSessionAttended,
  openSessionWodNoteModal, handleWodTemplateSelectChange, handleSaveSessionWodNote,
  openAddMemberToSessionModal, handleSaveAddMemberToSession,
  openAttendeeMicroNoteModal, handleSaveAttendeeMicroNote,
  renderCapacityWeekStrip, loadCapacitySlots, renderCapacitySlots,
  applyAttendanceFilter, renderAttendanceList, loadDashboardView, renderMembersTable,
  loadMembersView, getRoleBadgeHtml, loadKasaView, loadMyEarningsView,
  loadTrainers, renderTrainersTable, updateTrainerSelects, loadPackagesAdmin,
  renderPackagesTable, loadCalendarView, renderCalendarGrid,
  renderStudentCards, filterStudentsList, openStudentProgressDrawer,
  openAddStudentMetricModal, handleSaveStudentMetricLog,
  renderStudentMetricsHistory, toggleStudentMetricsHistory,
  changeStudentMetricPage, handleDeleteStudentMetric
};

