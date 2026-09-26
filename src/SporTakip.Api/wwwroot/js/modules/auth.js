import { Api } from '../api.js?v=3.0.0';
import { state } from './state.js';
import { showToast, escapeHtml } from './utils.js';

// ==================== DYNAMIC GYM CONTACT ====================
export async function getGymContactInfo(forceRefresh = false) {
  if (state.currentGymInfo && !forceRefresh) return state.currentGymInfo;
  try {
    state.currentGymInfo = await Api.getGymInfo();
  } catch (err) {
    console.warn('[GymInfo] Dynamic gym info fetch failed:', err);
    state.currentGymInfo = {
      studioName: 'Compound Athletic Stüdyosu',
      address: 'İhsaniye, Erkal Sk. No:5A, 16600 Nilüfer / Bursa',
      mapsUrl: 'https://maps.google.com/?q=%C4%B0hsaniye,+Erkal+Sk.+No:5A,+16600+Nil%C3%BCfer/Bursa',
      workingHours: 'Hafta İçi: 07:00 – 22:00 | Hafta Sonu: 09:00 – 18:00',
      ownerName: 'Salon Sahibi',
      ownerPhone: '+905321112233',
      formattedPhone: '+90 532 111 22 33',
      cleanPhone: '905321112233'
    };
  }
  updateGlobalGymContactElements();
  return state.currentGymInfo;
}
window.getGymContactInfo = getGymContactInfo;

export function updateGlobalGymContactElements() {
  if (!state.currentGymInfo) return;
  const { cleanPhone, formattedPhone, ownerPhone, ownerName } = state.currentGymInfo;

  // WhatsApp linkleri
  const waLinks = document.querySelectorAll('.gym-contact-wa, #landing-hero-wa, #landing-lead-wa, #unauth-schedule-wa, #studio-contact-wa');
  waLinks.forEach(link => {
    try {
      const u = new URL(link.href);
      const textParam = u.searchParams.get('text') || 'Merhaba, Compound Athletic hakkında bilgi almak istiyorum.';
      link.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(textParam)}`;
    } catch {
      link.href = `https://wa.me/${cleanPhone}`;
    }
  });

  // Telefon arama linkleri
  const telLinks = document.querySelectorAll('.gym-contact-tel, #studio-contact-tel');
  telLinks.forEach(link => {
    link.href = `tel:+${cleanPhone}`;
  });

  // Telefon metinleri
  const phoneTexts = document.querySelectorAll('.gym-contact-phone-text, #studio-contact-phone');
  phoneTexts.forEach(el => {
    el.textContent = formattedPhone || ownerPhone;
  });

  // Salon Sahibi isim rozetleri
  const ownerNames = document.querySelectorAll('.gym-owner-name-badge');
  ownerNames.forEach(el => {
    el.textContent = `👑 ${ownerName || 'Salon Sahibi'}`;
  });
}
window.updateGlobalGymContactElements = updateGlobalGymContactElements;

export function renderStudioContactCardHtml(gym) {
  const sName = gym?.studioName || 'Compound Athletic Stüdyosu';
  const sAddr = gym?.address || 'İhsaniye, Erkal Sk. No:5A, 16600 Nilüfer / Bursa';
  const sMaps = gym?.mapsUrl || 'https://maps.google.com/?q=%C4%B0hsaniye,+Erkal+Sk.+No:5A,+16600+Nil%C3%BCfer/Bursa';
  const sHours = gym?.workingHours || 'Hafta İçi: 07:00 – 22:00 | Hafta Sonu: 09:00 – 18:00';
  const sPhone = gym?.formattedPhone || gym?.ownerPhone || '+90 532 111 22 33';
  const sClean = gym?.cleanPhone || '905321112233';
  const sOwner = gym?.ownerName || 'Salon Sahibi';

  return `
      <!-- Studio Information & Contact Card (Salon Sahibi İletişimi) -->
      <div class="v0-card" style="padding:20px; border-radius:16px; margin-bottom:16px;">
        <h4 style="font-size:15px; font-weight:800; margin:0 0 12px 0; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
          <span>🏢</span> ${escapeHtml(sName)}
        </h4>
        <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px; color:var(--text-secondary);">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <span style="color:var(--volt-lime); font-size:16px;">📍</span>
            <div>
              <span style="font-weight:600; color:var(--text-primary); display:block;">${escapeHtml(sAddr)}</span>
              <a href="${sMaps}" target="_blank" style="display:inline-block; font-size:11px; color:var(--volt-lime); margin-top:3px; text-decoration:underline; font-weight:700;">Haritada Aç (Google Maps) ↗</a>
            </div>
          </div>
          <div style="display:flex; gap:10px;">
            <span style="color:var(--volt-lime);">⏰</span>
            <span>${escapeHtml(sHours)}</span>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span style="color:var(--volt-lime);">📞</span>
            <span class="gym-contact-phone-text" style="font-weight:700; color:var(--text-primary);">${escapeHtml(sPhone)}</span>
            <span class="gym-owner-name-badge" style="font-size:11px; color:var(--volt-lime); background:var(--volt-lime-muted); padding:2px 8px; border-radius:999px; margin-left:6px; font-weight:600;">👑 ${escapeHtml(sOwner)}</span>
          </div>
        </div>
        <div style="margin-top:14px; display:flex; gap:8px;">
          <a class="gym-contact-wa" href="https://wa.me/${sClean}?text=Merhaba,%20Compound%20Athletic%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum." target="_blank" style="flex:1; padding:9px 12px; border-radius:10px; background:#25D366; color:#fff; text-align:center; font-size:12px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            <span>💬</span> WhatsApp
          </a>
          <a class="gym-contact-tel" href="tel:+${sClean}" style="flex:1; padding:9px 12px; border-radius:10px; background:var(--bg-surface-elevated); color:var(--text-primary); border:1px solid var(--border-subtle); text-align:center; font-size:12px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            <span>📞</span> Hemen Ara
          </a>
        </div>
      </div>
  `;
}
window.renderStudioContactCardHtml = renderStudioContactCardHtml;

