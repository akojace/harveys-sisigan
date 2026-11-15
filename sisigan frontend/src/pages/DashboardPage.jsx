// src/pages/DashboardPage.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, expensesApi, notificationsApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Button, EmptyState } from '../components/ui'
import { useIsMobile } from '../hooks/useIsMobile'
import ExcelJS from 'exceljs'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#b45309', '#d97706', '#f59e0b', '#92400e', '#78350f', '#fbbf24', '#a16207', '#ca8a04']

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
]

// ── Shared styles ──────────────────────────────────────────────────────────────
const dateInputStyle = {
  display: 'block', marginTop: 5, width: '100%', padding: '9px 12px',
  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 13.5,
  color: 'var(--brown-800)', background: '#fff', boxSizing: 'border-box', cursor: 'pointer',
}
const primaryBtnStyle = {
  flex: 1, padding: '10px 0', borderRadius: 'var(--radius-full)', border: 'none',
  background: 'var(--gradient-primary)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(180,83,9,0.28)', transition: 'all 180ms ease',
}
const secondaryBtnStyle = {
  flex: 1, padding: '10px 0', borderRadius: 'var(--radius-full)',
  border: '1.5px solid var(--border)', background: '#fff',
  color: 'var(--brown-700)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
  transition: 'all 180ms ease',
}
//   style for the small "reset" ghost button used in CustomRangePicker
const resetBtnStyle = {
  width: '100%', padding: '9px 0', borderRadius: 'var(--radius-full)',
  border: '1.5px dashed var(--border)', background: 'transparent',
  color: 'var(--text-muted)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
  marginTop: 10, transition: 'all 180ms ease',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function getPeriodLabel(period, customStart, customEnd) {
  if (period === 'today') return 'Today'
  if (period === 'week') return 'This Week'
  if (period === 'month') return 'This Month'
  if (period === 'custom' && customStart && customEnd) return `${customStart} to ${customEnd}`
  return 'Custom'
}

//   helper to get today's date as YYYY-MM-DD in local time (used to default the Sales Report range)
function todayISO() {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d - tzOffset).toISOString().slice(0, 10)
}

// ── Shared logo loader ──────────────────────────────────────────────────────────
//   fetches the establishment logo once as an ArrayBuffer so it can be embedded
//   into a workbook via wb.addImage(). Update the path/extension if the logo
//   file or format ever changes (served from /public, so root-relative works).
async function loadLogoImage(wb) {
  const resp = await fetch('/logo1.jpg')
  const buffer = await resp.arrayBuffer()
  return wb.addImage({ buffer, extension: 'jpeg' })
}

