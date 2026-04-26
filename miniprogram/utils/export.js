/**
 * export.js - Data export utilities
 * Generates structured monthly summaries and formats amounts for export.
 */

var { formatAmount } = require('./helpers')

/**
 * Generate a monthly summary data object for export/canvas rendering.
 * Aggregates income, purchase, and expense data for a given month.
 * @param {Array} incomeData - Array of income records for the month
 * @param {Array} purchaseData - Array of purchase records for the month
 * @param {Array} expenseData - Array of expense records for the month
 * @param {string} monthStr - Month string in YYYY-MM format
 * @returns {Object} Structured summary data
 */
function generateMonthlySummary(incomeData, purchaseData, expenseData, monthStr) {
  incomeData = incomeData || []
  purchaseData = purchaseData || []
  expenseData = expenseData || []

  // Calculate total income
  var totalIncome = 0
  var incomeByType = {}
  for (var i = 0; i < incomeData.length; i++) {
    var amount = Number(incomeData[i].amount) || 0
    totalIncome += amount
    var type = incomeData[i].type || 'other'
    incomeByType[type] = (incomeByType[type] || 0) + amount
  }

  // Calculate total purchases
  var totalPurchase = 0
  var purchaseByCategory = {}
  for (var j = 0; j < purchaseData.length; j++) {
    var pAmount = Number(purchaseData[j].totalAmount || purchaseData[j].amount) || 0
    totalPurchase += pAmount
    var category = purchaseData[j].category || 'other'
    purchaseByCategory[category] = (purchaseByCategory[category] || 0) + pAmount
  }

  // Calculate total expenses
  var totalExpense = 0
  var expenseByCategory = {}
  for (var k = 0; k < expenseData.length; k++) {
    var eAmount = Number(expenseData[k].amount) || 0
    totalExpense += eAmount
    var eCat = expenseData[k].category || 'other'
    expenseByCategory[eCat] = (expenseByCategory[eCat] || 0) + eAmount
  }

  // Net profit calculation
  var netProfit = totalIncome - totalPurchase - totalExpense

  // Build income breakdown for charts
  var incomeBreakdown = Object.keys(incomeByType).map(function(type) {
    return {
      type: type,
      amount: incomeByType[type],
      formatted: formatExportAmount(incomeByType[type]),
      percentage: totalIncome > 0 ? (incomeByType[type] / totalIncome * 100).toFixed(1) : '0.0'
    }
  })

  // Build purchase breakdown for charts
  var purchaseBreakdown = Object.keys(purchaseByCategory).map(function(cat) {
    return {
      category: cat,
      amount: purchaseByCategory[cat],
      formatted: formatExportAmount(purchaseByCategory[cat]),
      percentage: totalPurchase > 0 ? (purchaseByCategory[cat] / totalPurchase * 100).toFixed(1) : '0.0'
    }
  })

  // Build expense breakdown for charts
  var expenseBreakdown = Object.keys(expenseByCategory).map(function(cat) {
    return {
      category: cat,
      amount: expenseByCategory[cat],
      formatted: formatExportAmount(expenseByCategory[cat]),
      percentage: totalExpense > 0 ? (expenseByCategory[cat] / totalExpense * 100).toFixed(1) : '0.0'
    }
  })

  return {
    month: monthStr,
    generatedAt: new Date().toISOString(),

    // Totals
    totalIncome: totalIncome,
    totalPurchase: totalPurchase,
    totalExpense: totalExpense,
    netProfit: netProfit,

    // Formatted totals
    totalIncomeFormatted: formatExportAmount(totalIncome),
    totalPurchaseFormatted: formatExportAmount(totalPurchase),
    totalExpenseFormatted: formatExportAmount(totalExpense),
    netProfitFormatted: formatExportAmount(netProfit),

    // Breakdowns for charts/rendering
    incomeBreakdown: incomeBreakdown,
    purchaseBreakdown: purchaseBreakdown,
    expenseBreakdown: expenseBreakdown,

    // Record counts
    incomeCount: incomeData.length,
    purchaseCount: purchaseData.length,
    expenseCount: expenseData.length
  }
}

/**
 * Format an amount as currency string for export display.
 * @param {number} amount - The numeric amount
 * @returns {string} Formatted string like "¥1,234.56"
 */
function formatExportAmount(amount) {
  return '¥' + Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

module.exports = {
  generateMonthlySummary: generateMonthlySummary,
  formatExportAmount: formatExportAmount
}
