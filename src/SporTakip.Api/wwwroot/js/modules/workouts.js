import { Api } from '../api.js?v=3.0.0';
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml, escapeJsString } from './utils.js';

// ==================== WORKOUT ENGINE (HEVY & NIKE TRAINING STYLE) ====================
let currentWorkoutSubTab = 'templates';
let activeWorkoutSession = null;
let workoutTimerInterval = null;
let currentWorkoutRating = 5;

function renderWodStoryCard() {
  const dateLabel = document.getElementById('v0-wod-date-label');
  if (dateLabel) {
    const today = new Date();
    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    dateLabel.innerText = `${today.getDate()} ${monthNames[today.getMonth()]} ${dayNames[today.getDay()]}`;
  }

  const user = Api.getUser();
  const userId = user ? (user.id || user.memberId || 'guest') : 'guest';
  const todayKey = new Date().toISOString().slice(0, 10);
  const isCompleted = localStorage.getItem(`sportakip_wod_completed_${todayKey}_${userId}`) === 'true';

  const btn = document.getElementById('btn-wod-complete');
  const btnText = document.getElementById('wod-complete-btn-text');
  const streakText = document.getElementById('wod-streak-text');
  const streakBadge = document.getElementById('wod-streak-badge');

  if (btn && btnText) {
    if (isCompleted) {
      btn.classList.add('completed');
      btnText.innerText = 'Bugünkü İdman Tamamlandı! 🎉';
      if (streakText) streakText.innerText = '🏆 Bugünün görevi tamamlandı!';
      if (streakBadge) streakBadge.innerText = '🔥 Harikasın!';
    } else {
      btn.classList.remove('completed');
      btnText.innerText = 'İdmanı Tamamladım';
    }
  }
}
window.renderWodStoryCard = renderWodStoryCard;

window.handleWodCompletion = function() {
  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    showToast('⚡ İdmanınızı kaydetmek için lütfen telefonunuzla giriş yapın.');
    if (typeof openOtpDrawer === 'function') openOtpDrawer();
    return;
  }

  const userId = user.id || user.memberId || 'athlete';
  const todayKey = new Date().toISOString().slice(0, 10);
  const alreadyCompleted = localStorage.getItem(`sportakip_wod_completed_${todayKey}_${userId}`) === 'true';

  const btn = document.getElementById('btn-wod-complete');
  const btnText = document.getElementById('wod-complete-btn-text');
  const card = document.getElementById('athlete-wod-story-card');

  if (alreadyCompleted) {
    showToast('✓ Bugünkü antrenmanı zaten tamamladın! Dinlenmeyi ve bol su içmeyi unutma 💧');
    return;
  }

  localStorage.setItem(`sportakip_wod_completed_${todayKey}_${userId}`, 'true');

  if (btn && btnText) {
    btn.classList.add('completed');
    btnText.innerText = 'Bugünkü İdman Tamamlandı! 🎉';
  }

  if (card) {
    card.classList.add('v0-wod-celebrating');
    setTimeout(() => card.classList.remove('v0-wod-celebrating'), 2000);
  }

  showToast('🎉 TEBRİKLER! Bugünkü antrenmanı canavar gibi bitirdin! 🔥');
};

window.toggleAdvancedWorkoutView = function() {
  const body = document.getElementById('v0-advanced-workout-body');
  const arrow = document.getElementById('advanced-toggle-arrow');
  if (!body) return;

  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.innerText = isHidden ? '▲' : '▼';

  if (isHidden) {
    loadWorkoutTemplates();
  }
};

window.switchWorkoutSubTab = function(subtab) {
  currentWorkoutSubTab = subtab;
  document.querySelectorAll('.v0-subtab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `btn-wsub-${subtab}`);
  });

  const views = {
    templates: document.getElementById('v0-workout-subview-templates'),
    exercises: document.getElementById('v0-workout-subview-exercises'),
    live: document.getElementById('v0-workout-subview-live'),
    progress: document.getElementById('v0-workout-subview-progress')
  };

  Object.keys(views).forEach(k => {
    if (views[k]) views[k].style.display = k === subtab ? 'block' : 'none';
  });

  if (subtab === 'templates') loadWorkoutTemplates();
  else if (subtab === 'exercises') loadExercisesCatalog();
  else if (subtab === 'live') renderLiveWorkoutView();
  else if (subtab === 'progress') loadWorkoutProgress();
};

// ==================== ATHLETE PROGRESS & BODY METRICS HUB ====================
let currentProgressMemberId = null;