//   shared "write workbook to disk" helper used by both exports below
async function writeWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Excel download (full dashboard export) ─────────────────────────────────────
//   built with ExcelJS so the logo can sit beside the establishment name on the
//   Summary sheet (SheetJS/xlsx community edition can't embed images).
async function downloadExcel(data, periodLabel, branchLabel) {
  const s = data?.summary || {}
  const wb = new ExcelJS.Workbook()
  const logoId = await loadLogoImage(wb)

  // Sheet 1: Summary
  const wsSummary = wb.addWorksheet('Summary')
  wsSummary.columns = [{ width: 26 }, { width: 20 }]

  wsSummary.getRow(1).height = 24
  wsSummary.getRow(2).height = 24
  wsSummary.getRow(3).height = 24

  wsSummary.addImage(logoId, {
    tl: { col: 0, row: 0 },
    ext: { width: 64, height: 64 },
  })

  wsSummary.mergeCells('B1:B3')
  const nameCell = wsSummary.getCell('B1')
  nameCell.value = "Harvey's Special Crispy Sisig"
  nameCell.font = { bold: true, size: 16, name: 'Arial' }
  nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

  const summaryRows = [
    ['Period', periodLabel],
    ['Branch', branchLabel],
    ['Total Sales (PHP)', Number(s.totalSales || 0)],
    ['Completed Orders', Number(s.totalOrders || 0)],
    ['All Orders', Number(s.allOrdersCount || 0)],
    ['Cancelled Orders', Number(s.cancelledCount || 0)],
    ['Avg Order Value (PHP)', Number(s.avgOrderValue || 0)],
  ]

  const summaryHeaderRow = wsSummary.getRow(5)
  summaryHeaderRow.getCell(1).value = 'Metric'
  summaryHeaderRow.getCell(2).value = 'Value'
  summaryHeaderRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FF78350F' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFD97706' } } }
  })

  summaryRows.forEach((r, i) => {
    const row = wsSummary.getRow(6 + i)
    row.getCell(1).value = r[0]
    row.getCell(2).value = r[1]
  })

  // Sheet 2: Sales Trend
  if (data?.salesTrend?.length) {
    const wsTrend = wb.addWorksheet('Sales Trend')
    wsTrend.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Sales (PHP)', key: 'sales', width: 16 },
      { header: 'Orders', key: 'orders', width: 10 },
    ]
    wsTrend.getRow(1).font = { bold: true }
    data.salesTrend.forEach(r => {
      wsTrend.addRow({
        date: r.date,
        sales: Number(r.sales || 0),
        orders: Number(r.orders || 0),
      })
    })
  }

  // Sheet 3: Best Sellers
  if (data?.bestSellers?.length) {
    const wsSellers = wb.addWorksheet('Best Sellers')
    wsSellers.columns = [
      { header: 'Rank', key: 'rank', width: 6 },
      { header: 'Menu Item', key: 'name', width: 32 },
      { header: 'Qty Sold', key: 'qty', width: 12 },
      { header: 'Revenue (PHP)', key: 'revenue', width: 18 },
    ]
    wsSellers.getRow(1).font = { bold: true }
    data.bestSellers.forEach((item, i) => {
      wsSellers.addRow({
        rank: i + 1,
        name: item.name,
        qty: item.qty,
        revenue: Number(item.revenue || 0),
      })
    })
  }

  // Sheet 4: Sales by Category
  if (data?.salesByCategory?.length) {
    const wsCat = wb.addWorksheet('By Category')
    wsCat.columns = [
      { header: 'Category', key: 'name', width: 20 },
      { header: 'Sales (PHP)', key: 'value', width: 18 },
    ]
    wsCat.getRow(1).font = { bold: true }
    data.salesByCategory.forEach(c => {
      wsCat.addRow({ name: c.name, value: Number(c.value || 0) })
    })
  }

  // Sheet 5: Payment Methods
  if (data?.paymentBreakdown?.length) {
    const wsPay = wb.addWorksheet('Payment Methods')
    wsPay.columns = [
      { header: 'Method', key: 'method', width: 18 },
      { header: 'Total (PHP)', key: 'total', width: 16 },
      { header: 'Transactions', key: 'count', width: 14 },
    ]
    wsPay.getRow(1).font = { bold: true }
    data.paymentBreakdown.forEach(p => {
      wsPay.addRow({ method: p.method, total: Number(p.total || 0), count: p.count })
    })
  }

  // Sheet 6: Branch comparison (owner only)
  if (data?.salesByBranch?.length) {
    const wsBranch = wb.addWorksheet('By Branch')
    wsBranch.columns = [
      { header: 'Branch', key: 'name', width: 24 },
      { header: 'Sales (PHP)', key: 'sales', width: 16 },
    ]
    wsBranch.getRow(1).font = { bold: true }
    data.salesByBranch.forEach(b => {
      wsBranch.addRow({ name: b.name, sales: Number(b.sales || 0) })
    })
  }

  const slug = periodLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
  await writeWorkbook(wb, `dashboard_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

//   dedicated Excel export for the itemized Sales Report (all meals bought in the range)
//   built with ExcelJS so the logo sits beside the establishment name.
async function downloadSalesReportExcel(data, periodLabel, branchLabel) {
  const s = data?.summary || {}
  const items = (data?.allSellers || data?.bestSellers || [])
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sales Report')
  const logoId = await loadLogoImage(wb)

  ws.columns = [
    { width: 6 },   // #
    { width: 38 },  // Meal / Item
    { width: 14 },  // Qty Sold
    { width: 20 },  // Revenue
  ]

  // ── Logo (col A) + establishment name (cols B–D, merged) ──────────────
  ws.getRow(1).height = 24
  ws.getRow(2).height = 24
  ws.getRow(3).height = 24

  ws.addImage(logoId, {
    tl: { col: 0, row: 0 },
    ext: { width: 64, height: 64 },
  })

  ws.mergeCells('B1:D3')
  const nameCell = ws.getCell('B1')
  nameCell.value = "Harvey's Special Crispy Sisig"
  nameCell.font = { bold: true, size: 20, name: 'Arial' }
  nameCell.alignment = { vertical: 'middle', horizontal: 'left' }

  // ── Meta rows ───────────────────────────────────────────────────────────
  ws.getCell('A5').value = 'Sales Report'
  ws.getCell('A5').font = { bold: true, size: 14 }

  ws.getCell('A6').value = 'Range:'
  ws.getCell('B6').value = periodLabel
  ws.getCell('A7').value = 'Branch:'
  ws.getCell('B7').value = branchLabel
  ws.getCell('A8').value = 'Generated:'
  ws.getCell('B8').value = new Date().toLocaleString('en-PH')

  ws.getCell('A10').value = 'TOTAL SALES (PHP)'
  ws.getCell('B10').value = Number(s.totalSales || 0)
  ws.getCell('A10').font = { bold: true }

  ws.getCell('A11').value = 'TOTAL MEALS SOLD'
  ws.getCell('B11').value = totalQty
  ws.getCell('A11').font = { bold: true }

  // ── Table header ─────────────────────────────────────────────────────
  const headerRowIdx = 13
  const headers = ['#', 'MEAL / ITEM', 'QTY SOLD', 'REVENUE (PHP)']
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FF78350F' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFD97706' } } }
  })

  // ── Item rows (no limit — every meal sold in the range) ────────────────
  items.forEach((item, i) => {
    const row = headerRowIdx + 1 + i
    ws.getCell(row, 1).value = i + 1
    ws.getCell(row, 2).value = item.name
    ws.getCell(row, 3).value = Number(item.qty || 0)
    ws.getCell(row, 4).value = Number(item.revenue || 0)
  })

  // ── Total row ───────────────────────────────────────────────────────
  const totalRow = headerRowIdx + 1 + items.length
  ws.getCell(totalRow, 2).value = 'TOTAL'
  ws.getCell(totalRow, 3).value = totalQty
  ws.getCell(totalRow, 4).value = Number(s.totalSales || 0)
  ;[2, 3, 4].forEach(c => {
    ws.getCell(totalRow, c).font = { bold: true }
    ws.getCell(totalRow, c).border = { top: { style: 'medium', color: { argb: 'FFD97706' } } }
  })

  const slug = periodLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
  await writeWorkbook(wb, `sales_report_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ADDED — Excel export for the Profit Report. Mirrors downloadSalesReportExcel's
// structure/styling, but adds Cost and Profit columns, and clearly flags any
// item whose cost isn't computable yet (missing recipe/ingredient price)
// instead of silently showing ₱0 cost.
async function downloadProfitReportExcel(data, periodLabel, branchLabel) {
  const s = data?.summary || {}
  const items = data?.items || []

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Profit Report')
  const logoId = await loadLogoImage(wb)

  ws.columns = [
    { width: 6 },   // #
    { width: 32 },  // Meal / Item
    { width: 12 },  // Qty Sold
    { width: 18 },  // Gross Revenue
    { width: 14 },  // Discounts
    { width: 18 },  // Net Revenue
    { width: 18 },  // COGS / Cost
    { width: 18 },  // Gross Profit
    { width: 14 },  // Margin %
    { width: 22 },  // Status
  ]

  ws.getRow(1).height = 24
  ws.getRow(2).height = 24
  ws.getRow(3).height = 24

  ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 64, height: 64 } })

  ws.mergeCells('B1:J3')
  const nameCell = ws.getCell('B1')
  nameCell.value = "Harvey's Special Crispy Sisig"
  nameCell.font = { bold: true, size: 20, name: 'Arial' }
  nameCell.alignment = { vertical: 'middle', horizontal: 'left' }

  ws.getCell('A5').value = 'Executive Profit & Financial Statement'
  ws.getCell('A5').font = { bold: true, size: 14 }

  ws.getCell('A6').value = 'Range:'
  ws.getCell('B6').value = periodLabel
  ws.getCell('A7').value = 'Branch:'
  ws.getCell('B7').value = branchLabel
  ws.getCell('A8').value = 'Generated:'
  ws.getCell('B8').value = new Date().toLocaleString('en-PH')

  const pnlSummary = [
    ['Gross Sales (PHP)', Number(s.grossSales || s.totalRevenue || 0)],
    ['Discounts (PHP)', Number(s.discounts || 0)],
    ['Net Sales (PHP)', Number(s.netSales || 0)],
    ['Cost of Goods Sold (COGS) (PHP)', Number(s.totalCogs || s.totalKnownCost || 0)],
    ['Gross Profit (PHP)', Number(s.grossProfit || s.totalKnownProfit || 0)],
    ['Gross Profit Margin', `${Number(s.grossProfitMargin || 0).toFixed(2)}%`],
    ['Operating Expenses (PHP)', Number(s.operatingExpenses || 0)],
    ['Net Profit (PHP)', Number(s.netProfit || 0)],
    ['Net Profit Margin', `${Number(s.netProfitMargin || 0).toFixed(2)}%`],
  ]

  pnlSummary.forEach((row, idx) => {
    const rowIdx = 10 + idx
    ws.getCell(`A${rowIdx}`).value = row[0]
    ws.getCell(`B${rowIdx}`).value = row[1]
    ws.getCell(`A${rowIdx}`).font = { bold: true }
  })

  let startItemIdx = 20
  if (s.itemsMissingCostCount > 0) {
    ws.getCell('A19').value =
      `⚠ ${s.itemsMissingCostCount} item(s) have unknown cost (₱${Number(s.revenueWithUnknownCost || 0).toFixed(2)} in revenue not included in cost above) — add ingredient prices under Menu > Recipes.`
    ws.getCell('A19').font = { italic: true, color: { argb: 'FFB91C1C' } }
    ws.mergeCells('A19:J19')
    startItemIdx = 21
  }

  const headerRowIdx = startItemIdx
  const headers = ['#', 'MEAL / ITEM', 'QTY SOLD', 'GROSS REV (PHP)', 'DISCOUNTS (PHP)', 'NET SALES (PHP)', 'COGS (PHP)', 'GROSS PROFIT (PHP)', 'MARGIN %', 'STATUS']
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FF78350F' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFD97706' } } }
  })

  items.forEach((item, i) => {
    const row = headerRowIdx + 1 + i
    ws.getCell(row, 1).value = i + 1
    ws.getCell(row, 2).value = item.name
    ws.getCell(row, 3).value = Number(item.qtySold || 0)
    ws.getCell(row, 4).value = Number(item.grossRevenue ?? item.revenue ?? 0)
    ws.getCell(row, 5).value = Number(item.discounts || 0)
    ws.getCell(row, 6).value = Number(item.netRevenue ?? item.revenue ?? 0)
    ws.getCell(row, 7).value = item.costKnown ? Number(item.cogs ?? item.cost ?? 0) : 'Unknown'
    ws.getCell(row, 8).value = item.costKnown ? Number(item.grossProfit ?? item.profit ?? 0) : 'Unknown'
    ws.getCell(row, 9).value = item.costKnown && item.grossProfitMargin != null ? `${Number(item.grossProfitMargin).toFixed(1)}%` : '—'
    ws.getCell(row, 10).value = item.costKnown ? 'OK' : 'Missing recipe/price'
    if (!item.costKnown) {
      ;[7, 8, 9, 10].forEach(c => { ws.getCell(row, c).font = { italic: true, color: { argb: 'FFB91C1C' } } })
    }
  })

  const totalRow = headerRowIdx + 1 + items.length
  ws.getCell(totalRow, 2).value = 'TOTAL'
  ws.getCell(totalRow, 3).value = items.reduce((sum, i) => sum + Number(i.qtySold || 0), 0)
  ws.getCell(totalRow, 4).value = Number(s.grossSales || s.totalRevenue || 0)
  ws.getCell(totalRow, 5).value = Number(s.discounts || 0)
  ws.getCell(totalRow, 6).value = Number(s.netSales || 0)
  ws.getCell(totalRow, 7).value = Number(s.totalCogs || s.totalKnownCost || 0)
  ws.getCell(totalRow, 8).value = Number(s.grossProfit || s.totalKnownProfit || 0)
  ws.getCell(totalRow, 9).value = `${Number(s.grossProfitMargin || 0).toFixed(1)}%`
  ;[2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(c => {
    ws.getCell(totalRow, c).font = { bold: true }
    ws.getCell(totalRow, c).border = { top: { style: 'medium', color: { argb: 'FFD97706' } } }
  })

  const slug = periodLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
  await writeWorkbook(wb, `profit_report_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

//   separate HTML builder for the itemized "Sales Report" (all meals bought in range)
function buildSalesReportHTML(data, periodLabel, branchLabel) {
  const s = data?.summary || {}
  const items = data?.allSellers || data?.bestSellers || []
  const totalQty = items.reduce((sum, it) => sum + Number(it.qty || 0), 0)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Sales Report – ${periodLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1c0a00; padding: 32px; }
    h1 { font-size: 22px; color: #92400e; margin-bottom: 4px; }
    .meta { font-size: 11px; color: #78716c; margin-bottom: 24px; }
    h2 { font-size: 14px; color: #92400e; margin: 24px 0 8px;
         border-bottom: 1.5px solid #d97706; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
    th { background: #fef3c7; color: #78350f; font-weight: 700; font-size: 10px;
         text-transform: uppercase; padding: 7px 10px; text-align: left;
         border-bottom: 2px solid #d97706; letter-spacing: 0.3px; }
    td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #fffbeb; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; border-top: 2px solid #d97706; border-bottom: none; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
    .stat-box { background: #fef3c7; border: 1px solid #d97706; border-radius: 8px; padding: 12px 16px; }
    .stat-label { font-size: 10px; text-transform: uppercase; color: #92400e; font-weight: 700; margin-bottom: 4px; }
    .stat-val { font-size: 18px; font-weight: 700; color: #78350f; }
    @media print {
      body { padding: 16px; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Sales Report</h1>
  <div class="meta">
    Range: <strong>${periodLabel}</strong> &nbsp;·&nbsp;
    Branch: <strong>${branchLabel}</strong> &nbsp;·&nbsp;
    Generated: ${new Date().toLocaleString('en-PH')}
  </div>

  <div class="summary-grid">
    <div class="stat-box">
      <div class="stat-label">Total Sales</div>
      <div class="stat-val">PHP ${Number(s.totalSales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Total Meals Sold</div>
      <div class="stat-val">${totalQty.toLocaleString()}</div>
    </div>
  </div>

  <h2>Meals Bought (${items.length} item${items.length !== 1 ? 's' : ''})</h2>
  ${items.length ? `
  <table>
    <thead><tr><th>#</th><th>Meal / Item</th><th class="num">Qty Sold</th><th class="num">Revenue (PHP)</th></tr></thead>
    <tbody>
      ${items.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.name}</td>
          <td class="num">${item.qty}</td>
          <td class="num">${Number(item.revenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td></td>
        <td>Total</td>
        <td class="num">${totalQty}</td>
        <td class="num">${Number(s.totalSales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>` : `<p style="color:#78716c;">No meals were sold in this date range.</p>`}
</body>
</html>`
}

// ── Custom Range Picker (matches ForecastPage style) ───────────────────────────
//   added an `onReset` prop + Reset button so the picked custom range can be cleared
function CustomRangePicker({ startDate, endDate, onChange, onClose, onReset }) {
  const [localStart, setLocalStart] = useState(startDate || '')
  const [localEnd, setLocalEnd] = useState(endDate || '')
  const ref = useRef(null)
  // ADDED — on mobile, render inline (pushing content down) instead of
  // absolutely-positioned floating over the stat cards below. The
  // floating version was anchored to the "Custom" button's own position
  // with a fixed minWidth of 290px, which doesn't fit cleanly anywhere
  // on a narrow screen and ends up covering nearby content instead.
  const isMobile = useIsMobile()

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function handleApply() {
    if (!localStart || !localEnd || localStart > localEnd) return
    onChange(localStart, localEnd)
    onClose()
  }

  //   clears both the local inputs and the parent's stored custom range
  function handleReset() {
    setLocalStart('')
    setLocalEnd('')
    onReset()
  }

  const dayCount = useMemo(() => {
    if (!localStart || !localEnd) return 0
    return Math.max(0, Math.round((new Date(localEnd) - new Date(localStart)) / 86400000))
  }, [localStart, localEnd])

  const isValid = localStart && localEnd && localStart <= localEnd

  return (
    <div ref={ref} style={isMobile ? {
      position: 'static', width: '100%', marginTop: 10,
      background: 'var(--cream)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
      padding: 16, boxSizing: 'border-box',
    } : {
      position: 'absolute', top: '110%', right: 0, zIndex: 100,
      background: 'var(--cream)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
      padding: 20, minWidth: 290,
    }}>
      <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13.5, color: 'var(--brown-800)' }}>
        Select Date Range
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          Start Date
          <input type="date" value={localStart} max={localEnd || undefined}
            onChange={e => setLocalStart(e.target.value)} style={dateInputStyle} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          End Date
          <input type="date" value={localEnd} min={localStart || undefined}
            onChange={e => setLocalEnd(e.target.value)} style={dateInputStyle} />
        </label>
      </div>

      {isValid && (
        <div style={{
          margin: '12px 0', padding: '9px 12px', background: 'var(--brown-50)',
          borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--brown-700)', fontWeight: 600,
        }}>
          {dayCount === 0 ? 'Same day' : `${dayCount} day${dayCount !== 1 ? 's' : ''} selected`}
        </div>
      )}

      {localStart && localEnd && localStart > localEnd && (
        <div style={{ margin: '10px 0', fontSize: 12.5, color: '#dc2626' }}>
          End date must be after start date.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
        <button onClick={handleApply} disabled={!isValid}
          style={{ ...primaryBtnStyle, opacity: isValid ? 1 : 0.45, cursor: isValid ? 'pointer' : 'not-allowed', boxShadow: isValid ? primaryBtnStyle.boxShadow : 'none' }}>
          Apply
        </button>
      </div>

      {/*   Reset button — clears the currently applied custom range */}
      {(startDate || endDate) && (
        <button onClick={handleReset} style={resetBtnStyle}>
          ✕ Reset Range
        </button>
      )}
    </div>
  )
}

// Print Preview Modal — shows the generated report HTML inside an iframe
// so the user can review it before printing/downloading, instead of jumping
// straight into the browser's print dialog.
function PrintPreviewModal({ html, title, onClose, onDownloadExcel }) {
  const iframeRef = useRef(null)

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (win) win.print()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,10,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 900,
        height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'var(--shadow-xl)',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 22px', borderBottom: '1.5px solid var(--border)', background: 'var(--cream)',
        }}>
          <strong style={{ fontSize: 15, color: 'var(--brown-800)', fontFamily: 'var(--font-display)' }}>🖨️ Print Preview — {title}</strong>
          <div style={{ display: 'flex', gap: 10 }}>
            {onDownloadExcel && (
              <button onClick={onDownloadExcel} style={{
                padding: '8px 16px', borderRadius: 'var(--radius-full)',
                border: '1.5px solid var(--border)', background: '#fff',
                color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              }}>📊 Excel</button>
            )}
            <button onClick={handlePrint} style={{
              padding: '8px 18px', borderRadius: 'var(--radius-full)', border: 'none',
              background: 'var(--gradient-primary)', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(180,83,9,0.28)',
            }}>Print / Save as PDF</button>
            <button onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 'var(--radius-full)',
              border: '1.5px solid var(--border)', background: 'transparent',
              color: 'var(--brown-700)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            }}>Close</button>
          </div>
        </div>

        {/* Preview body */}
        <iframe ref={iframeRef} title="report-preview" srcDoc={html}
          style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />
      </div>
    </div>
  )
}

//   Sales Report Modal — lets the user pick a date range (default = today,
// real-time), view every meal/item bought in that range, then print-preview,
// print/download as PDF, or export to Excel.
function SalesReportModal({ branchId, branches, branchLabel, isOwner, onClose }) {
  const today = todayISO()
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(false)

  const reportBranchLabel = useMemo(() => {
    return branchLabel || 'All Branches'
  }, [branchLabel])

  const rangeLabel = start === end ? start : `${start} to ${end}`

  const fetchReport = useCallback(async () => {
    if (!start || !end || start > end) return
    setLoading(true)
    try {
      const params = { period: 'custom', from: start, to: end }
      if (branchId) params.branchId = branchId
      const res = await dashboardApi.get(params)
      setReportData(res.data)
    } finally {
      setLoading(false)
    }
  }, [start, end, branchId])

  useEffect(() => { fetchReport() }, [fetchReport])

  //   resets the report's own date range back to today (real-time)
  function handleResetRange() {
    setStart(today)
    setEnd(today)
  }

  const items = reportData?.allSellers || reportData?.bestSellers || []
  const totalQty = items.reduce((sum, it) => sum + Number(it.qty || 0), 0)
  const isValidRange = start && end && start <= end

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(28,10,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
        padding: 24,
      }}>
        <div style={{
          background: 'var(--cream)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 780,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '18px 22px', borderBottom: '1.5px solid var(--border)',
          }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--brown-800)' }}>
                Sales Report
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{branchLabel}</p>
            </div>
            <button onClick={onClose} style={{
              border: 'none', background: 'var(--brown-50)', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)',
              borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>

          {/* Date range controls — defaults to real-time today, fully adjustable */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
            padding: '16px 22px', borderBottom: '1.5px solid var(--border)',
          }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
              From
              <input type="date" value={start} max={end}
                onChange={e => setStart(e.target.value)} style={dateInputStyle} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
              To
              <input type="date" value={end} min={start} max={today}
                onChange={e => setEnd(e.target.value)} style={dateInputStyle} />
            </label>
            <button onClick={handleResetRange} style={{
              padding: '9px 16px', borderRadius: 'var(--radius-full)',
              border: '1.5px dashed var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
            }}>↺ Reset to Today</button>

            <div style={{ flex: 1 }} />

            <button onClick={() => setShowPreview(true)} disabled={!reportData}
              style={{
                padding: '9px 18px', borderRadius: 'var(--radius-full)', border: 'none',
                background: reportData ? 'var(--gradient-primary)' : '#e5e7eb', color: '#fff', fontWeight: 700, fontSize: 12.5,
                cursor: reportData ? 'pointer' : 'not-allowed',
                boxShadow: reportData ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
              }}>🖨️ Preview Report</button>
            <button onClick={() => downloadSalesReportExcel(reportData, rangeLabel, branchLabel)} disabled={!reportData}
              style={{
                padding: '9px 18px', borderRadius: 'var(--radius-full)',
                border: '1.5px solid var(--border)', background: '#fff',
                color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5,
                cursor: reportData ? 'pointer' : 'not-allowed', opacity: reportData ? 1 : 0.5,
              }}>📊 Excel</button>
          </div>

          {!isValidRange && (
            <div style={{ padding: '12px 22px', fontSize: 12.5, color: '#dc2626' }}>
              "To" date must be on or after "From" date.
            </div>
          )}

          {/* Itemized meals table */}
          <div style={{ overflowY: 'auto', padding: '18px 22px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 44, color: 'var(--text-muted)' }}>Loading report…</div>
            ) : items.length ? (
              <>
                <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
                  <StatCard label="Total Sales" value={fmt(reportData?.summary?.totalSales || 0)} />
                  <StatCard label="Total Meals Sold" value={totalQty} />
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--brown-50)' }}>
                      {['#', 'Meal / Item', 'Qty Sold', 'Revenue'].map(h => (
                        <th key={h} style={{
                          padding: '11px 14px',
                          textAlign: h === '#' || h === 'Qty Sold' || h === 'Revenue' ? 'center' : 'left',
                          fontWeight: 700, color: 'var(--text-muted)',
                          borderBottom: '1px solid var(--border)',
                          fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.id || item.name} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--text-faint)', fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>{item.name}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-700)' }}>{item.qty}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{fmt(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <EmptyState icon="📑" title="No meals sold in this date range" />
            )}
          </div>
        </div>
      </div>

      {showPreview && reportData && (
        <PrintPreviewModal
          title={`Sales Report (${rangeLabel})`}
          html={buildSalesReportHTML(reportData, rangeLabel, branchLabel)}
          onClose={() => setShowPreview(false)}
          onDownloadExcel={() => downloadSalesReportExcel(reportData, rangeLabel, branchLabel)}
        />
      )}
    </>
  )
}

// ADDED — Profit Report Modal with full P&L financial breakdown
function ProfitReportModal({ branchId, branchLabel, onClose }) {
  const today = todayISO()
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)

  const rangeLabel = start === end ? start : `${start} to ${end}`
  const isValidRange = start && end && start <= end

  const fetchReport = useCallback(async () => {
    if (!start || !end || start > end) return
    setLoading(true)
    try {
      const params = { period: 'custom', from: start, to: end }
      if (branchId) params.branchId = branchId
      const res = await dashboardApi.profit(params)
      setReportData(res.data)
    } finally {
      setLoading(false)
    }
  }, [start, end, branchId])

  useEffect(() => { fetchReport() }, [fetchReport])

  function handleResetRange() {
    setStart(today)
    setEnd(today)
  }

  const s = reportData?.summary || {}
  const items = reportData?.items || []

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,10,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
      padding: 24,
    }}>
      <div style={{
        background: 'var(--cream)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 1040,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'var(--shadow-xl)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px', borderBottom: '1.5px solid var(--border)', background: 'var(--cream)',
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--brown-800)', margin: 0 }}>
              💰 Executive Profit & Financial Report
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, margin: 0 }}>{branchLabel} — Audited COGS & Margin Analysis</p>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'var(--brown-100)', fontSize: 16, cursor: 'pointer', color: 'var(--brown-700)',
            borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Date range controls */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
          padding: '16px 24px', borderBottom: '1.5px solid var(--border)', background: '#fff',
        }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            From
            <input type="date" value={start} max={end}
              onChange={e => setStart(e.target.value)} style={dateInputStyle} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            To
            <input type="date" value={end} min={start} max={today}
              onChange={e => setEnd(e.target.value)} style={dateInputStyle} />
          </label>
          <button onClick={handleResetRange} style={{
            padding: '9px 16px', borderRadius: 'var(--radius-full)',
            border: '1.5px dashed var(--border)', background: 'transparent',
            color: 'var(--text-muted)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
          }}>↺ Reset to Today</button>

          <div style={{ flex: 1 }} />

          <button onClick={() => downloadProfitReportExcel(reportData, rangeLabel, branchLabel)} disabled={!reportData}
            style={{
              padding: '9px 20px', borderRadius: 'var(--radius-full)',
              border: '1.5px solid var(--border)', background: '#fff',
              color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5,
              cursor: reportData ? 'pointer' : 'not-allowed', opacity: reportData ? 1 : 0.5,
              boxShadow: 'var(--shadow-sm)',
            }}>📊 Export Detailed Excel</button>
        </div>

        {!isValidRange && (
          <div style={{ padding: '12px 24px', fontSize: 12.5, color: '#dc2626', background: '#fee2e2' }}>
            "To" date must be on or after "From" date.
          </div>
        )}

        <div style={{ overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>Loading audited profit metrics…</div>
          ) : items.length ? (
            <>
              {/* Financial Waterfall Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}>
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Sales</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brown-800)', marginTop: 4 }}>{fmt(s.grossSales || s.totalRevenue || 0)}</div>
                </div>
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Discounts</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>-{fmt(s.discounts || 0)}</div>
                </div>
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Sales</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brown-800)', marginTop: 4 }}>{fmt(s.netSales || 0)}</div>
                </div>
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>COGS (Cost)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brown-700)', marginTop: 4 }}>{fmt(s.totalCogs || s.totalKnownCost || 0)}</div>
                </div>
                <div style={{ background: '#f0fdf4', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Gross Profit</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d', marginTop: 4 }}>{fmt(s.grossProfit || s.totalKnownProfit || 0)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', marginTop: 2 }}>{s.grossProfitMargin || 0}% margin</div>
                </div>
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operating Exp.</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brown-800)', marginTop: 4 }}>{fmt(s.operatingExpenses || 0)}</div>
                </div>
                <div style={{
                  background: (s.netProfit || 0) >= 0 ? '#ecfdf5' : '#fef2f2',
                  padding: '14px 16px', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${(s.netProfit || 0) >= 0 ? '#6ee7b7' : '#fca5a5'}`
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: (s.netProfit || 0) >= 0 ? '#065f46' : '#991b1b', textTransform: 'uppercase' }}>Net Profit</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: (s.netProfit || 0) >= 0 ? '#047857' : '#dc2626', marginTop: 4 }}>{fmt(s.netProfit || 0)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: (s.netProfit || 0) >= 0 ? '#065f46' : '#991b1b', marginTop: 2 }}>{s.netProfitMargin || 0}% margin</div>
                </div>
              </div>

              {s.itemsMissingCostCount > 0 && (
                <div style={{
                  background: 'var(--red-light, #fee2e2)', border: '1px solid #fca5a5',
                  borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16,
                  fontSize: 12.5, color: '#991b1b',
                }}>
                  ⚠ {s.itemsMissingCostCount} item(s) have unconfigured recipe costs — ₱{fmt(s.revenueWithUnknownCost || 0).replace('₱', '')} in revenue isn't reflected in the profit total above. Configure recipes under <strong>Menu &gt; Recipes</strong>.
                </div>
              )}

              <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--brown-50)' }}>
                      {['#', 'Meal / Item', 'Qty Sold', 'Gross Rev', 'Discounts', 'Net Sales', 'COGS (Cost)', 'Gross Profit', 'Margin'].map(h => (
                        <th key={h} style={{
                          padding: '11px 12px',
                          textAlign: h === '#' || h === 'Qty Sold' ? 'center' : h === 'Meal / Item' ? 'left' : 'right',
                          fontWeight: 700, color: 'var(--brown-800)',
                          borderBottom: '1.5px solid var(--border)',
                          fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.menuItemId} style={{ borderBottom: '1px solid var(--border-light)', opacity: item.costKnown ? 1 : 0.65 }}>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-faint)', fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-dark)' }}>{item.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-700)' }}>{item.qtySold}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>{fmt(item.grossRevenue ?? item.revenue)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>{item.discounts ? `-${fmt(item.discounts)}` : '₱0.00'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-800)' }}>{fmt(item.netRevenue ?? item.revenue)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-mid)' }}>
                          {item.costKnown ? fmt(item.cogs ?? item.cost) : <span style={{ color: '#b91c1c', fontStyle: 'italic', fontWeight: 600 }}>Unknown</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: item.costKnown ? '#15803d' : '#b91c1c' }}>
                          {item.costKnown ? fmt(item.grossProfit ?? item.profit) : <span style={{ fontStyle: 'italic' }}>Missing recipe</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-700)' }}>
                          {item.costKnown && item.grossProfitMargin != null ? `${item.grossProfitMargin}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState icon="💰" title="No completed sales in this date range" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Operating Expenses Management Modal ───────────────────────────────────────
function ExpensesModal({ branchId, branches, branchLabel, isOwner, onClose, onUpdated }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState(null)

  // Form state
  const [category, setCategory] = useState('SUPPLIES')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [selectedBranchId, setSelectedBranchId] = useState(branchId || (branches[0]?.id ? String(branches[0].id) : ''))

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (branchId) params.branchId = branchId
      const res = await expensesApi.list(params)
      setExpenses(res.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load operating expenses')
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  async function handleAddExpense(e) {
    e.preventDefault()
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a positive numeric expense amount')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await expensesApi.create({
        branchId: selectedBranchId ? parseInt(selectedBranchId, 10) : undefined,
        category,
        amount: numAmount,
        description: description.trim() || undefined,
        expenseDate,
      })
      setAmount('')
      setDescription('')
      setShowAddForm(false)
      await fetchExpenses()
      if (onUpdated) onUpdated()
    } catch (err) {
      setError(err.message || 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteExpense(id) {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return
    try {
      await expensesApi.delete(id)
      await fetchExpenses()
      if (onUpdated) onUpdated()
    } catch (err) {
      alert(err.message || 'Failed to delete expense')
    }
  }

  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,10,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
      padding: 24,
    }}>
      <div style={{
        background: 'var(--cream)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 840,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'var(--shadow-xl)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px', borderBottom: '1.5px solid var(--border)', background: 'var(--cream)',
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--brown-800)', margin: 0 }}>
              📋 Operating Expenses Management
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, margin: 0 }}>
              {branchLabel} — Rent, utilities, salaries, and operating costs for accurate Net Profit
            </p>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'var(--brown-100)', fontSize: 16, cursor: 'pointer', color: 'var(--brown-700)',
            borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Action bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 24px', borderBottom: '1.5px solid var(--border)', background: '#fff',
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Total Recorded: </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--brown-800)' }}>{fmt(totalSpent)}</span>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '8px 18px', borderRadius: 'var(--radius-full)', border: 'none',
              background: showAddForm ? 'var(--brown-200)' : 'var(--gradient-primary)',
              color: showAddForm ? 'var(--brown-800)' : '#fff', fontWeight: 700, fontSize: 12.5,
              cursor: 'pointer', boxShadow: showAddForm ? 'none' : '0 4px 14px rgba(180,83,9,0.28)',
            }}
          >
            {showAddForm ? '✕ Close Form' : '+ Record New Expense'}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div style={{ padding: '10px 24px', background: '#fee2e2', color: '#991b1b', fontSize: 13, borderBottom: '1px solid #fca5a5' }}>
            ⚠ {error}
          </div>
        )}

        {/* Add Expense Form */}
        {showAddForm && (
          <form onSubmit={handleAddExpense} style={{
            padding: '18px 24px', background: 'var(--brown-50)', borderBottom: '1.5px solid var(--border)',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end',
          }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brown-800)', display: 'block', marginBottom: 4 }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={dateInputStyle}>
                <option value="RENT">Rent</option>
                <option value="UTILITIES">Utilities (Electricity, Water, Gas)</option>
                <option value="SALARIES">Salaries & Wages</option>
                <option value="SUPPLIES">Supplies & Consumables</option>
                <option value="MAINTENANCE">Equipment Maintenance</option>
                <option value="OTHER">Other Operating Expense</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brown-800)', display: 'block', marginBottom: 4 }}>Amount (₱)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={dateInputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brown-800)', display: 'block', marginBottom: 4 }}>Expense Date</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={e => setExpenseDate(e.target.value)}
                style={dateInputStyle}
              />
            </div>

            {isOwner && branches.length > 0 && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brown-800)', display: 'block', marginBottom: 4 }}>Branch</label>
                <select value={selectedBranchId} onChange={e => setSelectedBranchId(e.target.value)} style={dateInputStyle}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brown-800)', display: 'block', marginBottom: 4 }}>Description / Notes</label>
              <input
                type="text"
                placeholder="e.g. November electric bill, Kitchen equipment grease trap cleaning"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={dateInputStyle}
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setShowAddForm(false)} style={secondaryBtnStyle}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...primaryBtnStyle, maxWidth: 160 }}>
                {saving ? 'Saving…' : 'Save Expense'}
              </button>
            </div>
          </form>
        )}

        {/* Expenses List */}
        <div style={{ overflowY: 'auto', padding: '18px 24px', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading expenses…</div>
          ) : expenses.length ? (
            <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--brown-50)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Category</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Description</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--brown-800)' }}>Branch</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--brown-800)' }}>Amount</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-800)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                        {new Date(e.expenseDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: 'var(--brown-100)', color: 'var(--brown-800)',
                        }}>
                          {e.category}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{e.description || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-dark)', fontWeight: 600 }}>{e.branch?.name || 'All'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--brown-800)' }}>
                        {fmt(e.amount)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteExpense(e.id)}
                          style={{
                            border: 'none', background: 'transparent', color: '#dc2626',
                            fontWeight: 700, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📋" title="No operating expenses recorded yet" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'var(--brown-800)', icon }) {
  return (
    <div style={{
      background: 'var(--cream)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '24px 26px', flex: 1, minWidth: 200,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 30, opacity: 0.6 }}>{icon}</span>}
      </div>
    </div>
  )
}

// ── Section ────────────────────────────────────────────────────────────────────
function Section({ title, children, style = {} }) {
  return (
    <div style={{
      background: 'var(--cream)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 24,
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column',
      ...style,
    }}>
      <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 17, marginBottom: 18, fontWeight: 700 }}>
        {title}
      </h3>
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

// ── Chart Tooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix = '₱' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, boxShadow: 'var(--shadow-md)' }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--brown-800)' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--brown-600)' }}>
          {p.name}: {prefix}{typeof p.value === 'number' ? p.value.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : p.value}
        </div>
      ))}
    </div>
  )
}

