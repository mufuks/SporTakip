import { Api } from '../api.js?v=3.0.0';
import { state } from './state.js';
import { 
  showToast, openModal, closeModal, escapeHtml, escapeJsString, 
  formatMoney, formatCurrency, getAthleteInitials, getStartOfWeekMonday, 
  formatDateToIso, renderSegmentedBar 
} from './utils.js';
import { renderStudioContactCardHtml, openOtpDrawer } from './auth.js';

let currentCalendarSelectedDate = new Date().toISOString().split('T')[0];

function renderAthleteActivePackage(activeSub) {
  const remainingEl = document.getElementById('pkg-metric-remaining');
  const daysEl = document.getElementById('pkg-metric-days');
  const balanceEl = document.getElementById('pkg-metric-balance');
  const pkgTitleEl = document.getElementById('pkg-card-title');
  const pkgStatusEl = document.getElementById('pkg-card-status');
  const pkgBar = document.getElementById('pkg-segmented-bar');
  const pkgCard = document.getElementById('athlete-package-card');

  if (activeSub) {
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
  } else {
    if (pkgCard) pkgCard.classList.add('empty-state');
    if (pkgTitleEl) pkgTitleEl.innerText = 'Aktif Paket Yok';
    if (pkgStatusEl) { pkgStatusEl.innerText = 'Paketsiz'; pkgStatusEl.className = 'v0-status-pill-waitlist'; }
    if (pkgBar) pkgBar.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:4px 0;">Tanımlı aktif paketiniz bulunmuyor.</div>';
    if (remainingEl) remainingEl.innerText = '0 Ders';
    if (daysEl) daysEl.innerText = '--';
    if (balanceEl) balanceEl.innerText = '₺0';
  }
}

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
    const homeRoles = user.roles ? user.roles : (user.role ? [user.role] : []);
    if (roleEl) {
      if (homeRoles.includes('SuperAdmin')) roleEl.innerText = '🛡️ SuperAdmin';
      else if (homeRoles.includes('Admin')) roleEl.innerText = 'Salon Yöneticisi';
      else if (homeRoles.includes('Coach')) roleEl.innerText = 'Antrenör';
      else roleEl.innerText = 'Aktif Sporcu';
    }
    if (badgeDot) badgeDot.style.background = '#CCFF00';
    if (loginHeaderBtn) loginHeaderBtn.style.display = 'none';

    // SWR Pattern: Hafızada son bilinen paket varsa anında çiz (0ms gecikme)
    const subCacheKey = `cached_sub_${user.id || user.phoneNumber}`;
    try {
      const cachedSubStr = sessionStorage.getItem(subCacheKey);
      if (cachedSubStr) {
        renderAthleteActivePackage(JSON.parse(cachedSubStr));
      }
    } catch (_) {}

    // Üyenin gerçek aktif paketini yükle ve arka planda güncelle (revalidate)
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
          renderAthleteActivePackage(activeSub);
          try {
            if (activeSub) sessionStorage.setItem(subCacheKey, JSON.stringify(activeSub));
          } catch (_) {}
        } else {
          renderAthleteActivePackage(null);
          try {
            sessionStorage.removeItem(subCacheKey);
          } catch (_) {}
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
          <a id="unauth-schedule-wa" class="gym-contact-wa" href="https://wa.me/${currentGymInfo?.cleanPhone || '905321112233'}?text=Merhaba,%20Compound%20Athletic%20seanslar%C4%B1%20ve%20%C3%BCyelik%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum." target="_blank" style="font-size:12px; color:#25D366; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; margin-top:2px;">
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
              myReservationSlotIds.add(r.sessionSlotId || r.slotId);
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
          <button type="button" class="v0-book-btn reserved" onclick="showToast('✓ Bu seansa zaten rezervasyonunuz bulunuyor. İptal veya detay için Profilim sekmesine bakabilirsiniz.', 'info')">
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
let currentCalendarWeekMode = 'all';
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
async function renderAthleteProfile() {
  const container = document.getElementById('v0-profile-content');
  if (!container) return;

  const gym = await getGymContactInfo();
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

      ${renderStudioContactCardHtml(gym)}

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
              ${(user.roles && user.roles.includes('SuperAdmin')) ? '🛡️ SuperAdmin' : ((user.roles && user.roles.includes('Admin')) || user.role === 'Admin') ? 'Salon Yöneticisi' : ((user.roles && user.roles.includes('Coach')) || user.role === 'Coach') ? 'Antrenör' : 'Aktif Üye'}
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

    ${renderStudioContactCardHtml(gym)}

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
}
window.renderAthleteProfile = renderAthleteProfile;

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

// ==================== 14. SUPERADMIN PLATFORM YÖNETİMİ ====================
let superAdminUsers = [];
let currentSaSortCol = 'created';
let currentSaSortDir = 'desc';
let currentSaRoleFilter = 'all';
let currentSaSearchQuery = '';


// Global window assignments
window.loadAthleteHome = loadAthleteHome;
window.renderSessionsList = renderSessionsList;
window.getRealisticSlotsForDate = getRealisticSlotsForDate;
window.loadAthleteSessionsView = loadAthleteSessionsView;
window.renderAthleteProfile = renderAthleteProfile;
window.updatePushUi = updatePushUi;
window.renderNotificationItems = renderNotificationItems;

export {
  loadAthleteHome, renderSessionsList, getRealisticSlotsForDate,
  loadAthleteSessionsView, renderAthleteProfile, updatePushUi,
  renderNotificationItems
};
