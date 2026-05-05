// Real wechatId that exists in the staff collection
// These must be pre-created in the cloud database `staff` collection
// Verified mappings: a=boss, e=chef (厨师)
const TEST_ACCOUNTS = {
  boss: { wechatId: 'a', expectedRole: 'boss' },
  admin: { wechatId: 'b', expectedRole: 'admin' },
  purchase: { wechatId: 'c', expectedRole: 'purchase' },
  chef: { wechatId: 'e', expectedRole: 'chef' },
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
}

// Expected permissions per role for key modules
// Boss gets wildcard '*', others depend on cloud database `permissions` collection
const ROLE_PERMISSIONS = {
  boss: {
    income: { view: true, add: true, edit: true, delete: true },
    purchase: { view: true, add: true, edit: true, delete: true },
    reservation: { view: true, add: true, edit: true, delete: true },
    announcement: { view: true, add: true, edit: true, delete: true },
    dashboard: { view: true },
    staff: { view: true, add: true, edit: true, delete: true },
    expense: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true },
  },
  // admin typically has most permissions except some dashboard features
  admin: {
    income: { view: true, add: true, edit: true, delete: true },
    purchase: { view: true, add: true, edit: true, delete: true },
    reservation: { view: true, add: true, edit: true, delete: true },
    announcement: { view: true, add: true, edit: true, delete: true },
  },
  // purchase role: can manage purchases, view reservations, but limited income access
  purchase: {
    purchase: { view: true, add: true, edit: true, delete: true },
    income: { view: false, add: false },
  },
  // chef/waiter: typically view-only or no access to financial modules
  waiter: {
    income: { view: false, add: false },
    purchase: { view: false, add: false },
    announcement: { view: true, add: false, edit: false },
  },
}

module.exports = { TEST_ACCOUNTS, PAGES, ROLE_PERMISSIONS }
