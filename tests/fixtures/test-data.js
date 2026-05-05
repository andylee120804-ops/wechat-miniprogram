// Real wechatId that exists in the staff collection
const TEST_ACCOUNTS = {
  boss: { wechatId: 'a', expectedRole: 'boss' },
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