async function loadWorkoutHub() {
  localStorage.removeItem('sportakip_active_workout_id');
  if (workoutTimerInterval) {
    clearInterval(workoutTimerInterval);
    workoutTimerInterval = null;
  }

  const summaryCard = document.getElementById('progress-summary-card');
  const chartCard = document.getElementById('progress-chart-container');
  const historyCard = document.getElementById('progress-history-container');
  const dateLabel = document.getElementById('v0-progress-date-label');
  if (dateLabel) {
    const today = new Date();
    dateLabel.innerText = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const user = Api.getUser();
  const token = Api.getToken();

  if (!user || !token) {
    if (summaryCard) {
      summaryCard.innerHTML = `
        <div style="text-align:center; padding:28px 16px;">
          <div style="font-size:32px; margin-bottom:8px;">🔒</div>
          <h3 style="font-size:16px; font-weight:800; color:var(--text-primary); margin:0 0 6px 0;">Gelişim ve Ölçüm Takibi</h3>
          <p style="font-size:12.5px; color:var(--text-secondary); margin:0 0 16px 0;">Kilo ve boy takibinizi yapmak, değişim grafiğinizi görmek için lütfen giriş yapın.</p>
          <button type="button" class="v0-btn-submit" onclick="openOtpDrawer()" style="max-width:240px; margin:0 auto; padding:11px 16px; font-size:13px; font-weight:800;">
            Telefonla Giriş Yap →
          </button>
        </div>
      `;
    }
    if (chartCard) chartCard.style.display = 'none';
    if (historyCard) historyCard.style.display = 'none';
    return;
  }

  let memberId = user.memberId;
  if (!memberId) {
    const me = await Api.getMe().catch(() => null);
    if (me && me.memberId) {
      memberId = me.memberId;
      user.memberId = me.memberId;
      Api.setUser(user);
    }
  }

  currentProgressMemberId = memberId;
  if (!memberId) {
    if (summaryCard) {
      summaryCard.innerHTML = `
        <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">
          Sporcu profili eşleştirilemedi. Lütfen salon yöneticisiyle iletişime geçin.
        </div>
      `;
    }
    return;
  }

  if (chartCard) chartCard.style.display = 'block';
  if (historyCard) historyCard.style.display = 'block';

  try {
    const [progress, memberDetails] = await Promise.all([
      Api.getMemberMetricProgress(memberId).catch(() => null),
      Api.getMember(memberId).catch(() => null)
    ]);

    const heightVal = progress?.heightCm ?? memberDetails?.heightCm ?? null;
    const weightVal = progress?.currentWeightKg != null ? Number(progress.currentWeightKg) : (memberDetails?.weightKg != null ? Number(memberDetails.weightKg) : null);
    const startWeight = progress?.startingWeightKg != null ? Number(progress.startingWeightKg) : null;
    const totalChange = progress?.totalChangeKg != null ? Number(progress.totalChangeKg) : null;
    const bmiVal = progress?.bmi ?? memberDetails?.bmi ?? null;
    const bmiCat = progress?.bmiCategory ?? memberDetails?.bmiCategory ?? null;

    // Fill inputs
    const heightInput = document.getElementById('progress-input-height');
    const weightInput = document.getElementById('progress-input-weight');
    if (heightInput && heightVal) heightInput.value = heightVal;
    if (weightInput && weightVal) weightInput.value = weightVal;

    // Change Pill
    let changeHtml = '<span style="font-size:12px; font-weight:700; color:var(--text-muted);">Henüz Fark Yok</span>';
    if (totalChange != null && startWeight != null) {
      const num = totalChange;
      if (num < 0) {
        changeHtml = `<span style="font-size:12px; font-weight:800; color:#10B981; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); padding:3px 8px; border-radius:999px;">▼ ${Math.abs(num).toFixed(1)} kg</span>`;
      } else if (num > 0) {
        changeHtml = `<span style="font-size:12px; font-weight:800; color:#F59E0B; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); padding:3px 8px; border-radius:999px;">▲ +${num.toFixed(1)} kg</span>`;
      } else {
        changeHtml = `<span style="font-size:12px; font-weight:800; color:var(--text-secondary); background:rgba(255,255,255,0.08); padding:3px 8px; border-radius:999px;">0.0 kg</span>`;
      }
    }

    // BMI Badge color
    let bmiBadgeHtml = '';
    if (bmiVal) {
      let bColor = '#CCFF00';
      let bBg = 'rgba(204,255,0,0.12)';
      if (bmiVal < 18.5) { bColor = '#38BDF8'; bBg = 'rgba(56,189,248,0.12)'; }
      else if (bmiVal >= 25 && bmiVal < 30) { bColor = '#F59E0B'; bBg = 'rgba(245,158,11,0.12)'; }
      else if (bmiVal >= 30) { bColor = '#EF4444'; bBg = 'rgba(239,68,68,0.12)'; }
      bmiBadgeHtml = `<span style="font-size:11px; font-weight:800; color:${bColor}; background:${bBg}; border:1px solid ${bColor}; padding:2px 8px; border-radius:999px;">VKİ: ${bmiVal} (${bmiCat || 'Fit'})</span>`;
    }

    if (summaryCard) {
      summaryCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px;">
          <h3 style="font-size:15px; font-weight:800; color:var(--text-primary); margin:0;">Vücut Form Özeti</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            ${bmiBadgeHtml}
            <button type="button" onclick="toggleProgressInputCard()" style="background:var(--volt-lime); color:#000; font-weight:800; font-size:11.5px; padding:5px 12px; border-radius:999px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 8px rgba(204,255,0,0.25);">
              <span>+</span> Tartı Gir
            </button>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <div style="padding:12px 10px; border-radius:12px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); text-align:center;">
            <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Boy</div>
            <div style="font-size:19px; font-weight:800; color:var(--text-primary); margin-top:2px;">
              ${heightVal ? `${heightVal} <span style="font-size:11px; font-weight:600; color:var(--text-muted);">cm</span>` : '--'}
            </div>
          </div>

          <div style="padding:12px 10px; border-radius:12px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); text-align:center;">
            <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Güncel Kilo</div>
            <div style="font-size:19px; font-weight:800; color:var(--volt-lime); margin-top:2px;">
              ${weightVal != null ? `${weightVal.toFixed(1)} <span style="font-size:11px; font-weight:600; color:var(--text-muted);">kg</span>` : '--'}
            </div>
          </div>

          <div style="padding:12px 10px; border-radius:12px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); text-align:center;">
            <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Değişim</div>
            <div style="margin-top:4px;">
              ${changeHtml}
            </div>
          </div>
        </div>
      `;
    }

    // Render Chart
    const logs = progress?.history || [];
    renderProgressSvgChart(logs);

    // Render History
    renderProgressHistoryList(logs, memberId);

  } catch (err) {
    console.warn('Gelişim metrikleri yüklenemedi:', err);
  }
}
window.loadWorkoutHub = loadWorkoutHub;

function renderProgressSvgChart(logs) {
  const chartCard = document.getElementById('progress-chart-container');
  if (!chartCard) return;

  if (!logs || logs.length < 2) {
    chartCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="font-size:14.5px; font-weight:800; color:var(--text-primary); margin:0;">Kilo Değişim Grafiği</h3>
      </div>
      <div style="text-align:center; padding:24px 16px; border-radius:12px; background:rgba(204,255,0,0.03); border:1px dashed rgba(204,255,0,0.25);">
        <span style="font-size:28px;">📈</span>
        <div style="font-size:13.5px; font-weight:800; color:var(--text-primary); margin:6px 0 3px 0;">
          ${logs && logs.length === 1 ? `İlk Tartı: ${Number(logs[0].weightKg).toFixed(1)} kg` : 'Henüz Yeterli Tartı Yok'}
        </div>
        <p style="font-size:12px; color:var(--text-secondary); margin:0 0 12px 0;">
          ${logs && logs.length === 1 ? 'Değişim eğrinizin oluşması için yeni tartınızı girin.' : 'Zaman içindeki kilo değişim eğrinizi görmek için tartı ekleyin.'}
        </p>
        <button type="button" onclick="toggleProgressInputCard()" style="background:var(--volt-lime); color:#000; font-weight:800; font-size:12px; padding:7px 16px; border-radius:999px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 8px rgba(204,255,0,0.25);">
          <span>⚖️</span> + Tartı Gir
        </button>
      </div>
    `;
    return;
  }

  const w = 480;
  const h = 180;
  const padL = 38;
  const padR = 25;
  const padT = 24;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const weights = logs.map(l => Number(l.weightKg));
  const minW = Math.min(...weights) - 0.5;
  const maxW = Math.max(...weights) + 0.5;
  const range = (maxW - minW) || 1;

  const points = logs.map((l, i) => {
    const x = padL + (i / (logs.length - 1)) * plotW;
    const y = padT + ((maxW - Number(l.weightKg)) / range) * plotH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, log: l };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${h - padB} L ${points[0].x} ${h - padB} Z`;

  const firstDate = new Date(logs[0].recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const lastDate = new Date(logs[logs.length - 1].recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const midDate = logs.length > 2 ? new Date(logs[Math.floor(logs.length / 2)].recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';

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
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 style="font-size:14.5px; font-weight:800; color:var(--text-primary); margin:0; display:flex; align-items:center; gap:8px;">
        <span>📈</span> Kilo Değişim Grafiği
      </h3>
      <span style="font-size:11px; color:var(--volt-lime); font-weight:700;">${logs.length} Ölçüm</span>
    </div>

    <div style="position:relative; width:100%; overflow:hidden; border-radius:12px; background:rgba(0,0,0,0.28); border:1px solid var(--border-subtle); padding:10px 8px 6px 8px; box-sizing:border-box;">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="progress-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#CCFF00" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#CCFF00" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
        <line x1="${padL}" y1="${padT + plotH / 2}" x2="${w - padR}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
        <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(255,255,255,0.12)" />

        <text x="${padL - 6}" y="${padT + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(maxW)}k</text>
        <text x="${padL - 6}" y="${h - padB + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(minW)}k</text>

        <path d="${areaD}" fill="url(#progress-area-grad)" />
        <path d="${pathD}" fill="none" stroke="#CCFF00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        ${dotsSvg}

        <text x="${padL}" y="${h - 10}" fill="var(--text-muted)" font-size="10" font-weight="600">${firstDate}</text>
        ${midDate ? `<text x="${w / 2}" y="${h - 10}" fill="var(--text-muted)" font-size="10" text-anchor="middle" font-weight="600">${midDate}</text>` : ''}
        <text x="${w - padR}" y="${h - 10}" fill="var(--text-muted)" font-size="10" text-anchor="end" font-weight="600">${lastDate}</text>
      </svg>
    </div>
  `;
}

// ==================== WORKOUT PROGRESS MEASUREMENT HISTORY ====================
let cachedProgressLogs = [];
let currentProgressHistoryPage = 1;
let isProgressHistoryOpen = false;
const PROGRESS_HISTORY_PAGE_SIZE = 3;

window.toggleProgressHistory = function() {
  isProgressHistoryOpen = !isProgressHistoryOpen;
  renderProgressHistoryList(cachedProgressLogs, currentProgressMemberId);
};

window.changeProgressHistoryPage = function(newPage) {
  currentProgressHistoryPage = newPage;
  renderProgressHistoryList(cachedProgressLogs, currentProgressMemberId);
};

function renderProgressHistoryList(logs, memberId) {
  cachedProgressLogs = logs || [];
  currentProgressMemberId = memberId;

  const historyCard = document.getElementById('progress-history-container');
  if (!historyCard) return;

  if (!logs || logs.length === 0) {
    historyCard.innerHTML = `
      <div style="text-align:center; padding:18px; color:var(--text-muted); font-size:12.5px;">
        Henüz kaydedilmiş ölçüm bulunmuyor.
      </div>
    `;
    return;
  }

  // Reverse chronological
  const sortedLogs = [...logs].reverse();
  const totalItems = sortedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PROGRESS_HISTORY_PAGE_SIZE));
  if (currentProgressHistoryPage > totalPages) currentProgressHistoryPage = totalPages;
  if (currentProgressHistoryPage < 1) currentProgressHistoryPage = 1;

  const startIdx = (currentProgressHistoryPage - 1) * PROGRESS_HISTORY_PAGE_SIZE;
  const pageItems = sortedLogs.slice(startIdx, startIdx + PROGRESS_HISTORY_PAGE_SIZE);

  const itemsHtml = pageItems.map((item, idx) => {
    const globalIdx = startIdx + idx;
    const dStr = new Date(item.recordedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    const tStr = new Date(item.recordedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    
    // Compare with the one right after in reverse array (which was prior in time)
    const prevItem = sortedLogs[globalIdx + 1];
    let diffBadge = '';
    if (prevItem) {
      const diff = Number(item.weightKg) - Number(prevItem.weightKg);
      if (diff < 0) {
        diffBadge = `<span style="font-size:11px; font-weight:800; color:#10B981;">▼ ${Math.abs(diff).toFixed(1)} kg</span>`;
      } else if (diff > 0) {
        diffBadge = `<span style="font-size:11px; font-weight:800; color:#F59E0B;">▲ +${diff.toFixed(1)} kg</span>`;
      } else {
        diffBadge = `<span style="font-size:11px; color:var(--text-muted);">0.0 kg</span>`;
      }
    }

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:14.5px; font-weight:800; color:var(--text-primary);">${Number(item.weightKg).toFixed(1)} kg</span>
            ${diffBadge}
          </div>
          <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
            ${dStr} · ${tStr} ${item.notes ? `— <em>${escapeHtml(item.notes)}</em>` : ''}
          </div>
        </div>
        <button type="button" onclick="handleDeleteProgressLog(${item.id})" title="Ölçümü Sil" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:6px 8px; border-radius:8px;">
          🗑️
        </button>
      </div>
    `;
  }).join('');

  const paginationHtml = totalPages > 1 ? `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid var(--border-subtle);">
      <button type="button" class="res-page-btn" ${currentProgressHistoryPage === 1 ? 'disabled' : ''} style="background:var(--bg-surface-elevated); border:1px solid var(--border-medium); color:var(--text-primary); font-size:11.5px; font-weight:800; padding:6px 14px; border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.2s ease; ${currentProgressHistoryPage === 1 ? 'opacity:0.3; cursor:not-allowed; border-color:transparent; background:rgba(255,255,255,0.02); color:var(--text-muted);' : ''}" onclick="changeProgressHistoryPage(${currentProgressHistoryPage - 1})">
        <span>◀</span> Önceki
      </button>
      <div style="font-size:11px; font-weight:800; color:var(--volt-lime); background:var(--volt-lime-muted); padding:4px 12px; border-radius:999px; border:1px solid rgba(204,255,0,0.25); display:inline-flex; align-items:center; gap:4px; letter-spacing:0.02em;">
        <span>Sayfa</span>
        <strong style="color:var(--text-primary); font-size:11.5px;">${currentProgressHistoryPage}</strong>
        <span style="color:var(--text-muted);">/</span>
        <span style="color:var(--text-secondary);">${totalPages}</span>
      </div>
      <button type="button" class="res-page-btn" ${currentProgressHistoryPage === totalPages ? 'disabled' : ''} style="background:var(--bg-surface-elevated); border:1px solid var(--border-medium); color:var(--text-primary); font-size:11.5px; font-weight:800; padding:6px 14px; border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.2s ease; ${currentProgressHistoryPage === totalPages ? 'opacity:0.3; cursor:not-allowed; border-color:transparent; background:rgba(255,255,255,0.02); color:var(--text-muted);' : ''}" onclick="changeProgressHistoryPage(${currentProgressHistoryPage + 1})">
        Sonraki <span>▶</span>
      </button>
    </div>
  ` : '';

  historyCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;" onclick="toggleProgressHistory()">
      <div style="display:flex; align-items:center; gap:8px;">
        <h3 style="font-size:14px; font-weight:800; color:var(--text-primary); margin:0; display:flex; align-items:center; gap:6px;">
          <span>📋</span> Ölçüm Geçmişi
        </h3>
        <span style="font-size:10.5px; font-weight:800; color:var(--volt-lime); background:var(--volt-lime-muted); padding:2px 8px; border-radius:999px; border:1px solid var(--border-subtle);">
          ${totalItems} Kayıt
        </span>
      </div>
      <button type="button" style="background:var(--bg-surface-elevated); border:1px solid var(--border-medium); color:var(--text-secondary); font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
        <span>${isProgressHistoryOpen ? 'Gizle' : 'Görüntüle'}</span>
        <span style="transition:transform 0.2s ease; display:inline-block; transform:${isProgressHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)'};">▾</span>
      </button>
    </div>

    ${isProgressHistoryOpen ? `
      <div class="v0-progress-history-list" style="margin-top:12px; padding-top:4px; border-top:1px solid var(--border-subtle);">
        ${itemsHtml}
        ${paginationHtml}
      </div>
    ` : ''}
  `;
}

window.toggleProgressInputCard = function() {
  const card = document.getElementById('progress-input-card');
  if (!card) return;
  const isHidden = card.style.display === 'none' || card.style.display === '';
  card.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const weightInput = document.getElementById('progress-input-weight');
    if (weightInput) {
      setTimeout(() => {
        weightInput.focus();
        weightInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }
};

window.submitProgressMeasurement = async function() {
  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    showToast('Ölçüm kaydetmek için lütfen telefonunuzla giriş yapın.', 'info');
    if (typeof openOtpDrawer === 'function') openOtpDrawer();
    return;
  }

  const memberId = currentProgressMemberId || user.memberId;
  if (!memberId) {
    showToast('Kayıtlı sporcu profili bulunamadı.', 'error');
    return;
  }

  const heightVal = parseInt(document.getElementById('progress-input-height')?.value || 0);
  const weightVal = parseFloat(document.getElementById('progress-input-weight')?.value || 0);
  const notesVal = document.getElementById('progress-input-notes')?.value?.trim() || null;

  if (!weightVal || weightVal <= 20 || weightVal > 400) {
    showToast('Lütfen geçerli bir kilo değeri giriniz (Örn: 78.5).', 'error');
    return;
  }

  try {
    showToast('⚡ Ölçüm kaydediliyor...');
    // 1. Profil Boy/Kilo güncelle
    await Api.updateMemberMetrics(memberId, {
      heightCm: heightVal > 0 ? heightVal : null,
      weightKg: weightVal
    });

    // 2. Tarihçe tartı kaydı ekle
    await Api.addMemberMetricLog(memberId, {
      weightKg: weightVal,
      notes: notesVal
    });

    showToast('✓ Ölçümünüz kaydedildi ve gelişim grafiğinize eklendi! ⚡');
    
    // Clear notes input & collapse card
    const notesInput = document.getElementById('progress-input-notes');
    if (notesInput) notesInput.value = '';

    const inputCard = document.getElementById('progress-input-card');
    if (inputCard) inputCard.style.display = 'none';

    // Re-render and open history on page 1
    isProgressHistoryOpen = true;
    currentProgressHistoryPage = 1;
    await loadWorkoutHub();
  } catch (err) {
    showToast(`Kayıt Hatası: ${err.message}`, 'error');
  }
};

window.handleDeleteProgressLog = async function(logId) {
  const user = Api.getUser();
  const memberId = currentProgressMemberId || (user && user.memberId);
  if (!memberId || !logId) return;

  if (!confirm('Bu ölçüm kaydını silmek istediğinize emin misiniz?')) return;

  try {
    await Api.deleteMemberMetricLog(memberId, logId);
    showToast('Ölçüm kaydı silindi.');
    isProgressHistoryOpen = true;
    await loadWorkoutHub();
  } catch (err) {
    showToast(`Silme Hatası: ${err.message}`, 'error');
  }
};

async function loadWorkoutTemplates() {
  const container = document.getElementById('v0-workout-templates-list');
  if (!container) return;

  const user = Api.getUser();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const isStaff = roles.includes('Coach') || roles.includes('Admin') || roles.includes('SuperAdmin');
  const createTemplateBtn = document.getElementById('btn-open-create-template');
  if (createTemplateBtn) {
    createTemplateBtn.style.display = isStaff ? 'inline-block' : 'none';
  }

  container.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4); font-size:13px;">Programlar yükleniyor...</div>';

  try {
    const templates = await Api.getWorkoutTemplates(true);
    if (!templates || templates.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:rgba(255,255,255,0.4); font-size:13px; grid-column:1 / -1;">
          Henüz yayınlanmış antrenman programı bulunmuyor.
          ${isStaff ? '<br><button type="button" class="btn btn-primary" onclick="openTemplateBuilderModal()" style="margin-top:12px; font-size:12px;">+ İlk Programı Sen Oluştur</button>' : ''}
        </div>`;
      return;
    }

    container.innerHTML = templates.map(t => {
      const isPersonal = !!t.assignedMemberId;
      return `
        <div class="v0-template-card" style="${isPersonal ? 'border-color:rgba(255,149,0,0.5); box-shadow:0 0 16px rgba(255,149,0,0.12);' : ''}">
          <div>
            <div class="v0-template-header">
              <h4 class="v0-template-title">${escapeHtml(t.name)}</h4>
              ${isPersonal ? `
                <span class="lesson-badge badge-amber" style="font-size:11px; padding:3px 9px; font-weight:800; border:1px solid #FF9500; background:rgba(255,149,0,0.15);">
                  🎯 ${t.assignedMemberName ? `KİŞİYE ÖZEL: ${escapeHtml(t.assignedMemberName)}` : 'SANA ÖZEL PROGRAM'}
                </span>
              ` : `
                <span class="v0-template-category">${escapeHtml(t.category || 'GÜÇ')}</span>
              `}
            </div>
            <p style="font-size:12.5px; color:rgba(255,255,255,0.6); margin:0 0 10px 0; line-height:1.4;">
              ${escapeHtml(t.description || (isPersonal ? 'Hocan tarafından senin için özel hazırlandı.' : 'Antrenör tarafından hazırlanan özel program.'))}
            </p>
            <div class="v0-template-meta">
              <span>⏱ ~${t.estimatedDurationMinutes} dk</span>
              <span>🏋️ ${t.exercises ? t.exercises.length : 0} Egzersiz</span>
              <span>👤 ${escapeHtml(t.trainerName || 'Eğitmen')}</span>
            </div>
            <ul class="v0-template-exercises-list">
              ${(t.exercises || []).slice(0, 4).map(e => `
                <li class="v0-template-ex-item">
                  <span>${escapeHtml(e.exerciseNameTr || e.exerciseName)}</span>
                  <span style="font-weight:700; color:#CCFF00;">${e.targetSets} set × ${escapeHtml(e.targetReps || '10')}</span>
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
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#FF453A; font-size:13px;">Yükleme Hatası: ${escapeHtml(err.message)}</div>`;
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
      <div style="display:flex; align-items:center; gap:10px;">
        <div id="v0-rest-timer-badge" style="display:none; align-items:center; gap:6px; background:rgba(204,255,0,0.15); border:1px solid #CCFF00; color:#CCFF00; padding:6px 12px; border-radius:9999px; font-size:12px; font-weight:800; cursor:pointer;" onclick="skipRestTimer()">
          ⏱ Dinlenme: <span id="v0-rest-timer-seconds">90</span>s (Atla)
        </div>
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

          <!-- Ghost Weight / Progressive Overload Pill -->
          <div class="v0-ghost-weight-pill" id="ghost-pill-${el.id}" style="display:none; font-size:11.5px; color:var(--cyber-cyan); background:rgba(0,242,254,0.08); border:1px solid rgba(0,242,254,0.25); border-radius:6px; padding:4px 10px; margin:4px 0 8px 0; cursor:pointer;">
            💡 Son İdman: <strong id="ghost-text-${el.id}">-- kg × -- tekrar</strong> <span style="text-decoration:underline; margin-left:4px;">(Setlere Doldur)</span>
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

  // Ghost Weight Verilerini Arka Planda Yükle
  setTimeout(async () => {
    for (const el of (activeWorkoutSession.exerciseLogs || [])) {
      try {
        const perf = await Api.getLastExercisePerformance(el.exerciseId);
        if (perf && perf.lastWeightKg && perf.lastWeightKg > 0) {
          const pill = document.getElementById(`ghost-pill-${el.id}`);
          const text = document.getElementById(`ghost-text-${el.id}`);
          if (pill && text) {
            text.innerText = `${perf.lastWeightKg} kg × ${perf.lastReps || 10} tekrar`;
            pill.style.display = 'inline-block';
            pill.onclick = () => applyGhostWeightToExercise(el.id, perf.lastWeightKg, perf.lastReps || 10);
          }
        }
      } catch {}
    }
  }, 100);
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
      startRestTimer(90);
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

// ==================== EXERCISE CATALOG & MANAGEMENT ====================
let allExercisesCatalog = [];
let currentExerciseFilterGroup = 'all';
let currentExerciseSearchQuery = '';

function getMuscleGroupNameTr(group) {
  const map = {
    Chest: 'Göğüs',
    Back: 'Sırt',
    Legs: 'Bacak',
    Shoulders: 'Omuz',
    Arms: 'Kol',
    Core: 'Karın / Core',
    Cardio: 'Kardiyo',
    FullBody: 'Tüm Vücut'
  };
  return map[group] || group || 'Genel';
}

async function loadExercisesCatalog(muscleGroup = null) {
  const container = document.getElementById('v0-exercises-catalog-list');
  if (!container) return;

  const user = Api.getUser();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const canManageExercises = roles.includes('Coach') || roles.includes('Admin') || roles.includes('SuperAdmin');

  const createBtn = document.getElementById('btn-open-create-exercise');
  if (createBtn) {
    createBtn.style.display = canManageExercises ? 'inline-block' : 'none';
  }

  container.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4); font-size:13px;">Egzersizler yükleniyor...</div>';

  try {
    const list = await Api.getExercises(muscleGroup);
    allExercisesCatalog = list || [];
    renderExercisesCatalogList();
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#FF453A; font-size:13px;">Egzersizler yüklenemedi: ${escapeHtml(err.message)}</div>`;
  }
}

function filterExercisesByGroup(group) {
  currentExerciseFilterGroup = group;
  document.querySelectorAll('#exercise-muscle-chips .v0-chip').forEach(c => {
    c.classList.remove('active');
  });
  const chip = document.getElementById(`chip-ex-${group}`);
  if (chip) chip.classList.add('active');

  renderExercisesCatalogList();
}

function handleExerciseSearch(query) {
  currentExerciseSearchQuery = (query || '').toLowerCase().trim();
  renderExercisesCatalogList();
}

function renderExercisesCatalogList() {
  const container = document.getElementById('v0-exercises-catalog-list');
  if (!container) return;

  const user = Api.getUser();
  const roles = user && user.roles ? user.roles : (user && user.role ? [user.role] : []);
  const canManageExercises = roles.includes('Coach') || roles.includes('Admin') || roles.includes('SuperAdmin');

  let filtered = allExercisesCatalog;

  if (currentExerciseFilterGroup && currentExerciseFilterGroup !== 'all') {
    filtered = filtered.filter(e => e.muscleGroup && e.muscleGroup.toLowerCase() === currentExerciseFilterGroup.toLowerCase());
  }

  if (currentExerciseSearchQuery) {
    filtered = filtered.filter(e => {
      const q = currentExerciseSearchQuery;
      return (e.name && e.name.toLowerCase().includes(q)) ||
             (e.nameTr && e.nameTr.toLowerCase().includes(q)) ||
             (e.muscleGroup && e.muscleGroup.toLowerCase().includes(q)) ||
             (e.equipment && e.equipment.toLowerCase().includes(q));
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:rgba(255,255,255,0.4); font-size:13px; grid-column:1 / -1;">
        Kriterlere uygun egzersiz bulunamadı.
        ${canManageExercises ? '<br><button type="button" class="btn btn-primary" onclick="openCreateExerciseModal()" style="margin-top:12px; font-size:12px;">+ Yeni Egzersiz Tanımla</button>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(e => `
    <div class="v0-template-card" style="position:relative;">
      <div>
        <div class="v0-template-header">
          <div>
            <h4 class="v0-template-title" style="font-size:15px;">${escapeHtml(e.name)}</h4>
            ${e.nameTr ? `<span style="font-size:12px; color:var(--text-secondary); display:block; margin-top:2px;">${escapeHtml(e.nameTr)}</span>` : ''}
          </div>
          <span class="lesson-badge badge-green" style="font-size:10.5px; padding:3px 8px; font-weight:700;">
            ${escapeHtml(getMuscleGroupNameTr(e.muscleGroup))}
          </span>
        </div>

        <div style="display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 10px 0;">
          <span class="lesson-badge badge-blue" style="font-size:10.5px; padding:2px 7px;">
            🏋️ ${escapeHtml(e.equipment || 'Serbest')}
          </span>
          ${e.videoUrl ? `<a href="${escapeHtml(e.videoUrl)}" target="_blank" rel="noopener noreferrer" class="lesson-badge badge-cyan" style="font-size:10.5px; padding:2px 7px; text-decoration:none;">🎥 Video Rehber</a>` : ''}
          ${e.imageUrl ? `<a href="${escapeHtml(e.imageUrl)}" target="_blank" rel="noopener noreferrer" class="lesson-badge badge-amber" style="font-size:10.5px; padding:2px 7px; text-decoration:none;">🖼️ Görsel</a>` : ''}
        </div>

        ${e.instructions ? `
          <p style="font-size:12px; color:rgba(255,255,255,0.65); line-height:1.45; margin:0 0 12px 0; background:var(--bg-surface-elevated); padding:8px 10px; border-radius:8px; border:1px solid var(--border-subtle);">
            ${escapeHtml(e.instructions)}
          </p>
        ` : ''}
      </div>

      ${canManageExercises ? `
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid var(--border-subtle);">
          <button type="button" class="btn-secondary" onclick="openEditExerciseModal('${escapeJsString(e.id)}')" style="padding:4px 10px; font-size:11.5px; border-radius:8px;">
            ✏️ Düzenle
          </button>
          <button type="button" class="btn-secondary" onclick="handleDeleteExercise('${escapeJsString(e.id)}', '${escapeJsString(e.name)}')" style="padding:4px 10px; font-size:11.5px; border-radius:8px; color:#FF453A; border-color:rgba(255,69,58,0.3);">
            🗑️ Sil
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function openCreateExerciseModal() {
  const form = document.getElementById('exercise-form');
  if (form) form.reset();
  const idEl = document.getElementById('ex-id');
  if (idEl) idEl.value = '';
  const titleEl = document.getElementById('modal-exercise-title');
  if (titleEl) titleEl.innerText = '➕ Yeni Egzersiz Tanımla';
  const subEl = document.getElementById('modal-exercise-subtitle');
  if (subEl) subEl.innerText = 'Katalog ve Kas Grubu Ayarları';
  const btn = document.getElementById('btn-save-exercise');
  if (btn) btn.innerText = 'Kaydet';
  openModal('modal-exercise');
}

function openEditExerciseModal(id) {
  const ex = allExercisesCatalog.find(x => x.id === id);
  if (!ex) {
    showToast('Egzersiz bulunamadı.', 'error');
    return;
  }

  document.getElementById('ex-id').value = ex.id || '';
  document.getElementById('ex-name').value = ex.name || '';
  document.getElementById('ex-name-tr').value = ex.nameTr || '';
  document.getElementById('ex-muscle-group').value = ex.muscleGroup || 'Chest';
  document.getElementById('ex-equipment').value = ex.equipment || 'Barbell';
  document.getElementById('ex-instructions').value = ex.instructions || '';
  document.getElementById('ex-image-url').value = ex.imageUrl || '';
  document.getElementById('ex-video-url').value = ex.videoUrl || '';

  const titleEl = document.getElementById('modal-exercise-title');
  if (titleEl) titleEl.innerText = '✏️ Egzersizi Düzenle';
  const subEl = document.getElementById('modal-exercise-subtitle');
  if (subEl) subEl.innerText = ex.name;
  const btn = document.getElementById('btn-save-exercise');
  if (btn) btn.innerText = 'Güncelle';

  openModal('modal-exercise');
}

async function handleSaveExercise(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('btn-save-exercise');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Kaydediliyor...';
  }

  try {
    const id = document.getElementById('ex-id').value.trim();
    const name = document.getElementById('ex-name').value.trim();
    const nameTr = document.getElementById('ex-name-tr').value.trim() || null;
    const muscleGroup = document.getElementById('ex-muscle-group').value.trim();
    const equipment = document.getElementById('ex-equipment').value.trim() || null;
    const instructions = document.getElementById('ex-instructions').value.trim() || null;
    const imageUrl = document.getElementById('ex-image-url').value.trim() || null;
    const videoUrl = document.getElementById('ex-video-url').value.trim() || null;

    if (!name) {
      showToast('Lütfen egzersiz adını girin.', 'error');
      return;
    }

    if (id) {
      await Api.updateExercise(id, {
        name,
        nameTr,
        muscleGroup,
        equipment,
        instructions,
        imageUrl,
        videoUrl,
        isActive: true
      });
      showToast('Egzersiz başarıyla güncellendi.', 'success');
    } else {
      await Api.createExercise({
        name,
        nameTr,
        muscleGroup,
        equipment,
        instructions,
        imageUrl,
        videoUrl
      });
      showToast('Yeni egzersiz başarıyla kütüphaneye eklendi.', 'success');
    }

    closeModal('modal-exercise');
    await loadExercisesCatalog(currentExerciseFilterGroup === 'all' ? null : currentExerciseFilterGroup);
  } catch (err) {
    showToast(err.message || 'Egzersiz kaydedilirken bir hata oluştu.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = 'Kaydet';
    }
  }
}

async function handleDeleteExercise(id, name) {
  if (!confirm(`"${name}" egzersizini katalogdan silmek veya arşivlemek istediğinize emin misiniz?`)) {
    return;
  }

  try {
    await Api.deleteExercise(id);
    showToast(`"${name}" egzersizi silindi.`, 'info');
    await loadExercisesCatalog(currentExerciseFilterGroup === 'all' ? null : currentExerciseFilterGroup);
  } catch (err) {
    showToast(err.message || 'Silme işlemi başarısız oldu.', 'error');
  }
}

// ==================== REST TIMER & CHIME ====================
let restTimerInterval = null;
let restRemainingSeconds = 0;

function startRestTimer(seconds = 90) {
  if (restTimerInterval) clearInterval(restTimerInterval);
  restRemainingSeconds = seconds;

  const badge = document.getElementById('v0-rest-timer-badge');
  const span = document.getElementById('v0-rest-timer-seconds');
  if (badge) badge.style.display = 'inline-flex';
  if (span) span.innerText = restRemainingSeconds;

  restTimerInterval = setInterval(() => {
    restRemainingSeconds--;
    if (span) span.innerText = restRemainingSeconds;
    if (restRemainingSeconds <= 0) {
      clearInterval(restTimerInterval);
      restTimerInterval = null;
      if (badge) badge.style.display = 'none';

      // 1. Titreşim (Web Vibration API)
      if ('vibrate' in navigator) {
        try { navigator.vibrate([200, 100, 200, 100, 300]); } catch {}
      }

      // 2. Sesli Bildirim (Web Audio API - Offline & Zero Dependency)
      playRestCompleteChime();

      showToast('⏱ Dinlenme süresi bitti! Sıradaki sete hazırsın 💪', 'info');
    }
  }, 1000);
}

function skipRestTimer() {
  if (restTimerInterval) clearInterval(restTimerInterval);
  restTimerInterval = null;
  const badge = document.getElementById('v0-rest-timer-badge');
  if (badge) badge.style.display = 'none';
  showToast('Dinlenme sayacı atlandı.', 'info');
}

function playRestCompleteChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function applyGhostWeightToExercise(exerciseLogId, weight, reps) {
  const elCard = document.getElementById(`card-el-${exerciseLogId}`);
  if (!elCard) return;

  const weightInputs = elCard.querySelectorAll('.v0-set-input[id^="set-weight-"]');
  const repsInputs = elCard.querySelectorAll('.v0-set-input[id^="set-reps-"]');

  weightInputs.forEach(input => {
    if (!input.value) input.value = weight;
  });
  repsInputs.forEach(input => {
    if (!input.value) input.value = reps;
  });

  weightInputs.forEach(input => {
    const setId = input.id.replace('set-weight-', '');
    autoCalc1Rm(setId);
  });

  showToast(`💡 Son performans (${weight} kg × ${reps} tekrar) setlere uygulandı!`);
}

// ==================== TEMPLATE BUILDER (HOCANIN PROGRAM ATAMASI) ====================
let builderExercises = [];
let availableExercisesCatalog = [];

async function openTemplateBuilderModal(preselectedMemberId = null, preselectedMemberName = null) {
  builderExercises = [];
  const form = document.getElementById('template-builder-form');
  if (form) form.reset();

  const subSelect = document.getElementById('tb-assigned-member');
  if (subSelect) {
    subSelect.innerHTML = '<option value="">🌐 Genel Şablon (Tüm Sporculara Açık)</option>';
    try {
      const members = await Api.getMembers();
      if (members && members.length > 0) {
        members.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = `👤 Kişiye Özel: ${m.fullName}${m.medicalConditions ? ` (⚠️ ${m.medicalConditions})` : ''}`;
          if (preselectedMemberId && m.id === parseInt(preselectedMemberId)) {
            opt.selected = true;
          }
          subSelect.appendChild(opt);
        });
      }
    } catch {}
  }

  const exSelect = document.getElementById('tb-add-exercise-select');
  if (exSelect) {
    exSelect.innerHTML = '<option value="">Egzersiz seçiniz...</option>';
    try {
      availableExercisesCatalog = await Api.getExercises();
      availableExercisesCatalog.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.nameTr || e.name} (${getMuscleGroupNameTr(e.muscleGroup)})`;
        exSelect.appendChild(opt);
      });
    } catch {}
  }

  if (preselectedMemberName) {
    const nameInput = document.getElementById('tb-name');
    if (nameInput) nameInput.value = `${preselectedMemberName} - Özel Program`;
  }

  renderBuilderExercisesList();
  openModal('modal-template-builder');
}

function openTemplateBuilderForMember(memberId, memberName) {
  openTemplateBuilderModal(memberId, memberName);
}

function addExerciseToBuilder() {
  const exSelect = document.getElementById('tb-add-exercise-select');
  const exerciseId = parseInt(exSelect?.value);
  if (!exerciseId) {
    showToast('Lütfen listeden bir egzersiz seçin.', 'error');
    return;
  }

  const targetSets = parseInt(document.getElementById('tb-add-sets')?.value || 3);
  const targetReps = document.getElementById('tb-add-reps')?.value?.trim() || '8-12';
  const restSeconds = parseInt(document.getElementById('tb-add-rest')?.value || 90);

  const found = availableExercisesCatalog.find(e => e.id === exerciseId);

  builderExercises.push({
    exerciseId,
    exerciseName: found ? (found.nameTr || found.name) : 'Egzersiz',
    muscleGroup: found?.muscleGroup || 'FullBody',
    orderIndex: builderExercises.length + 1,
    targetSets,
    targetReps,
    restSeconds
  });

  renderBuilderExercisesList();
  showToast('✓ Egzersiz programa eklendi');
}

function removeExerciseFromBuilder(index) {
  builderExercises.splice(index, 1);
  builderExercises.forEach((e, idx) => e.orderIndex = idx + 1);
  renderBuilderExercisesList();
}

function renderBuilderExercisesList() {
  const container = document.getElementById('tb-selected-exercises-list');
  const countEl = document.getElementById('tb-exercise-count');
  if (countEl) countEl.innerText = builderExercises.length;
  if (!container) return;

  if (builderExercises.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:16px; color:var(--text-muted); font-size:12px; border:1px dashed var(--border-subtle); border-radius:8px;">
        Henüz hareket eklenmedi. Yukarıdan seçip ekleyin.
      </div>`;
    return;
  }

  container.innerHTML = builderExercises.map((e, idx) => `
    <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <span style="font-weight:800; font-size:13px; color:var(--text-primary);">${idx + 1}. ${escapeHtml(e.exerciseName)}</span>
        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${e.targetSets} set × ${escapeHtml(e.targetReps)} (${e.restSeconds}s dinlenme)</span>
      </div>
      <button type="button" onclick="removeExerciseFromBuilder(${idx})" style="background:none; border:none; color:#FF453A; font-size:14px; cursor:pointer; padding:2px 6px;">✕</button>
    </div>
  `).join('');
}

async function handleSaveWorkoutTemplate(event) {
  event.preventDefault();
  if (builderExercises.length === 0) {
    showToast('Lütfen programa en az 1 egzersiz ekleyin.', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save-template');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Kaydediliyor...';
  }

  try {
    const name = document.getElementById('tb-name').value.trim();
    const category = document.getElementById('tb-category').value;
    const duration = parseInt(document.getElementById('tb-duration').value || 60);
    const description = document.getElementById('tb-description').value.trim() || null;
    const assignedVal = document.getElementById('tb-assigned-member').value;
    const assignedMemberId = assignedVal ? parseInt(assignedVal) : null;

    await Api.createWorkoutTemplate({
      name,
      category,
      estimatedDurationMinutes: duration,
      description,
      isPublished: true,
      assignedMemberId,
      exercises: builderExercises.map(e => ({
        exerciseId: e.exerciseId,
        orderIndex: e.orderIndex,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        restSeconds: e.restSeconds
      }))
    });

    showToast('🎉 Antrenman programı başarıyla oluşturuldu!', 'success');
    closeModal('modal-template-builder');
    await loadWorkoutTemplates();
  } catch (err) {
    showToast(err.message || 'Program kaydedilirken bir hata oluştu.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = 'Kaydet & Yayınla';
    }
  }
}

// Global window assignments
window.loadWorkoutTemplates = loadWorkoutTemplates;
window.startWorkoutTimer = startWorkoutTimer;
window.renderLiveWorkoutView = renderLiveWorkoutView;
window.loadWorkoutProgress = loadWorkoutProgress;
window.loadExercisesCatalog = loadExercisesCatalog;
window.filterExercisesByGroup = filterExercisesByGroup;
window.handleExerciseSearch = handleExerciseSearch;
window.openCreateExerciseModal = openCreateExerciseModal;
window.openEditExerciseModal = openEditExerciseModal;
window.handleSaveExercise = handleSaveExercise;
window.handleDeleteExercise = handleDeleteExercise;
window.startRestTimer = startRestTimer;
window.skipRestTimer = skipRestTimer;
window.applyGhostWeightToExercise = applyGhostWeightToExercise;
window.openTemplateBuilderModal = openTemplateBuilderModal;
window.openTemplateBuilderForMember = openTemplateBuilderForMember;
window.addExerciseToBuilder = addExerciseToBuilder;
window.removeExerciseFromBuilder = removeExerciseFromBuilder;
window.handleSaveWorkoutTemplate = handleSaveWorkoutTemplate;

export {
  loadWorkoutHub, loadWorkoutTemplates, startWorkoutTimer,
  renderLiveWorkoutView, loadWorkoutProgress,
  loadExercisesCatalog, filterExercisesByGroup, handleExerciseSearch,
  openCreateExerciseModal, openEditExerciseModal, handleSaveExercise, handleDeleteExercise,
  startRestTimer, skipRestTimer, applyGhostWeightToExercise,
  openTemplateBuilderModal, openTemplateBuilderForMember,
  addExerciseToBuilder, removeExerciseFromBuilder, handleSaveWorkoutTemplate
};
