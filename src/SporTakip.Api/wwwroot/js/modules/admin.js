import { Api } from '../api.js?v=3.0.0';
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml, escapeJsString, formatMoney } from './utils.js';

let superAdminUsers = [];
let saCurrentFilter = 'all';
let saCurrentSortCol = 'createdAt';
let saCurrentSortAsc = false;
let saCurrentSearch = '';

window.loadSuperAdminView = async function() {
  const statsUsers = document.getElementById('sa-stat-total-users');
  const statsMeta = document.getElementById('sa-stat-users-meta');
  const statsCoachesAthletes = document.getElementById('sa-stat-coaches-athletes');
  const statsRevenue = document.getElementById('sa-stat-revenue');
  const statsSubsMeta = document.getElementById('sa-stat-subs-meta');
  const tbody = document.getElementById('sa-users-table-body');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">Sistem verileri yükleniyor...</td></tr>`;
  }

  try {
    const [stats, users] = await Promise.all([
      Api.getSuperAdminStats(),
      Api.getSuperAdminUsers()
    ]);

    if (statsUsers) statsUsers.innerText = stats.totalUsers || 0;
    if (statsMeta) statsMeta.innerText = `${stats.superAdminsCount || 0} SuperAdmin · ${stats.gymOwnersCount || 0} Salon Sahibi`;
    if (statsCoachesAthletes) statsCoachesAthletes.innerText = `${stats.coachesCount || 0} / ${stats.athletesCount || 0}`;
    if (statsRevenue) statsRevenue.innerText = formatMoney(stats.totalRevenue || 0);
    if (statsSubsMeta) statsSubsMeta.innerText = `${stats.activeSubscriptions || 0} Aktif Üyelik (${stats.totalSubscriptions || 0} Toplam)`;

    superAdminUsers = users || [];
    updateRoleCounts();
    filterAndRenderSuperAdminUsers();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--pulse-rose);">Veri yüklenemedi: ${escapeHtml(err.message)}</td></tr>`;
    }
    showToast(`SuperAdmin verileri alınamadı: ${err.message}`, 'error');
  }
};

window.sortSuperAdminUsers = function(col) {
  if (currentSaSortCol === col) {
    currentSaSortDir = currentSaSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSaSortCol = col;
    currentSaSortDir = col === 'created' ? 'desc' : 'asc';
  }
  updateSortIcons();
  filterAndRenderSuperAdminUsers();
};

window.filterSuperAdminByRole = function(role) {
  currentSaRoleFilter = role;
  document.querySelectorAll('.sa-chip').forEach(c => {
    const chipRole = c.id.replace('sa-chip-', '');
    const isActive = (role === 'all' && c.id === 'sa-chip-all') ||
                     (role === 'SuperAdmin' && c.id === 'sa-chip-superadmin') ||
                     (role === 'Admin' && c.id === 'sa-chip-admin') ||
                     (role === 'Coach' && c.id === 'sa-chip-coach') ||
                     (role === 'Athlete' && c.id === 'sa-chip-athlete');
    c.classList.toggle('active', isActive);
  });
  filterAndRenderSuperAdminUsers();
};

window.filterSuperAdminUsers = function(query) {
  currentSaSearchQuery = (query || '').toLowerCase().trim();
  filterAndRenderSuperAdminUsers();
};