// ==================== OTP DRAWER & AUTH ====================
export async function openOtpDrawer() {
  let drawer = document.getElementById('v0-otp-drawer');
  if (!drawer) {
    try {
      const res = await fetch('/modals/auth-modals.html');
      if (res.ok) {
        const html = await res.text();
        const root = document.getElementById('modals-root') || document.body;
        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        while (temp.firstChild) {
          root.appendChild(temp.firstChild);
        }
        setupOtpBoxListeners();
        drawer = document.getElementById('v0-otp-drawer');
      }
    } catch (e) {
      console.warn('Failed to dynamically load auth modal:', e);
    }
  }

  if (drawer) drawer.classList.add('open');
  goToPhoneStep();
}
window.openOtpDrawer = openOtpDrawer;

export function closeOtpDrawer() {
  const drawer = document.getElementById('v0-otp-drawer');
  if (drawer) drawer.classList.remove('open');
  if (state.otpCountdownTimer) clearInterval(state.otpCountdownTimer);
}
window.closeOtpDrawer = closeOtpDrawer;

export function handleOtpBackdropClick(e) {
  if (e.target.id === 'v0-otp-drawer') closeOtpDrawer();
}
window.handleOtpBackdropClick = handleOtpBackdropClick;

export function goToPhoneStep() {
  const stepPhone = document.getElementById('v0-otp-step-phone');
  const stepCode = document.getElementById('v0-otp-step-code');
  const subTitle = document.getElementById('v0-otp-step-subtitle');
  if (stepPhone) stepPhone.style.display = 'block';
  if (stepCode) stepCode.style.display = 'none';
  if (subTitle) subTitle.innerText = 'Telefon numaranızı girerek hemen giriş yapın';
  const input = document.getElementById('v0-input-phone');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 200);
  }
  const btn = document.getElementById('v0-btn-send-otp');
  if (btn) btn.disabled = true;
  if (state.otpCountdownTimer) clearInterval(state.otpCountdownTimer);
}
window.goToPhoneStep = goToPhoneStep;

export function goToCodeStep() {
  const stepPhone = document.getElementById('v0-otp-step-phone');
  const stepCode = document.getElementById('v0-otp-step-code');
  const subTitle = document.getElementById('v0-otp-step-subtitle');
  if (stepPhone) stepPhone.style.display = 'none';
  if (stepCode) stepCode.style.display = 'block';
  if (subTitle) subTitle.innerText = 'SMS ile gelen 6 haneli kodu girin';

  const boxes = document.querySelectorAll('.v0-otp-box');
  boxes.forEach(b => {
    b.value = '';
    b.classList.remove('has-val');
  });
  const btn = document.getElementById('v0-btn-verify-otp');
  if (btn) btn.disabled = true;
  setTimeout(() => boxes[0]?.focus(), 250);

  startOtpTimer(180);
}
window.goToCodeStep = goToCodeStep;

export function startOtpTimer(seconds) {
  if (state.otpCountdownTimer) clearInterval(state.otpCountdownTimer);
  let remain = seconds;
  const timerEl = document.getElementById('v0-otp-timer');
  const update = () => {
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
    if (timerEl) timerEl.innerText = `${mm}:${ss}`;
    if (remain <= 0) {
      clearInterval(state.otpCountdownTimer);
      if (timerEl) timerEl.innerText = 'Süre Doldu';
    }
    remain--;
  };
  update();
  state.otpCountdownTimer = setInterval(update, 1000);
}

