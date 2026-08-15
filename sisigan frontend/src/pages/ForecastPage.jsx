// src/pages/ForecastPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button, EmptyState } from '../components/ui'
import * as XLSX from 'xlsx'
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

const MENU_GROUPS = {
  'Silog Meals': [
    'Sisilog', 'Bagnetsilog', 'Hungarian Silog', 'Shanghaisilog',
    'Nuggets Silog', 'Hotsilog', 'Siomaisilog', 'Dinakdakansilog',
    'Chicksilog', 'Bangsilog', 'Porksilog',
  ],
  Combos: [
    'CM1 Egg + Rice + Hungarian', 'CM2 Egg + Rice + Nuggets',
    'CM3 Egg + Rice + Shanghai', 'CM4 Egg + Rice + Bagnet',
    'CM5 Egg + Rice + Bagnet', 'CM6 Egg + Rice + Hotdog',
    'CM7 Egg + Rice + Bagnet', 'CM8 Egg + Rice + Bagnet',
  ],
  'Rice Meals': [
    'Beef Bulalo', 'Crispy Chicharon Bulaklak', 'Crispy Dinakdakan',
    'Crispy Sisig Barkada', 'Calamares', 'Garlic Butter Bangus',
    'Crispy Bagnet', 'Shanghai', 'Siomai Rice',
  ],
  Pancit: ['Pancit Bihon Guisado', 'Pancit Canton Guisado'],
  Pizza: [
    '4 in 1', 'Double Cheese', 'Shawarma', 'Hawaiian', 'Beefy Mushroom',
    'Ham and Cheese', 'Bacon', 'Pepperoni', 'Overload',
  ],
}

const EXCLUDED_FIELDS = new Set(['Date', 'DayOfWeek', 'DayType', 'TotalOrders', 'ForecastTotalOrders'])
const AVG_ORDER_VALUE = 100
const AUTO_REFRESH_MS = 60000

function sumByKeys(row, keys) {
  return keys.reduce((sum, key) => sum + (Number(row?.[key]) || 0), 0)
}

function fmtPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function formatLastUpdated(date) {
  if (!date) return 'Never'
  return new Date(date).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ── Export helpers ─────────────────────────────────────────────────────────────

function getPeriodLabel(period, customStart, customEnd) {
  if (period === 'today') return 'Today'
  if (period === 'week') return 'This Week'
  if (period === 'month') return 'This Month'
  if (period === 'custom' && customStart && customEnd) return `${customStart} to ${customEnd}`
  return 'Custom'
}

function downloadExcel(filteredData, bestSellers, salesByCategory, summary, periodLabel) {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Summary
  const summaryRows = [
    { Metric: 'Period', Value: periodLabel },
    { Metric: 'Total Forecast Orders', Value: summary.totalOrders },
    { Metric: 'Total Forecast Sales (PHP)', Value: summary.totalSales },
    { Metric: 'Average Orders per Day', Value: Number(summary.avgOrders.toFixed(2)) },
    { Metric: 'Avg Order Value (PHP)', Value: AVG_ORDER_VALUE },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // Sheet 2: Daily Forecast
  const dailyRows = filteredData.map(row => ({
    Date: row.Date || '',
    'Day of Week': row.DayOfWeek || '',
    'Day Type': row.DayType || '',
    'Forecast Orders': Number(row.ForecastTotalOrders) || 0,
    'Forecast Sales (PHP)': (Number(row.ForecastTotalOrders) || 0) * AVG_ORDER_VALUE,
  }))
  const wsDaily = XLSX.utils.json_to_sheet(dailyRows)
  wsDaily['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Forecast')

  // Sheet 3: Best Sellers
  const sellerRows = bestSellers.map((item, i) => ({
    Rank: i + 1,
    'Menu Item': item.name,
    'Forecast Qty': item.qty,
    'Forecast Revenue (PHP)': item.revenue,
  }))
  const wsSellers = XLSX.utils.json_to_sheet(sellerRows)
  wsSellers['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 14 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsSellers, 'Best Sellers')

  // Sheet 4: By Category
  const categoryRows = salesByCategory.map(cat => ({
    Category: cat.name,
    'Forecast Sales (PHP)': cat.value,
  }))
  const wsCategory = XLSX.utils.json_to_sheet(categoryRows)
  wsCategory['!cols'] = [{ wch: 20 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsCategory, 'By Category')

  const filename = `forecast_${periodLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

function downloadPDF(filteredData, bestSellers, salesByCategory, summary, periodLabel) {
  const dailyRows = filteredData.map(row => ({
    date: row.Date || '',
    day: row.DayOfWeek || '',
    orders: Number(row.ForecastTotalOrders) || 0,
    sales: (Number(row.ForecastTotalOrders) || 0) * AVG_ORDER_VALUE,
  }))

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Forecast Report – ${periodLabel}</title>
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
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
    .stat-box { background: #fef3c7; border: 1px solid #d97706; border-radius: 8px; padding: 12px 16px; }
    .stat-label { font-size: 10px; text-transform: uppercase; color: #92400e; font-weight: 700; margin-bottom: 4px; }
    .stat-val { font-size: 20px; font-weight: 700; color: #78350f; }
    @media print {
      body { padding: 16px; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Forecast Report</h1>
  <div class="meta">Period: <strong>${periodLabel}</strong> &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="stat-box">
      <div class="stat-label">Forecast Orders</div>
      <div class="stat-val">${summary.totalOrders.toLocaleString()}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Forecast Sales</div>
      <div class="stat-val">PHP ${summary.totalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Avg Orders / Day</div>
      <div class="stat-val">${summary.avgOrders.toFixed(0)}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Avg Order Value</div>
      <div class="stat-val">PHP ${AVG_ORDER_VALUE.toFixed(2)}</div>
    </div>
  </div>

  <h2>Daily Forecast</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Day</th>
        <th class="num">Orders</th><th class="num">Sales (PHP)</th>
      </tr>
    </thead>
    <tbody>
      ${dailyRows.map(r => `
        <tr>
          <td>${r.date}</td>
          <td>${r.day}</td>
          <td class="num">${r.orders}</td>
          <td class="num">${r.sales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <h2>Best Sellers Forecast</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Item</th>
        <th class="num">Qty</th><th class="num">Revenue (PHP)</th>
      </tr>
    </thead>
    <tbody>
      ${bestSellers.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.name}</td>
          <td class="num">${item.qty}</td>
          <td class="num">${item.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <h2>Forecast by Category</h2>
  <table>
    <thead>
      <tr><th>Category</th><th class="num">Sales (PHP)</th></tr>
    </thead>
    <tbody>
      ${salesByCategory.map(cat => `
        <tr>
          <td>${cat.name}</td>
          <td class="num">${cat.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

// ── Export Dropdown ────────────────────────────────────────────────────────────
function ExportDropdown({ onExcelDownload, onPDFDownload, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options = [
    { icon: '📊', label: 'Download Excel (.xlsx)', action: () => { onExcelDownload(); setOpen(false) } },
    { icon: '📄', label: 'Download PDF (Print)', action: () => { onPDFDownload(); setOpen(false) } },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        style={{
          padding: '9px 18px', borderRadius: 'var(--radius-full)',
          border: '1.5px solid var(--border)',
          background: open ? 'var(--brown-100)' : '#fff',
          color: 'var(--brown-800)', fontWeight: 700, fontSize: 12.5,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', gap: 7, transition: 'all 180ms ease',
        }}
      >
        Download {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 200,
          background: 'var(--cream)', border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          minWidth: 200, overflow: 'hidden',
        }}>
          {options.map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '13px 18px',
                border: 'none', background: 'transparent',
                color: 'var(--brown-800)', fontWeight: 600, fontSize: 13.5,
                cursor: 'pointer', textAlign: 'left', transition: 'background 150ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brown-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 17 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
// ──────────────────────────────────────────────────────────────────────────────

// ── Custom Range Picker ────────────────────────────────────────────────────────
function CustomRangePicker({ startDate, endDate, minDate, maxDate, onChange, onClose }) {
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

  const nightCount = useMemo(() => {
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
          <input type="date" value={localStart} min={minDate} max={localEnd || maxDate}
            onChange={e => setLocalStart(e.target.value)} style={dateInputStyle} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          End Date
          <input type="date" value={localEnd} min={localStart || minDate} max={maxDate}
            onChange={e => setLocalEnd(e.target.value)} style={dateInputStyle} />
        </label>
      </div>
      {isValid && (
        <div style={{
          margin: '12px 0', padding: '9px 12px', background: 'var(--brown-50)',
          borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--brown-700)', fontWeight: 600,
        }}>
          {nightCount === 0 ? 'Same day' : `${nightCount} day${nightCount !== 1 ? 's' : ''} selected`}
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
    </div>
  )
}

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
// ──────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'var(--brown-800)', icon }) {
  return (
    <div style={{
      background: 'var(--cream)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '24px 26px', flex: 1, minWidth: 200,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
          }}>{label}</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 30,
            fontWeight: 700, color, lineHeight: 1,
          }}>{value}</div>
          {sub && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 30, opacity: 0.7 }}>{icon}</span>}
      </div>
    </div>
  )
}

function Section({ title, children, style = {} }) {
  return (
    <div style={{
      background: 'var(--cream)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 24,
      boxShadow: 'var(--shadow-sm)', ...style,
    }}>
      <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 17, marginBottom: 18, fontWeight: 700 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label, prefix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', fontSize: 13,
      boxShadow: 'var(--shadow-md)',
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--brown-800)' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--brown-600)' }}>
          {p.name}: {prefix}{typeof p.value === 'number'
            ? p.value.toLocaleString('en-PH', { minimumFractionDigits: prefix ? 2 : 0 })
            : p.value}
        </div>
      ))}
    </div>
  )
}

export default function ForecastPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rawData, setRawData] = useState([])
  const [period, setPeriod] = useState('week')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState('')
  const [showRangePicker, setShowRangePicker] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const loadForecast = useCallback(async ({ showLoading = false, silent = false } = {}) => {
    try {
      if (showLoading) setLoading(true)
      if (!showLoading && !silent) setRefreshing(true)

      const res = await fetch(`/data/forecast_output.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load forecast_output.json')

      const json = await res.json()
      setRawData(Array.isArray(json) ? json : [])
      setLastUpdated(new Date())
      setError('')
    } catch (err) {
      console.error('Forecast refresh failed:', err)
      setError(err?.message || 'Failed to refresh forecast data.')
      setRawData([])
    } finally {
      if (showLoading) setLoading(false)
      if (!showLoading && !silent) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadForecast({ showLoading: true })
    const interval = setInterval(() => loadForecast({ silent: true }), AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [loadForecast])

  const { minDate, maxDate } = useMemo(() => {
    const dates = rawData.map(r => r.Date).filter(Boolean).sort()
    return { minDate: dates[0] || '', maxDate: dates[dates.length - 1] || '' }
  }, [rawData])

  const filteredData = useMemo(() => {
    if (!rawData.length) return []
    if (period === 'today') return rawData.slice(0, 1)
    if (period === 'week') return rawData.slice(0, 7)
    if (period === 'month') return rawData.slice(0, 30)
    if (period === 'custom' && customStart && customEnd) {
      return rawData.filter(row => {
        const d = row.Date?.slice(0, 10)
        return d && d >= customStart && d <= customEnd
      })
    }
    return rawData
  }, [rawData, period, customStart, customEnd])

  const customRangeLabel = useMemo(() => {
    if (period !== 'custom' || !customStart || !customEnd) return null
    const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return `${fmt(customStart)} – ${fmt(customEnd)}`
  }, [period, customStart, customEnd])

  function handlePeriodClick(value) {
    if (value === 'custom') { setPeriod('custom'); setShowRangePicker(true) }
    else { setPeriod(value); setShowRangePicker(false) }
  }

  const summary = useMemo(() => {
    const totalOrders = filteredData.reduce((sum, row) => sum + (Number(row.ForecastTotalOrders) || 0), 0)
    const totalSales = totalOrders * AVG_ORDER_VALUE
    const avgOrders = filteredData.length ? totalOrders / filteredData.length : 0
    return { totalSales, totalOrders, avgOrderValue: AVG_ORDER_VALUE, avgOrders }
  }, [filteredData])

  const salesTrend = useMemo(() => filteredData.map(row => ({
    date: row.Date?.slice(5, 10) || '',
    sales: (Number(row.ForecastTotalOrders) || 0) * AVG_ORDER_VALUE,
    orders: Number(row.ForecastTotalOrders) || 0,
  })), [filteredData])

  const salesByCategory = useMemo(() => Object.entries(MENU_GROUPS)
    .map(([name, keys]) => ({
      name,
      value: filteredData.reduce((sum, row) => sum + sumByKeys(row, keys), 0) * AVG_ORDER_VALUE,
    }))
    .filter(item => item.value > 0), [filteredData])

  const bestSellers = useMemo(() => {
    if (!filteredData.length) return []
    const menuItems = Object.keys(filteredData[0]).filter(key => !EXCLUDED_FIELDS.has(key))
    return menuItems
      .map((name, idx) => {
        const qty = filteredData.reduce((sum, row) => sum + (Number(row[name]) || 0), 0)
        return { id: idx + 1, name, qty, revenue: qty * AVG_ORDER_VALUE }
      })
      .filter(item => item.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
  }, [filteredData])

  const topCategories = useMemo(() => salesByCategory.map((cat, i) => ({
    ...cat, fill: COLORS[i % COLORS.length],
  })), [salesByCategory])

  const periodLabel = getPeriodLabel(period, customStart, customEnd)
  const hasData = filteredData.length > 0

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', flexDirection: 'column', gap: 14,
      }}>
        <span style={{ fontSize: 36 }}>📈</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 14.5 }}>Loading forecast dashboard…</span>
      </div>
    )
  }

  return (
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 28, flexWrap: 'wrap', gap: 14,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26,
            color: 'var(--brown-800)', marginBottom: 4,
          }}>
            Forecast Dashboard
          </h1>
          <p style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>
            Last updated: {formatLastUpdated(lastUpdated)} · Auto-refresh every {AUTO_REFRESH_MS / 1000}s
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 6, position: 'relative', alignItems: 'center' }}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePeriodClick(p.value)}
                style={{
                  padding: '10px 18px', borderRadius: 'var(--radius-full)', border: 'none',
                  background: period === p.value ? 'var(--gradient-primary)' : 'var(--brown-100)',
                  color: period === p.value ? '#fff' : 'var(--brown-800)',
                  fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 200ms ease',
                  boxShadow: period === p.value ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
                }}
              >
                {p.label}
              </button>
            ))}

            {customRangeLabel && (
              <span
                onClick={() => setShowRangePicker(true)}
                style={{
                  fontSize: 11.5, fontWeight: 700, color: 'var(--brown-600)',
                  background: 'var(--brown-50)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-full)', padding: '5px 12px',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                title="Click to change range"
              >
                {customRangeLabel} ✎
              </span>
            )}

            {showRangePicker && (
              <CustomRangePicker
                startDate={customStart} endDate={customEnd}
                minDate={minDate} maxDate={maxDate}
                onChange={(s, e) => { setCustomStart(s); setCustomEnd(e) }}
                onClose={() => setShowRangePicker(false)}
              />
            )}
          </div>

          {/* ⬇ Export dropdown */}
          <ExportDropdown
            disabled={!hasData}
            onExcelDownload={() => downloadExcel(filteredData, bestSellers, salesByCategory, summary, periodLabel)}
            onPDFDownload={() => downloadPDF(filteredData, bestSellers, salesByCategory, summary, periodLabel)}
          />

          <Button variant="outline" size="sm" onClick={() => loadForecast()}>
            {refreshing ? '⟳ Refreshing...' : '↻ Refresh'}
          </Button>
        </div>
      </div>

      {/* ── Hints / Errors ── */}
      {period === 'custom' && (!customStart || !customEnd) && (
        <div style={{
          marginBottom: 18, background: '#fffbeb', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px',
          color: 'var(--brown-700)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          📅 Pick a start and end date above to see the custom range forecast.
        </div>
      )}

      {error && (
        <div style={{
          marginBottom: 18, background: '#fff7ed', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '12px 14px',
          color: 'var(--brown-800)', fontSize: 13.5,
        }}>
          {error}
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard icon="💰" label="Forecast Sales" value={fmtPeso(summary.totalSales)} color="var(--brown-800)" />
        <StatCard icon="📦" label="Forecast Orders" value={summary.totalOrders || 0}
          sub={`${summary.avgOrders.toFixed(0)} avg / day`} />
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <Section title="📈 Forecast Sales Trend">
          {salesTrend.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={salesTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip prefix="₱" />} />
                <Line type="monotone" dataKey="sales" name="Sales"
                  stroke="var(--brown-600)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="📈" title="No forecast trend data available" />}
        </Section>

        <Section title="🥧 Forecast by Category">
          {topCategories.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={topCategories} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {topCategories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [fmtPeso(v), 'Sales']} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="🥧" title="No category forecast data available" />}
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, marginBottom: 18 }}>
        <Section title="🏆 Best Sellers Forecast (by quantity)">
          {bestSellers.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bestSellers.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip prefix="" />}
                  formatter={(v, n) => [v, n === 'qty' ? 'Qty sold' : 'Revenue']} />
                <Bar dataKey="qty" name="qty" fill="var(--brown-500)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="🏆" title="No forecast sales data yet" />}
        </Section>

        <Section title="📋 Forecast Summary">
          {summary.totalOrders > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Projected orders', value: summary.totalOrders },
                { label: 'Projected sales', value: fmtPeso(summary.totalSales) },
                { label: 'Average per day', value: `${summary.avgOrders.toFixed(0)} orders` },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '12px 14px', background: 'var(--brown-50)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontWeight: 700, color: 'var(--brown-800)', fontSize: 19 }}>{value}</div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon="📋" title="No forecast summary available" />}
        </Section>
      </div>

      {/* ── Detail Table ── */}
      {bestSellers.length > 0 && (
        <Section title="📋 Forecast Best Sellers Detail">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--brown-50)' }}>
                  {['#', 'Item', 'Qty Forecast', 'Revenue'].map(h => (
                    <th key={h} style={{
                      padding: '11px 14px',
                      textAlign: h === '#' || h === 'Qty Forecast' || h === 'Revenue' ? 'center' : 'left',
                      fontWeight: 700, color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bestSellers.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--text-faint)', fontWeight: 700 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-dark)' }}>{item.name}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--brown-700)' }}>{item.qty}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{fmtPeso(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}