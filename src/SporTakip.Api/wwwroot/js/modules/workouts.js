import { Api } from '../api.js?v=3.0.0';
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml, escapeJsString } from './utils.js';

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

async function loadWorkoutHub() {
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
}
window.loadWorkoutHub = loadWorkoutHub;

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


// Global window assignments
window.loadWorkoutTemplates = loadWorkoutTemplates;
window.startWorkoutTimer = startWorkoutTimer;
window.renderLiveWorkoutView = renderLiveWorkoutView;
window.loadWorkoutProgress = loadWorkoutProgress;

export {
  loadWorkoutHub, loadWorkoutTemplates, startWorkoutTimer,
  renderLiveWorkoutView, loadWorkoutProgress
};
