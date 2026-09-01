// src/components/ui/ThermalReceipt.jsx
// Thermal receipt generator — opens a print window sized for 80mm thermal paper
// Call printReceipt(order, payments, branchName, discount) from anywhere
//
// CHANGED — `payments` is now an ARRAY of tender rows (one per payment
// method used), since an order can be settled with a split payment across
// multiple methods (e.g. CASH short + GCASH covering the remainder). A
// single-method payment is just an array with one entry. The receipt
// prints one line per tender, then a combined CHANGE line.
//
// Also added an optional 4th param `discount`, shape:
//   { label: string, percentage: number, deducted: number }
// When present, the receipt now shows:
//   Subtotal (original total)
//   Discount line (label, percentage, amount deducted)
//   TOTAL (after discount) — this is what's actually compared against amountPaid
// When absent, the receipt renders exactly as before (no discount rows).
//
// ADDED — VAT breakdown (PH standard 12%, VAT-inclusive) is now printed
// when the order carries vatableSales/vatAmount (every order created after
// the tax feature shipped). Older orders without these fields simply don't
// show the VAT lines.

export function printReceipt(order, payments, branchName = 'Sisigan Restaurant', discount = null) {
  const items = order.items || []
  // Normalize: accept either the new array or a legacy single payment object
  const tenders = Array.isArray(payments) ? payments : [payments]

  // CHANGED — order.totalAmount is treated as the ORIGINAL (pre-discount) total,
  // matching how OrdersPage.jsx computes baseTotal / total in PaymentModal.
  const subtotal   = Number(order.totalAmount)
  const discounted = discount ? Math.max(0, subtotal - Number(discount.deducted)) : subtotal
  const paid       = tenders.reduce((s, p) => s + Number(p.amountPaid), 0)
  const change     = tenders.reduce((s, p) => s + Number(p.change || 0), 0)
  const now        = new Date(tenders[0]?.processedAt || new Date())

  const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Build item rows — 80mm thermal = ~42 chars wide at 12px monospace
  function padLine(left, right, width = 32) {
    const spaces = width - left.length - right.length
    return left + ' '.repeat(Math.max(1, spaces)) + right
  }

  const itemLines = items.map(item => {
    const name     = item.menuItem?.name || item.name || ''
    const qty      = item.quantity || item.qty || 1
    const itemSubtotal = `₱${Number(item.subtotal || qty * Number(item.unitPrice || item.price)).toFixed(2)}`
    const qtyPrice = `${qty} x ₱${Number(item.unitPrice || item.price).toFixed(2)}`

    return `
      <div class="item-name">${name}</div>
      <div class="item-row">${padLine(qtyPrice, itemSubtotal)}</div>
    `
  }).join('')

  // CHANGED — one row per tender, plus its reference number if it has one
  const paymentRows = tenders.map(p => `
    <div class="total-row">
      <span>${p.method}</span>
      <span>₱${Number(p.amountPaid).toFixed(2)}</span>
    </div>
    ${p.referenceNo ? `<div class="line">Ref (${p.method}): ${p.referenceNo}</div>` : ''}
  `).join('')

  // ADDED — discount rows, only rendered when a discount was applied
  // In ThermalReceipt.jsx, replace the subtotalRow variable:
const subtotalRow = discount ? `
  <div class="total-row">
    <span>Subtotal</span>
    <span>₱${subtotal.toFixed(2)}</span>
  </div>
  <div class="total-row discount">
    <span>${discount.label} (${discount.percentage}%)</span>
    <span>- ₱${Number(discount.deducted).toFixed(2)}</span>
  </div>
` : `
  <div class="total-row discount" style="font-size:11px;color:#555;">
    <span>Discount</span>
    <span>Normal</span>
  </div>
`

  // ADDED — VAT breakdown, only rendered when the order carries the fields
  // (every order created after the tax feature shipped). VAT-inclusive:
  // the discounted TOTAL above already includes this VAT, these two lines
  // just break it out for the receipt, they don't add anything on top.
  const vatRow = (order.vatableSales != null && order.vatAmount != null) ? `
    <div class="line">VATable Sales: ₱${Number(order.vatableSales).toFixed(2)}</div>
    <div class="line">VAT (${Number(order.taxRate ?? 12).toFixed(0)}%): ₱${Number(order.vatAmount).toFixed(2)}</div>
  ` : ''

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Receipt - ${order.orderNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 80mm;
      padding: 4mm 4mm 12mm;
      color: #000;
      background: #fff;
    }

    .center  { text-align: center; }
    .right   { text-align: right; }
    .bold    { font-weight: bold; }
    .large   { font-size: 16px; }
    .small   { font-size: 10px; }
    .spacer  { margin: 4px 0; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }

    .header-logo {
      font-size: 22px;
      text-align: center;
      margin-bottom: 2px;
    }
    .header-name {
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header-sub {
      font-size: 10px;
      text-align: center;
      color: #444;
      margin-bottom: 2px;
    }

    .order-num {
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      margin: 4px 0 2px;
    }
    .order-type {
      text-align: center;
      font-size: 11px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #555;
    }

    .item-name { font-weight: bold; margin-top: 4px; }
    .item-row  { white-space: pre; font-size: 11px; color: #222; }

    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: bold;
      margin: 2px 0;
    }
    /* ADDED — discount row style: lighter weight, not bold like totals */
    .total-row.discount {
      font-size: 12px;
      font-weight: normal;
      color: #b91c1c;
    }
    .total-row.grand {
      font-size: 15px;
      border-top: 1px solid #000;
      padding-top: 4px;
      margin-top: 4px;
    }
    .total-row.change { color: #000; }

    .payment-method {
      text-align: center;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 1px;
      margin: 4px 0;
      text-transform: uppercase;
    }
    .line { font-size: 11px; color: #444; }

    .footer {
      text-align: center;
      font-size: 10px;
      color: #555;
      margin-top: 8px;
      line-height: 1.6;
    }
    .footer .tagline {
      font-size: 12px;
      font-weight: bold;
      color: #000;
    }

    @media print {
      body { margin: 0; padding: 4mm 4mm 12mm; }
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header-logo">🍖</div>
  <div class="header-name">${branchName}</div>
  <div class="header-sub">${order.branch?.address || ''}</div>
  <div class="header-sub">${order.branch?.city || ''}</div>

  <div class="divider"></div>

  <!-- ORDER INFO -->
  <div class="order-num">${order.orderNumber}</div>
  <div class="order-type">${order.type?.replace('_', ' ') || 'ORDER'}</div>

  <div class="spacer"></div>
  <div class="line">Date : ${dateStr}</div>
  <div class="line">Time : ${timeStr}</div>
  <div class="line">Cashier: ${order.cashier?.name || 'N/A'}</div>

  <div class="divider"></div>

  <!-- ITEMS -->
  ${itemLines}

  <div class="divider"></div>

  <!-- TOTALS -->
  <!-- ADDED — Subtotal + Discount rows only appear when a discount was applied -->
  ${subtotalRow}
  <!-- ADDED — VAT breakdown, only appears when the order carries tax fields -->
  ${vatRow}
  <div class="total-row grand">
    <span>TOTAL</span>
    <span>₱${discounted.toFixed(2)}</span>
  </div>
  <!-- CHANGED — one row per tender (supports split payment across methods) -->
  ${paymentRows}
  <div class="total-row change">
    <span>CHANGE</span>
    <span>₱${change.toFixed(2)}</span>
  </div>

  <div class="divider"></div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="tagline">Salamat sa iyong pagbisita!</div>
    <div>Thank you for dining with us.</div>
    <div>Please come again! 🙏</div>
    <div style="margin-top:6px;">*** OFFICIAL RECEIPT ***</div>
  </div>

</body>
</html>
  `

  // Open print window
  const win = window.open('', '_blank', 'width=320,height=600,toolbar=0,menubar=0')
  if (!win) { alert('Please allow popups to print receipt.'); return }

  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 300)
}