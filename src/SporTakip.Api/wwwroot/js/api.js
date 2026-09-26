const API_BASE = '/api';

export const Api = {
  // Token Management
  getToken() {
    return localStorage.getItem('sportakip_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('sportakip_token', token);
    } else {
      localStorage.removeItem('sportakip_token');
    }
  },

  getRefreshToken() {
    return localStorage.getItem('sportakip_refresh_token');
  },

  setRefreshToken(refreshToken) {
    if (refreshToken) {
      localStorage.setItem('sportakip_refresh_token', refreshToken);
    } else {
      localStorage.removeItem('sportakip_refresh_token');
    }
  },

  getUser() {
    try {
      const u = localStorage.getItem('sportakip_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('sportakip_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sportakip_user');
    }
  },

  clearAuth() {
    localStorage.removeItem('sportakip_token');
    localStorage.removeItem('sportakip_refresh_token');
    localStorage.removeItem('sportakip_user');
  },

  getHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async _handleResponse(res) {
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // text is not JSON
      }
    }

    if (!res.ok) {
      let message = 'İşlem başarısız oldu.';
      if (res.status === 401) {
        message = 'Oturum süreniz dolmuş veya yetkiniz yok. Lütfen tekrar giriş yapın.';
      } else if (res.status === 403) {
        message = 'Bu işlem için yetkiniz bulunmamaktadır.';
      } else if (data && (data.message || data.title || data.error)) {
        message = data.message || data.title || data.error;
      } else if (text) {
        message = text;
      }
      throw new Error(message);
    }

    return data;
  },

  // Central Request Handler with Automatic Silent Token Refresh on 401
  async _request(method, endpoint, data = null) {
    const options = {
      method: method,
      headers: this.getHeaders()
    };
    if (data != null && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    let res = await fetch(`${API_BASE}${endpoint}`, options);

    // 401 Unauthorized aldığımızda ve endpoint /auth/ değilse, Refresh Token ile sessiz yenilemeyi dene!
    if (res.status === 401 && !endpoint.startsWith('/auth/')) {
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });
          if (refreshRes.ok) {
            const authData = await refreshRes.json();
            if (authData.accessToken) {
              this.setToken(authData.accessToken);
              if (authData.refreshToken) this.setRefreshToken(authData.refreshToken);
              if (authData.user) this.setUser(authData.user);

              // İsteği yeni token ile anında tekrar et!
              options.headers = this.getHeaders();
              res = await fetch(`${API_BASE}${endpoint}`, options);
            }
          } else {
            // Refresh token da geçersiz ise temizle
            this.clearAuth();
          }
        } catch {
          this.clearAuth();
        }
      }
    }

    return this._handleResponse(res);
  },

  async get(endpoint) {
    return this._request('GET', endpoint);
  },

  async post(endpoint, data) {
    return this._request('POST', endpoint, data);
  },

  async put(endpoint, data) {
    return this._request('PUT', endpoint, data);
  },

  async delete(endpoint) {
    return this._request('DELETE', endpoint);
  },

  // Auth (Faz 2)
  sendOtp(phone) {
    return this.post('/auth/send-otp', { phone });
  },

  verifyOtp(phone, code) {
    return this.post('/auth/verify-otp', { phone, code });
  },

  refreshAuthToken(token, refreshToken) {
    return this.post('/auth/refresh-token', { token, refreshToken });
  },

  getMe() {
    return this.get('/auth/me');
  },

  // Sessions & Capacity (Faz 3)
  getSessions(startDate, endDate, trainerId) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (trainerId) params.append('trainerId', trainerId.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/sessions${query}`);
  },

  getSessionById(id) {
    return this.get(`/sessions/${id}`);
  },

  createSession(data) {
    return this.post('/sessions', data);
  },

  updateSession(id, data) {
    return this.put(`/sessions/${id}`, data);
  },

  async deleteSession(id) {
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return this._handleResponse(res);
  },

  // Reservations & Waitlist (Faz 3)
  bookReservation(slotId) {
    return this.post('/reservations/book', { slotId });
  },

  cancelReservation(reservationId, reason = null) {
    return this.post('/reservations/cancel', { reservationId, reason });
  },

  checkInReservation(reservationId) {
    return this.post('/reservations/check-in', { reservationId });
  },

  getMyReservations(includePast = false) {
    return this.get(`/reservations/my?includePast=${includePast}`);
  },

  // Dashboard (V1)
  getStats() {
    return this.get('/dashboard/stats');
  },

  getPayroll(year, month) {
    return this.get(`/dashboard/payroll?year=${year}&month=${month}`);
  },

  // Subscriptions & Yoklama (V1)
  getActiveSubscriptions() {
    return this.get('/subscriptions/active');
  },

  getPackages(all = false) {
    const q = all ? '?all=true' : '';
    return this.get(`/packages${q}`);
  },

  createPackage(data) {
    return this.post('/packages', data);
  },

  updatePackage(id, data) {
    return this.put(`/packages/${id}`, data);
  },

  deletePackage(id) {
    return this.delete(`/packages/${id}`);
  },


  createSubscription(data) {
    return this.post('/subscriptions', data);
  },

  markAttendance(data) {
    return this.post('/attendance/mark', data);
  },

  markAllSlotAttendance(data) {
    return this.post('/attendance/mark-all-slot', data);
  },

  getCapacity(date) {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.get(`/attendance/capacity${q}`);
  },

  scheduleSession(data) {
    return this.post('/attendance/schedule', data);
  },

  getTrainers() {
    return this.get('/trainers');
  },

  getGymInfo() {
    return this.get('/dashboard/gym-info');
  },

  createTrainer(data) {
    return this.post('/trainers', data);
  },

  getMonthCalendar(year, month) {
    return this.get(`/attendance/calendar-month?year=${year}&month=${month}`);
  },

  // Members (V1)
  getMembers(search = '') {
    return this.get(`/members${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  },

  getMember(id) {
    return this.get(`/members/${id}`);
  },

  updateMember(id, data) {
    return this.put(`/members/${id}`, data);
  },

  createMember(data) {
    return this.post('/members', data);
  },

  updateMemberMetrics(id, data) {
    return this.put(`/members/${id}/metrics`, data);
  },

  updateMemberNotes(id, notes) {
    return this.put(`/members/${id}/notes`, { notes });
  },

  getMyEarnings(year = null, month = null) {
    const params = new URLSearchParams();
    if (year) params.append('year', year);
    if (month) params.append('month', month);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/dashboard/my-earnings${qs}`);
  },


  // Payments (V1)
  addPayment(data) {
    return this.post('/payments', data);
  },

  // Workout Engine (Faz 4 - Hevy / Nike Training)
  getExercises(muscleGroup = null) {
    const q = muscleGroup ? `?muscleGroup=${encodeURIComponent(muscleGroup)}` : '';
    return this.get(`/exercises${q}`);
  },

  createExercise(data) {
    return this.post('/exercises', data);
  },

  updateExercise(id, data) {
    return this.put(`/exercises/${id}`, data);
  },

  deleteExercise(id) {
    return this.delete(`/exercises/${id}`);
  },

  getWorkoutTemplates(onlyPublished = true) {
    return this.get(`/workouts/templates?onlyPublished=${onlyPublished}`);
  },

  getWorkoutTemplateById(id) {
    return this.get(`/workouts/templates/${id}`);
  },

  startWorkout(workoutTemplateId = null, notes = null) {
    return this.post('/workouts/start', { workoutTemplateId, notes });
  },

  updateWorkoutSet(setLogId, data) {
    return this.put(`/workouts/sets/${setLogId}`, data);
  },

  finishWorkout(workoutLogId, rating = 5, notes = null) {
    return this.post(`/workouts/${workoutLogId}/finish`, { rating, notes });
  },

  getWorkoutLog(workoutLogId) {
    return this.get(`/workouts/${workoutLogId}`);
  },

  getMyWorkoutHistory(take = 20) {
    return this.get(`/workouts/history?take=${take}`);
  },

  getExerciseProgress(exerciseId) {
    return this.get(`/workouts/progress/exercises/${exerciseId}`);
  },

  // SuperAdmin APIs
  getSuperAdminStats() {
    return this.get('/superadmin/stats');
  },

  getSuperAdminUsers() {
    return this.get('/superadmin/users');
  },

  updateSuperAdminUser(userId, data) {
    return this.put(`/superadmin/users/${userId}`, data);
  },

  assignSuperAdminRole(userId, role, assign) {
    return this.post('/superadmin/assign-role', { userId, role, assign });
  },

  createGymOwner(fullName, phoneNumber, defaultShareRate = 0.30) {
    return this.post('/superadmin/create-gym-owner', { fullName, phoneNumber, defaultShareRate });
  },

  updateTrainer(trainerId, data) {
    return this.put(`/trainers/${trainerId}`, data);
  }
};