export function handlePhoneInput(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 10);
  let parts = [val.slice(0, 3), val.slice(3, 6), val.slice(6, 8), val.slice(8, 10)].filter(Boolean);
  input.value = parts.join(' ');
  const btn = document.getElementById('v0-btn-send-otp');
  if (btn) btn.disabled = val.length !== 10;
}
window.handlePhoneInput = handlePhoneInput;

export async function submitSendOtp() {
  const input = document.getElementById('v0-input-phone');
  if (!input) return;
  const raw = input.value.replace(/\D/g, '');
  if (raw.length !== 10) return;
  const fullPhone = `+90${raw}`;
  state.currentOtpPhone = fullPhone;

  try {
    const res = await Api.sendOtp(fullPhone);
    const codeToShow = res.devCode || '123456';
    showToast(`⚡ Doğrulama kodu: ${codeToShow}`, 'success');
    goToCodeStep();

    const subtitle = document.getElementById('v0-otp-step-subtitle');
    if (subtitle) {
      subtitle.innerHTML = `SMS Doğrulama Kodu: <strong style="color:#CCFF00; font-size:16px; letter-spacing:3px;">${codeToShow}</strong>`;
    }

    // Geliştirme ortamında kutuları otomatik doldur
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
}
window.submitSendOtp = submitSendOtp;

export async function resendOtp() {
  if (!state.currentOtpPhone) return;
  try {
    await Api.sendOtp(state.currentOtpPhone);
    showToast('⚡ Yeni doğrulama kodu gönderildi!');
    startOtpTimer(180);
  } catch (err) {
    showToast(`Hata: ${err.message}`, 'error');
  }
}
window.resendOtp = resendOtp;

export function checkCodeComplete() {
  const boxes = Array.from(document.querySelectorAll('.v0-otp-box'));
  const code = boxes.map(b => b.value).join('');
  const btn = document.getElementById('v0-btn-verify-otp');
  if (btn) btn.disabled = code.length !== 6;
}

export async function submitVerifyOtp() {
  const boxes = Array.from(document.querySelectorAll('.v0-otp-box'));
  const code = boxes.map(b => b.value).join('');
  if (code.length !== 6 || !state.currentOtpPhone) return;

  try {
    const res = await Api.verifyOtp(state.currentOtpPhone, code);
    Api.setToken(res.accessToken);
    Api.setRefreshToken(res.refreshToken);
    Api.setUser(res.user);
    showToast(`🎉 Hoş geldin, ${res.user.fullName || 'Sporcu'}! Giriş yapıldı.`);
    closeOtpDrawer();

    if (window.updateNavForUserRole) window.updateNavForUserRole();
    updateAppAvatars();

    const roles = res.user && res.user.roles ? res.user.roles : (res.user && res.user.role ? [res.user.role] : []);
    if (roles.includes('SuperAdmin')) {
      if (window.setAppMode) window.setAppMode('superadmin');
    } else if (roles.includes('Coach') || roles.includes('Admin')) {
      if (window.setAppMode) window.setAppMode('staff');
    } else {
      if (window.setAppMode) window.setAppMode('athlete');
    }
  } catch (err) {
    showToast(`Doğrulama Hatası: ${err.message}`, 'error');
  }
}
window.submitVerifyOtp = submitVerifyOtp;

export function setupOtpBoxListeners() {
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
window.setupOtpBoxListeners = setupOtpBoxListeners;

// ==================== AVATARS & LOGOUT ====================
export function updateAppAvatars() {
  const avatarUrl = localStorage.getItem('sportakip_custom_avatar') || '/images/default-avatar.png?v=2.7.5';
  document.querySelectorAll('.v0-avatar-img, #athlete-avatar-img, #profile-avatar-img').forEach(img => {
    img.src = avatarUrl;
  });
}
window.updateAppAvatars = updateAppAvatars;

export function handleLogout() {
  Api.clearAuth();
  showToast('Çıkış yapıldı.');
  if (window.updateNavForUserRole) window.updateNavForUserRole();
  if (window.navigateTo) window.navigateTo('home');
}
window.handleLogout = handleLogout;

export function handleAvatarClick() {
  const user = Api.getUser();
  if (!user || !Api.getToken()) {
    openOtpDrawer();
  } else {
    if (window.navigateTo) window.navigateTo('profile');
  }
}
window.handleAvatarClick = handleAvatarClick;

export function handleAvatarFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('Fotoğraf boyutu 2MB dan küçük olmalıdır.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    localStorage.setItem('sportakip_custom_avatar', dataUrl);
    updateAppAvatars();
    showToast('✓ Profil fotoğrafınız güncellendi!', 'success');
  };
  reader.readAsDataURL(file);
}
window.handleAvatarFileUpload = handleAvatarFileUpload;

export function resetAvatarToDefault() {
  localStorage.removeItem('sportakip_custom_avatar');
  updateAppAvatars();
  showToast('✓ Profil fotoğrafı Compound varsayılanına sıfırlandı.', 'info');
}
window.resetAvatarToDefault = resetAvatarToDefault;
