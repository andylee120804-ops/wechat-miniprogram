const TEST_ACCOUNTS = {
  boss: { wechatId: 'boss_test', phone: '13800000001' },
  admin: { wechatId: 'admin_test', phone: '13800000002' },
  purchase: { wechatId: 'purchase_test', phone: '13800000003' },
  chef: { wechatId: 'chef_test', phone: '13800000004' },
  waiter: { wechatId: 'waiter_test', phone: '13800000005' },
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
}

module.exports = { TEST_ACCOUNTS, PAGES }
