// Real wechatId that exists in the staff collection
// Actual accounts in database:
//   wechatId 'boss'  → role: admin
//   wechatId 'david' → role: boss
//   wechatId 'fanmk' → role: boss
//   wechatId 'Andy'  → role: admin
//   wechatId 'sun'   → role: purchase
//   wechatId 'Caoc'  → role: boss
const TEST_ACCOUNTS = {
  admin: { wechatId: 'boss', expectedRole: 'admin' },
  boss: { wechatId: 'david', expectedRole: 'boss' },
  boss2: { wechatId: 'fanmk', expectedRole: 'boss' },
}

const PAGES = {
  login: 'pages/login/index',
  home: 'pages/index/index',
  reservation: 'pages/reservation/index',
  reservationAdd: 'pages/reservation-add/index',
  purchase: 'pages/purchase/index',
  purchaseAdd: 'pages/purchase-add/index',
  income: 'pages/income/index',
  incomeAdd: 'pages/income-add/index',
  me: 'pages/me/index',
  search: 'pages/search/index',
  dashboard: 'pages/admin/dashboard/index',
  announcements: 'pages/announcements/index',
  announcementDetail: 'pages/announcement-detail/index',
  venueSettings: 'pages/admin/venue-settings/index',
  approvalSettings: 'pages/admin/approval-settings/index',
  todo: 'pages/todo/index',
  reservationDetail: 'pages/reservation-detail/index',
}

// Expected permissions per role for key modules
// Admin has wildcard access to ALL modules (including staff/venueSettings/minAmount).
// Boss can access all business modules but is BLOCKED from admin-only modules.
// Other roles depend on cloud database `permissions` collection.
const ROLE_PERMISSIONS = {
  admin: {
    // Admin has ALL permissions (wildcard)
    income: { view: true, add: true, edit: true, delete: true },
    purchase: { view: true, add: true, edit: true, delete: true },
    reservation: { view: true, add: true, edit: true, delete: true },
    announcement: { view: true, add: true, edit: true, delete: true },
    dashboard: { view: true },
    staff: { view: true, add: true, edit: true, delete: true },
    expense: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true },
    venueSettings: { view: true, edit: true },
    minAmount: { view: true, edit: true },
  },
  boss: {
    income: { view: true, add: true, edit: true, delete: true },
    purchase: { view: true, add: true, edit: true, delete: true },
    reservation: { view: true, add: true, edit: true, delete: true },
    announcement: { view: true, add: true, edit: true, delete: true },
    dashboard: { view: true },
    expense: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true },
    // Admin-only modules — boss is BLOCKED
    staff: { view: false, add: false, edit: false, delete: false },
    venueSettings: { view: false, edit: false },
    minAmount: { view: false, edit: false },
  },
  purchase: {
    purchase: { view: true, add: true, edit: true, delete: true },
    income: { view: false, add: false },
    reservation: { view: true, add: true, edit: true, delete: false },
  },
  chef: {
    announcement: { view: true, add: false, edit: false, delete: false },
    income: { view: false, add: false },
    purchase: { view: false, add: false },
  },
}

module.exports = { TEST_ACCOUNTS, PAGES, ROLE_PERMISSIONS }
