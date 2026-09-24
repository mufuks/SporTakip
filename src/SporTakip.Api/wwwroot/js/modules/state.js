// Global Application State Store
export const state = {
  // Navigation & Mode
  currentTab: localStorage.getItem('sportakip_tab') || 'home',
  currentAthleteTab: 'home',
  currentAppMode: localStorage.getItem('sportakip_app_mode') || 'athlete',
  currentFilter: 'all', // all, expiring, unpaid

  // Staff Data
  activeSubscriptions: [],
  allMembers: [],
  packages: [],
  allTrainers: [],
  capacitySlotsData: [],
  selectedSlotHour: null,
  currentCapacityDate: new Date().toISOString().split('T')[0],
  waTargetSub: null,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,

  // Gym / Studio Information
  currentGymInfo: null,

  // Theme
  currentTheme: localStorage.getItem('sportakip-theme') || 'dark',

  // Auth / OTP
  currentOtpPhone: '',
  otpCountdownTimer: null,

  // Athlete Sessions
  currentCalendarSelectedDate: new Date().toISOString().split('T')[0],

  // Workouts (Canlı İdman & Şablonlar)
  allWorkoutsList: [],
  selectedWorkoutTemplateId: null,
  activeWorkoutLog: null,
  activeWorkoutTimerInterval: null,

  // SuperAdmin User Management
  superAdminUsersList: [],
  saCurrentFilter: 'all',
  saCurrentSortCol: 'createdAt',
  saCurrentSortAsc: false,
  saCurrentSearch: ''
};

// Global backward compatibility
window.state = state;
window.currentTab = state.currentTab;
window.currentAthleteTab = state.currentAthleteTab;