function filterAndRenderSuperAdminUsers() {
  let list = [...superAdminUsers];

  // 1. Rol filtresi
  if (currentSaRoleFilter !== 'all') {
    list = list.filter(u => {
      const roles = Array.isArray(u.roles) ? u.roles : [];
      return roles.includes(currentSaRoleFilter);
    });
  }

  // 2. Metin araması (İsim, Telefon, ID, Profil)
  if (currentSaSearchQuery) {
    list = list.filter(u =>
      (u.fullName && u.fullName.toLowerCase().includes(currentSaSearchQuery)) ||
      (u.phoneNumber && u.phoneNumber.toLowerCase().includes(currentSaSearchQuery)) ||
      (u.linkedProfile && u.linkedProfile.toLowerCase().includes(currentSaSearchQuery)) ||
      String(u.id) === currentSaSearchQuery
    );
  }

  // 3. Sıralama
  list.sort((a, b) => {
    let valA, valB;
    if (currentSaSortCol === 'name') {
      valA = (a.fullName || '').toLowerCase();
      valB = (b.fullName || '').toLowerCase();
      return currentSaSortDir === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
    } else if (currentSaSortCol === 'phone') {
      valA = (a.phoneNumber || '').toLowerCase();
      valB = (b.phoneNumber || '').toLowerCase();
      return currentSaSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else if (currentSaSortCol === 'role') {
      const roleRank = r => r.includes('SuperAdmin') ? 4 : (r.includes('Admin') ? 3 : (r.includes('Coach') ? 2 : 1));
      valA = roleRank(a.roles || []);
      valB = roleRank(b.roles || []);
      return currentSaSortDir === 'asc' ? valA - valB : valB - valA;
    } else if (currentSaSortCol === 'profile') {
      valA = (a.linkedProfile || '').toLowerCase();
      valB = (b.linkedProfile || '').toLowerCase();
      return currentSaSortDir === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
    } else { // created
      valA = new Date(a.createdAt || 0).getTime();
      valB = new Date(b.createdAt || 0).getTime();
      return currentSaSortDir === 'asc' ? valA - valB : valB - valA;
    }
  });

  renderSuperAdminUsersTable(list);
}

function updateSortIcons() {
  const cols = ['name', 'phone', 'role', 'profile', 'created'];
  cols.forEach(c => {
    const el = document.getElementById(`sort-icon-${c}`);
    if (!el) return;
    if (currentSaSortCol === c) {
      el.innerText = currentSaSortDir === 'asc' ? '▲' : '▼';
      el.style.color = 'var(--volt-lime)';
      el.style.opacity = '1';
    } else {
      el.innerText = '↕';
      el.style.color = 'inherit';
      el.style.opacity = '0.4';
    }
  });
}

function updateRoleCounts() {
  const countAll = superAdminUsers.length;
  const countSa = superAdminUsers.filter(u => (u.roles || []).includes('SuperAdmin')).length;
  const countOwner = superAdminUsers.filter(u => (u.roles || []).includes('Admin')).length;
  const countCoach = superAdminUsers.filter(u => (u.roles || []).includes('Coach')).length;
  const countAthlete = superAdminUsers.filter(u => (u.roles || []).includes('Athlete')).length;

  const elAll = document.getElementById('sa-count-all');
  const elSa = document.getElementById('sa-count-sa');
  const elOwner = document.getElementById('sa-count-owner');
  const elCoach = document.getElementById('sa-count-coach');
  const elAthlete = document.getElementById('sa-count-athlete');

  if (elAll) elAll.innerText = countAll;
  if (elSa) elSa.innerText = countSa;
  if (elOwner) elOwner.innerText = countOwner;
  if (elCoach) elCoach.innerText = countCoach;
  if (elAthlete) elAthlete.innerText = countAthlete;
}

window.renderSuperAdminUsersTable = function(usersList) {
  const tbody = document.getElementById('sa-users-table-body');
  if (!tbody) return;

  if (!usersList || usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">Arama kriterlerine uygun kullanıcı bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = usersList.map(u => {
    const roles = Array.isArray(u.roles) ? u.roles : [];
    const isSA = roles.includes('SuperAdmin');
    const isAdmin = roles.includes('Admin');
    const isCoach = roles.includes('Coach');
    const isAthlete = roles.includes('Athlete');

    const badges = [];
    if (isSA) badges.push(`<span class="lesson-badge role-badge-superadmin" style="font-size:11px;">🛡️ SuperAdmin</span>`);
    if (isAdmin) badges.push(`<span class="lesson-badge badge-amber" style="font-size:11px;">👑 Salon Sahibi</span>`);
    if (isCoach) badges.push(`<span class="lesson-badge badge-green" style="font-size:11px;">🥊 Eğitmen</span>`);
    if (isAthlete || badges.length === 0) badges.push(`<span class="lesson-badge role-badge-athlete" style="font-size:11px;">🏃 Sporcu</span>`);

    const profileHtml = u.linkedProfile 
      ? `<span style="color:var(--cyber-cyan); font-weight:600;">${escapeHtml(u.linkedProfile)}</span>` 
      : '<span style="color:var(--text-muted);">-</span>';

    const regDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' }) : '-';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--text-primary); font-size:13.5px;">${escapeHtml(u.fullName || 'İsimsiz Kullanıcı')}</div>
          <div style="font-size:11px; color:var(--text-muted);">ID: ${escapeHtml(u.id)} ${u.isActive === false ? '<span style="color:var(--pulse-rose); font-weight:700;">(Pasif)</span>' : ''}</div>
        </td>
        <td>
          <code style="font-size:12.5px; color:var(--text-primary); background:rgba(255,255,255,0.04); padding:2px 6px; border-radius:4px;">${escapeHtml(u.phoneNumber)}</code>
        </td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            ${badges.join(' ')}
          </div>
        </td>
        <td>
          <div style="font-size:12px;">${profileHtml}</div>
        </td>
        <td>
          <span style="font-size:12px; color:var(--text-muted);">${regDate}</span>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn-primary" style="padding:4px 10px; font-size:11px; background:rgba(204,255,0,0.15); color:var(--volt-lime); border:1px solid var(--volt-lime); font-weight:800;" onclick="openEditUserModal(${u.id})">
              ✏️ Düzenle
            </button>
            ${isAdmin ? `
              <button class="btn-secondary" style="padding:4px 9px; font-size:11px; color:var(--pulse-rose); border-color:rgba(244,63,94,0.3);" onclick="handleAssignRole('${escapeJsString(u.id)}', 'Admin', false)">
                ✕ Salon Sahibini Al
              </button>
            ` : `
              <button class="btn-secondary" style="padding:4px 9px; font-size:11px; color:#f59e0b; border-color:rgba(245,158,11,0.3);" onclick="handleAssignRole('${escapeJsString(u.id)}', 'Admin', true)">
                👑 Salon Sahibi Yap
              </button>
            `}
            ${isCoach ? `
              <button class="btn-secondary" style="padding:4px 9px; font-size:11px; color:var(--pulse-rose); border-color:rgba(244,63,94,0.3);" onclick="handleAssignRole('${escapeJsString(u.id)}', 'Coach', false)">
                ✕ Eğitmenliği Al
              </button>
            ` : `
              <button class="btn-secondary" style="padding:4px 9px; font-size:11px; color:var(--cyber-cyan); border-color:rgba(0,242,254,0.3);" onclick="handleAssignRole('${escapeJsString(u.id)}', 'Coach', true)">
                🥊 Eğitmen Yap
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

window.openEditUserModal = function(userId) {
  const u = superAdminUsers.find(x => x.id === userId);
  if (!u) return;

  const currUser = Api.getUser();
  const currRoles = currUser && currUser.roles ? currUser.roles : [];
  const isCallerSuperAdmin = currRoles.includes('SuperAdmin');

  document.getElementById('edit-user-id').value = u.id;
  document.getElementById('edit-user-fullname').value = u.fullName || '';
  document.getElementById('edit-user-phone').value = u.phoneNumber || '';

  const roles = Array.isArray(u.roles) ? u.roles : [];
  const saCheck = document.getElementById('edit-user-role-superadmin');
  const adminCheck = document.getElementById('edit-user-role-admin');
  const coachCheck = document.getElementById('edit-user-role-coach');
  const athleteCheck = document.getElementById('edit-user-role-athlete');

  if (saCheck) {
    saCheck.checked = roles.includes('SuperAdmin');
    saCheck.disabled = !isCallerSuperAdmin;
    const lblSa = document.getElementById('lbl-role-superadmin');
    if (lblSa) lblSa.style.opacity = isCallerSuperAdmin ? '1' : '0.5';
  }
  if (adminCheck) adminCheck.checked = roles.includes('Admin');
  if (coachCheck) coachCheck.checked = roles.includes('Coach');
  if (athleteCheck) athleteCheck.checked = roles.includes('Athlete') || roles.length === 0;

  // Eğitmen ayarları
  const trRole = document.getElementById('edit-user-trainer-role');
  if (trRole) trRole.value = u.trainerRole || 'Eğitmen';
  const trShare = document.getElementById('edit-user-share-rate');
  if (trShare) trShare.value = u.defaultShareRate != null ? Math.round(u.defaultShareRate * 100) : 40;

  const actCheck = document.getElementById('edit-user-is-active');
  if (actCheck) actCheck.checked = u.isActive !== false;
  const verCheck = document.getElementById('edit-user-phone-verified');
  if (verCheck) verCheck.checked = u.phoneVerified !== false;

  toggleTrainerFields();
  openModal('modal-edit-user');
};

window.toggleTrainerFields = function() {
  const isAdmin = document.getElementById('edit-user-role-admin')?.checked;
  const isCoach = document.getElementById('edit-user-role-coach')?.checked;
  const container = document.getElementById('edit-user-trainer-fields');
  if (container) {
    container.style.display = (isAdmin || isCoach) ? 'block' : 'none';
  }
};

window.handleSaveEditUser = async function(e) {
  e.preventDefault();
  const userId = parseInt(document.getElementById('edit-user-id').value);
  const fullName = document.getElementById('edit-user-fullname').value.trim();
  const phoneNumber = document.getElementById('edit-user-phone').value.trim();
  const isActive = document.getElementById('edit-user-is-active').checked;
  const phoneVerified = document.getElementById('edit-user-phone-verified').checked;

  const roles = [];
  if (document.getElementById('edit-user-role-superadmin')?.checked) roles.push('SuperAdmin');
  if (document.getElementById('edit-user-role-admin')?.checked) roles.push('Admin');
  if (document.getElementById('edit-user-role-coach')?.checked) roles.push('Coach');
  if (document.getElementById('edit-user-role-athlete')?.checked) roles.push('Athlete');

  const trainerRole = document.getElementById('edit-user-trainer-role')?.value;
  const shareRateVal = parseFloat(document.getElementById('edit-user-share-rate')?.value || '40');
  const defaultShareRate = !isNaN(shareRateVal) ? shareRateVal / 100 : 0.40;

  try {
    const updated = await Api.updateSuperAdminUser(userId, {
      fullName,
      phoneNumber,
      isActive,
      phoneVerified,
      roles,
      trainerRole,
      defaultShareRate
    });

    showToast(`✅ "${updated.fullName}" bilgileri ve numarası başarıyla güncellendi!`);
    closeModal('modal-edit-user');
    await loadSuperAdminView();
    await loadInitialData();
    await getGymContactInfo(true);
  } catch (err) {
    showToast(`Güncelleme hatası: ${err.message}`, 'error');
  }
};

window.handleAssignRole = async function(userId, role, assign) {
  const actionText = assign ? 'atamak' : 'kaldırmak';
  const roleTitle = role === 'Admin' ? 'Salon Sahibi' : (role === 'Coach' ? 'Eğitmen' : role);
  if (!confirm(`Bu kullanıcıya ${roleTitle} yetkisini ${actionText} istediğinize emin misiniz?`)) return;

  try {
    await Api.assignSuperAdminRole(userId, role, assign);
    showToast(`✓ Kullanıcı yetkisi başarıyla güncellendi!`);
    await loadSuperAdminView();
    await loadInitialData();
    await getGymContactInfo(true);
  } catch (err) {
    showToast(`Yetki güncelleme hatası: ${err.message}`, 'error');
  }
};

window.openCreateGymOwnerModal = function() {
  const form = document.getElementById('form-create-owner');
  if (form) form.reset();
  const shareInput = document.getElementById('owner-share-rate');
  if (shareInput) shareInput.value = '30';
  openModal('modal-create-owner');
};

window.handleCreateGymOwnerSubmit = async function(event) {
  event.preventDefault();
  const fullName = document.getElementById('owner-name')?.value?.trim();
  const phoneNumber = document.getElementById('owner-phone')?.value?.trim();
  const shareRate = parseFloat(document.getElementById('owner-share-rate')?.value || '30');

  if (!fullName || !phoneNumber) {
    showToast('Lütfen ad soyad ve telefon numarasını eksiksiz girin.', 'error');
    return;
  }

  try {
    await Api.createGymOwner(fullName, phoneNumber, shareRate);
    showToast(`👑 Salon Sahibi "${fullName}" başarıyla tanımlandı!`);
    closeModal('modal-create-owner');
    await loadSuperAdminView();
    await loadInitialData();
    await getGymContactInfo(true);
  } catch (err) {
    showToast(`Salon sahibi eklenemedi: ${err.message}`, 'error');
  }
};


// Global window assignments
window.filterAndRenderSuperAdminUsers = filterAndRenderSuperAdminUsers;
window.updateSortIcons = updateSortIcons;
window.updateRoleCounts = updateRoleCounts;
window.renderSuperAdminUsersTable = renderSuperAdminUsersTable;

export {
  loadSuperAdminView, sortSuperAdminUsers, filterSuperAdminByRole,
  filterSuperAdminUsers, filterAndRenderSuperAdminUsers,
  updateSortIcons, updateRoleCounts, renderSuperAdminUsersTable,
  openEditUserModal, toggleTrainerFields, handleSaveEditUser,
  handleAssignRole, openCreateGymOwnerModal, handleCreateGymOwnerSubmit
};