// ── Production-Ready Best Sellers Component with Multi-Branch Comparison ────────
function BestSellersSection({ comparisonData, limit, setLimit, isMobile }) {
  if (!comparisonData) return null

  const isComparison = Boolean(comparisonData.isComparison)
  const branches = isComparison
    ? (comparisonData.branches || [])
    : (comparisonData.branch ? [comparisonData.branch] : [])

  return (
    <div style={{
      background: 'var(--cream)',
      border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: isMobile ? 16 : 24,
      boxShadow: 'var(--shadow-sm)',
      marginBottom: 24,
    }}>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1.5px solid var(--border)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--brown-800)',
              fontSize: 20,
              fontWeight: 800,
              margin: 0,
            }}>
              🏆 Best-Selling Products
            </h3>
            {isComparison && (
              <span style={{
                background: 'var(--brown-100)',
                color: 'var(--brown-800)',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Branch Comparison
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, margin: 0 }}>
            {isComparison
              ? 'Independent product rankings and units sold per branch — Sta. Cruz, Lumban, and authorized branches'
              : 'Top performing menu items ranked by units sold for your assigned branch'}
          </p>
        </div>

        {/* Top 5 / Top 10 Toggle buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--brown-100)',
          padding: 3,
          borderRadius: 'var(--radius-full)',
        }}>
          <button
            type="button"
            onClick={() => setLimit(5)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: limit === 5 ? 'var(--gradient-primary)' : 'transparent',
              color: limit === 5 ? '#fff' : 'var(--brown-800)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: limit === 5 ? '0 2px 8px rgba(180,83,9,0.25)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            Top 5
          </button>
          <button
            type="button"
            onClick={() => setLimit(10)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: limit === 10 ? 'var(--gradient-primary)' : 'transparent',
              color: limit === 10 ? '#fff' : 'var(--brown-800)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: limit === 10 ? '0 2px 8px rgba(180,83,9,0.25)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            Top 10
          </button>
        </div>
      </div>

      {/* Grid of branches (Side-by-side comparison for Admin, single branch for Cashier) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isComparison
          ? (isMobile ? '1fr' : 'repeat(auto-fit, minmax(360px, 1fr))')
          : '1fr',
        gap: 20,
      }}>
        {branches.map((b) => {
          const items = (b.items || []).slice(0, limit)
          const hasSales = items.length > 0 && Number(b.totalUnitsSold || 0) > 0

          return (
            <div
              key={b.branchId}
              style={{
                background: '#fff',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Branch Header Card */}
              <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, var(--brown-50) 0%, #fff 100%)',
                borderBottom: '1.5px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>📍</span>
                    <strong style={{ fontSize: 16, color: 'var(--brown-800)', fontWeight: 800 }}>
                      {b.branchName}
                    </strong>
                    {b.city && (
                      <span style={{
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        background: 'var(--brown-100)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        {b.city}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Total Units Sold: <strong style={{ color: 'var(--brown-800)' }}>{b.totalUnitsSold || 0}</strong> &nbsp;·&nbsp;
                    Sales: <strong style={{ color: 'var(--green, #15803d)' }}>{fmt(b.totalRevenue)}</strong>
                  </div>
                </div>

                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--brown-700)',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                }}>
                  {items.length} {items.length === 1 ? 'Product' : 'Products'} Listed
                </span>
              </div>

              {/* Branch Items List */}
              <div style={{ flex: 1, padding: 12 }}>
                {!hasSales ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '36px 20px',
                    color: 'var(--text-muted)',
                  }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.6 }}>🍽️</span>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--brown-800)' }}>
                      No completed sales found for this period
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
                      Rankings update automatically when completed orders are recorded.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((item) => {
                      const rankBadge =
                        item.rank === 1 ? '🥇 #1' :
                        item.rank === 2 ? '🥈 #2' :
                        item.rank === 3 ? '🥉 #3' :
                        `#${item.rank}`

                      const rankBg =
                        item.rank === 1 ? '#fef3c7' :
                        item.rank === 2 ? '#f3f4f6' :
                        item.rank === 3 ? '#ffedd5' :
                        'var(--brown-50)'

                      const rankColor =
                        item.rank === 1 ? '#92400e' :
                        item.rank === 2 ? '#4b5563' :
                        item.rank === 3 ? '#9a3412' :
                        'var(--brown-700)'

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-light)',
                            background: '#fff',
                            transition: 'background 120ms ease',
                          }}
                        >
                          {/* Rank Badge */}
                          <div style={{
                            minWidth: 44,
                            textAlign: 'center',
                            padding: '4px 6px',
                            borderRadius: 'var(--radius-full)',
                            background: rankBg,
                            color: rankColor,
                            fontWeight: 800,
                            fontSize: 11.5,
                            letterSpacing: 0.2,
                          }}>
                            {rankBadge}
                          </div>

                          {/* Product Thumbnail Photo */}
                          {item.photo ? (
                            <img
                              src={item.photo}
                              alt={item.name}
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 8,
                                objectFit: 'cover',
                                border: '1px solid var(--border)',
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div style={{
                              width: 44,
                              height: 44,
                              borderRadius: 8,
                              background: 'var(--brown-100)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 20,
                              border: '1px solid var(--border)',
                              flexShrink: 0,
                            }}>
                              🍽️
                            </div>
                          )}

                          {/* Product Details */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: 700,
                              fontSize: 13.5,
                              color: 'var(--brown-900, #1c0a00)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                              {item.category || 'Uncategorized'}
                            </div>
                          </div>

                          {/* Units Sold (Primary Metric) & Revenue */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              display: 'inline-block',
                              background: 'var(--brown-100)',
                              color: 'var(--brown-800)',
                              fontWeight: 800,
                              fontSize: 12.5,
                              padding: '3px 9px',
                              borderRadius: 'var(--radius-full)',
                            }}>
                              {item.qty} {item.qty === 1 ? 'unit' : 'units'}
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green, #15803d)', marginTop: 3 }}>
                              {fmt(item.revenue)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'
  // ADDED — profit report is sensitive (margins), restrict same as backend
  const canSeeProfits = user?.role === 'OWNER' || user?.role === 'MANAGER'
  // ADDED — stack the two-column chart grids into one column on narrow
  // screens instead of squeezing charts into unusably narrow columns
  const isMobile = useIsMobile()

  const [data, setData] = useState(null)
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [branchId, setBranchId] = useState('')
  const [bestSellerLimit, setBestSellerLimit] = useState(5)

  // Custom range state (mirrors ForecastPage)
  const [showRangePicker, setShowRangePicker] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // state for the print-preview modal (main dashboard export) and the sales report modal
  const [showSalesReport, setShowSalesReport] = useState(false)
  // ADDED
  const [showProfitReport, setShowProfitReport] = useState(false)
  const [showExpenses, setShowExpenses] = useState(false)
  const [alertSummary, setAlertSummary] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOwner) {
      dashboardApi.branches().then(d => {
        const list = d.data || []
        setBranches(list)
        setBranchId(prev => (prev && !list.some(b => String(b.id) === String(prev)) ? '' : prev))
      })
    }
  }, [isOwner])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { period }
      if (branchId) params.branchId = branchId
      if (period === 'custom' && customStart) params.from = customStart
      if (period === 'custom' && customEnd) params.to = customEnd
      const [res, summaryRes] = await Promise.all([
        dashboardApi.get(params),
        notificationsApi.summary(isOwner && branchId ? { branchId } : {}).catch(() => null),
      ])
      setData(res.data)
      if (summaryRes?.data) setAlertSummary(summaryRes.data)
    } finally {
      setLoading(false)
    }
  }, [period, branchId, customStart, customEnd, isOwner])

  useEffect(() => { load() }, [load])

  // Derived labels for export / display
  const periodLabel = getPeriodLabel(period, customStart, customEnd)

  const branchLabel = useMemo(() => {
    // Cashier always belongs to one branch
    if (!isOwner) {
      return user?.branch?.name || "Unknown Branch"
    }

    // Owner
    if (!branchId) return "All Branches"

    return (
      branches.find(b => String(b.id) === String(branchId))?.name ||
      "All Branches"
    )
  }, [isOwner, user, branchId, branches])

  const customRangeLabel = useMemo(() => {
    if (period !== 'custom' || !customStart || !customEnd) return null
    const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return `${fmtDate(customStart)} – ${fmtDate(customEnd)}`
  }, [period, customStart, customEnd])

  function handlePeriodClick(value) {
    if (value === 'custom') {
      setPeriod('custom')
      setShowRangePicker(true)
    } else {
      setPeriod(value)
      setShowRangePicker(false)
    }
  }

  //   resets the custom range entirely and falls back to "Today"
  function handleResetCustomRange() {
    setCustomStart('')
    setCustomEnd('')
    setPeriod('today')
    setShowRangePicker(false)
  }

  if (loading && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 36 }}>🍖</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 14.5 }}>Loading dashboard…</span>
    </div>
  )

  const s = data?.summary || {}

  // CHANGED — less horizontal padding on mobile so narrow screens keep more usable width
  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: isMobile ? '16px 12px' : 28 }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)', marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {isOwner ? 'All branches overview' : `${user?.branch?.name} overview`}
          </p>
        </div>

        {/* ── Controls ────────────────────────────────────── */}
        {/* CHANGED — flattened into ONE flex row so every control (period
            pills, custom-range pill, branch select, Sales/Profit Report,
            refresh) wraps together as peers and packs lines evenly, instead
            of the period-pills being their own nested wrapping box that
            wrapped independently from the buttons after it (was causing
            "Custom" to sit alone on its own line, then Sales Report/refresh
            pushed down to a separate line below that). */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

          {PERIODS.map(p => (
            <button key={p.value} onClick={() => handlePeriodClick(p.value)} style={{
              padding: '10px 18px', borderRadius: 'var(--radius-full)', border: 'none',
              background: period === p.value ? 'var(--gradient-primary)' : 'var(--brown-100)',
              color: period === p.value ? '#fff' : 'var(--brown-800)',
              fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 200ms ease',
              boxShadow: period === p.value ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
              whiteSpace: 'nowrap', minWidth: 92, textAlign: 'center',
            }}>
              {p.label}
            </button>
          ))}

          {/* Small relatively-positioned wrapper just for the dropdown anchor —
              no flexWrap of its own, so it's a normal single flex item here.
              CHANGED — on mobile, becomes a full-width block instead of
              inline-flex, so the picker's width: 100% below actually has
              something meaningful to size against. */}
          {(customRangeLabel || showRangePicker) && (
            <div style={{ position: 'relative', display: isMobile ? 'block' : 'inline-flex', width: isMobile ? '100%' : undefined }}>
              {customRangeLabel && (
                <span
                  onClick={() => setShowRangePicker(true)}
                  title="Click to change range"
                  style={{
                    fontSize: 11.5, fontWeight: 700, color: 'var(--brown-600)',
                    background: 'var(--brown-50)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-full)', padding: '5px 12px',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {customRangeLabel} ✎
                </span>
              )}

              {showRangePicker && (
                <CustomRangePicker
                  startDate={customStart}
                  endDate={customEnd}
                  onChange={(s, e) => { setCustomStart(s); setCustomEnd(e) }}
                  onClose={() => setShowRangePicker(false)}
                  onReset={handleResetCustomRange}
                />
              )}
            </div>
          )}

          {/* Branch filter — Owner only */}
          {isOwner && (
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              style={{ padding: '9px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 13.5, background: '#fff', cursor: 'pointer' }}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          {/*   new "Sales Report" button — opens the itemized meals-sold modal */}
          <button onClick={() => setShowSalesReport(true)} style={{
            padding: '9px 18px', borderRadius: 'var(--radius-full)',
            border: '1.5px solid var(--border)', background: '#fff',
            color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            transition: 'all 180ms ease', whiteSpace: 'nowrap',
          }}>Sales Report</button>

          {/* ADDED — "Profit Report" & "Expenses" buttons, owner/manager only */}
          {canSeeProfits && (
            <>
              <button onClick={() => setShowProfitReport(true)} style={{
                padding: '9px 18px', borderRadius: 'var(--radius-full)',
                border: '1.5px solid var(--border)', background: '#fff',
                color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                transition: 'all 180ms ease', whiteSpace: 'nowrap',
              }}>💰 Profit Report</button>
              <button onClick={() => setShowExpenses(true)} style={{
                padding: '9px 18px', borderRadius: 'var(--radius-full)',
                border: '1.5px solid var(--border)', background: '#fff',
                color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                transition: 'all 180ms ease', whiteSpace: 'nowrap',
              }}>📋 Operating Expenses</button>
            </>
          )}

          <Button variant="outline" size="sm" onClick={load}>↻</Button>
        </div>
      </div>

      {/* Hint when custom is selected but no range set yet */}
      {period === 'custom' && (!customStart || !customEnd) && (
        <div style={{
          marginBottom: 18, background: '#fffbeb', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px',
          color: 'var(--brown-700)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          📅 Pick a start and end date to filter the dashboard.
        </div>
      )}

      {/* ── Financial & Inventory KPIs ────────────────────────── */}
      {canSeeProfits ? (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}>
            <StatCard
              icon="💵"
              label="Net Sales"
              value={fmt(s.netSales || s.totalSales || 0)}
              sub={`Gross: ${fmt(s.grossSales || s.totalSales || 0)} · Disc: ${fmt(s.discounts || 0)}`}
              color="var(--brown-800)"
            />
            <StatCard
              icon="🥩"
              label="COGS (Ingredient Cost)"
              value={fmt(s.totalCogs || 0)}
              sub="Direct ingredients consumed"
              color="var(--brown-700)"
            />
            <StatCard
              icon="📈"
              label="Gross Profit"
              value={fmt(s.grossProfit || 0)}
              sub={`${s.grossProfitMargin || 0}% gross margin`}
              color="#15803d"
            />
            <StatCard
              icon="📑"
              label="Operating Expenses"
              value={fmt(s.operatingExpenses || 0)}
              sub="Rent, utilities, salaries, other"
              color="var(--brown-800)"
            />
            <StatCard
              icon="🏆"
              label="Net Profit"
              value={fmt(s.netProfit || 0)}
              sub={`${s.netProfitMargin || 0}% net margin`}
              color={(s.netProfit || 0) >= 0 ? '#15803d' : '#dc2626'}
            />
            <StatCard
              icon="📦"
              label="Inventory Valuation"
              value={fmt(s.totalInventoryValue || 0)}
              sub={`${s.lowStockCount || 0} low stock · ${s.outOfStockCount || 0} out of stock`}
              color="var(--brown-800)"
            />
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard icon="🧾" label="Completed Orders" value={s.totalOrders || 0} sub={`Avg ${fmt(s.avgOrderValue || 0)} / order`} />
            <StatCard icon="📊" label="Total Transactions" value={s.allOrdersCount || 0} sub={`${s.cancelledCount || 0} cancelled`} />
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard icon="💰" label="Total Sales" value={fmt(s.totalSales || 0)} color="var(--brown-800)" />
          <StatCard icon="🧾" label="Completed Orders" value={s.totalOrders || 0} sub={`Avg ${fmt(s.avgOrderValue || 0)} / order`} />
          <StatCard icon="📦" label="All Orders" value={s.allOrdersCount || 0} sub={`${s.cancelledCount || 0} cancelled`} />
        </div>
      )}

      {/* ── Compact Inventory Alerts Panel ── */}
      {alertSummary && (
        <div style={{
          background: '#fff',
          border: `1.5px solid ${alertSummary.unresolvedCriticalAlerts > 0 ? '#fecaca' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: isMobile ? 14 : '16px 20px',
          marginBottom: 24,
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--brown-900)' }}>
                Inventory Alerts
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: '999px',
                background: alertSummary.totalActiveStockoutAlerts > 0 ? '#fee2e2' : '#f3f4f6',
                color: alertSummary.totalActiveStockoutAlerts > 0 ? '#991b1b' : '#4b5563',
              }}>
                {alertSummary.totalActiveStockoutAlerts} Out of Stock
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: '999px',
                background: alertSummary.totalLowStockWarnings > 0 ? '#fef3c7' : '#f3f4f6',
                color: alertSummary.totalLowStockWarnings > 0 ? '#92400e' : '#4b5563',
              }}>
                {alertSummary.totalLowStockWarnings} Low Stock
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: '999px',
                background: '#f3f4f6', color: '#374151',
              }}>
                {alertSummary.unresolvedCriticalAlerts} Unresolved Critical
              </span>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {alertSummary.affectedBranches?.length > 0 ? (
                <span>
                  Branches affected:{' '}
                  <strong style={{ color: 'var(--brown-800)' }}>
                    {alertSummary.affectedBranches.map((b) => b.name).join(', ')}
                  </strong>
                </span>
              ) : (
                <span>All monitored branch inventory levels are currently healthy.</span>
              )}
              {alertSummary.mostRecentAlert && (
                <span>
                  {' '}· Latest:{' '}
                  <strong style={{ color: 'var(--brown-800)' }}>
                    {alertSummary.mostRecentAlert.title}
                  </strong>{' '}
                  ({alertSummary.mostRecentAlert.itemName} at {alertSummary.mostRecentAlert.branchName})
                </span>
              )}
            </div>
          </div>

          {(isOwner || user?.role === 'MANAGER') && (
            <Button
              variant="outline"
              onClick={() => navigate(alertSummary.mostRecentAlert?.actionUrl || '/inventory')}
            >
              View Inventory
            </Button>
          )}
        </div>
      )}

      {/* ── Best-Selling Products Section (Branch Comparison & Role-Based Access) ── */}
      <BestSellersSection
        comparisonData={data?.bestSellersComparison}
        limit={bestSellerLimit}
        setLimit={setBestSellerLimit}
        isMobile={isMobile}
      />

      {/* ── Charts row 1 ──────────────────────────────────── */}
      {/* CHANGED — stack to 1 column on mobile instead of squeezing two
          charts (esp. the pie chart + legend) into narrow columns */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <Section title="📈 Sales Trend" style={{ height: 420 }}>
          {data?.salesTrend?.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data.salesTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="var(--brown-600)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="📈" title="No sales data for this period" />}
        </Section>

        <Section title="🥧 Sales by Category" style={{ height: 420 }}>
          {data?.salesByCategory?.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                {/* CHANGED — only render the inline label for slices with
                    actual share; a 0%-value slice has no angular span, so
                    its label anchor collapses onto the same point as every
                    other 0% slice, stacking overlapping text on the chart.
                    Every category (including 0%) still appears in the
                    Legend below, so nothing is hidden — this just stops
                    drawing unreadable overlapping text for empty slices. */}
                <Pie data={data.salesByCategory} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={false}
                >
                  {data.salesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 'Sales']} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="🥧" title="No category data yet" />}
        </Section>
      </div>

      {/* ── Charts row 2 ──────────────────────────────────── */}
      {/* CHANGED — stack to 1 column on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 18, marginBottom: 18 }}>
        <Section title="🏆 Best Sellers (by quantity)" style={{ height: 360 }}>
          {data?.bestSellers?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.bestSellers} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip prefix="" />} formatter={(v, n) => [v, n === 'qty' ? 'Qty sold' : 'Revenue']} />
                <Bar dataKey="qty" name="qty" fill="var(--brown-500)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="🏆" title="No sales data yet" />}
        </Section>

        <Section title="💳 Payment Methods" style={{ height: 360 }}>
          {data?.paymentBreakdown?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.paymentBreakdown.map((p, i) => {
                const maxTotal = data.paymentBreakdown[0].total
                const pct = Math.round((p.total / maxTotal) * 100)
                return (
                  <div key={p.method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13.5 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{p.method}</span>
                      <span style={{ color: 'var(--brown-700)', fontWeight: 700 }}>{fmt(p.total)}</span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: 6, height: 9 }}>
                      <div style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: 6, height: 9, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>
                      {p.count} transaction{p.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <EmptyState icon="💳" title="No payment data yet" />}
        </Section>
      </div>

      {/* ── Branch Comparison (Owner only) ────────────────── */}
      {isOwner && data?.salesByBranch?.length > 0 && (
        <Section title="🏪 Sales by Branch" style={{ marginBottom: 18, height: 480 }}>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={data.salesByBranch}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="sales" name="Sales" fill="var(--brown-600)" radius={[4, 4, 0, 0]}>
                {data.salesByBranch.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}



      {/*   Sales Report modal — itemized meals bought, adjustable date range, default today */}
      {showSalesReport && (
        <SalesReportModal
          branchId={branchId}
          branches={branches}
          branchLabel={branchLabel}
          isOwner={isOwner}
          onClose={() => setShowSalesReport(false)}
        />
      )}

      {/* ADDED — Profit Report modal — revenue/cost/profit per item, adjustable date range */}
      {showProfitReport && (
        <ProfitReportModal
          branchId={branchId}
          branchLabel={branchLabel}
          onClose={() => setShowProfitReport(false)}
        />
      )}

      {/* ADDED — Operating Expenses modal */}
      {showExpenses && (
        <ExpensesModal
          branchId={branchId}
          branches={branches}
          branchLabel={branchLabel}
          isOwner={isOwner}
          onClose={() => setShowExpenses(false)}
          onUpdated={load}
        />
      )}
    </div>
  )
}