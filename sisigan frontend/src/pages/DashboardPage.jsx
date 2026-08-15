// src/pages/DashboardPage.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { dashboardApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Button, EmptyState } from '../components/ui'
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
    <div ref={ref} style={{
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

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'

  const [data, setData] = useState(null)
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [branchId, setBranchId] = useState('')

  // Custom range state (mirrors ForecastPage)
  const [showRangePicker, setShowRangePicker] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // state for the print-preview modal (main dashboard export) and the sales report modal
  const [showSalesReport, setShowSalesReport] = useState(false)

  useEffect(() => {
    if (isOwner) {
      dashboardApi.branches().then(d => setBranches(d.data || []))
    }
  }, [isOwner])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { period }
      if (branchId) params.branchId = branchId
      if (period === 'custom' && customStart) params.from = customStart
      if (period === 'custom' && customEnd) params.to = customEnd
      const res = await dashboardApi.get(params)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }, [period, branchId, customStart, customEnd])

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

  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>

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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Period buttons + custom range picker */}
          <div style={{ display: 'flex', gap: 6, position: 'relative', alignItems: 'center' }}>
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => handlePeriodClick(p.value)} style={{
                padding: '10px 18px', borderRadius: 'var(--radius-full)', border: 'none',
                background: period === p.value ? 'var(--gradient-primary)' : 'var(--brown-100)',
                color: period === p.value ? '#fff' : 'var(--brown-800)',
                fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 200ms ease',
                boxShadow: period === p.value ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
              }}>
                {p.label}
              </button>
            ))}

            {/* Inline pill showing selected range */}
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

            {/* Date range dropdown —   now passes onReset so user can clear the range */}
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
            transition: 'all 180ms ease',
          }}>Sales Report</button>

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

      {/* ── Stat Cards ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard icon="💰" label="Total Sales" value={fmt(s.totalSales || 0)} color="var(--brown-800)" />
        <StatCard icon="🧾" label="Completed Orders" value={s.totalOrders || 0} sub={`Avg ${fmt(s.avgOrderValue || 0)} / order`} />
        <StatCard icon="📦" label="All Orders" value={s.allOrdersCount || 0} sub={`${s.cancelledCount || 0} cancelled`} />
      </div>

      {/* ── Charts row 1 ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
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
                <Pie data={data.salesByCategory} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, marginBottom: 18 }}>
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

      {/* ── Best Sellers Table ─────────────────────────────── */}
      {data?.bestSellers?.length > 0 && (
        <Section title="📋 Best Sellers Detail">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--brown-50)' }}>
                  {['#', 'Item', 'Qty Sold', 'Revenue'].map(h => (
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
                {data.bestSellers.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--text-faint)', fontWeight: 700 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>{item.name}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-700)' }}>{item.qty}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{fmt(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  )
}