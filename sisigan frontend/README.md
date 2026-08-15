# 🍖 Sisigan POS — Web Frontend

React + Vite website for the Sisigan Restaurant Point of Sale system.

---

## Tech Stack

| Layer      | Technology            |
|------------|-----------------------|
| Framework  | React 18              |
| Build tool | Vite 5                |
| Routing    | React Router v6       |
| Real-time  | Socket.IO Client      |
| Fonts      | Playfair Display + DM Sans (Google Fonts) |

---

## Project Structure

```
src/
├── api/
│   └── client.js              # All API calls (auth, menu, orders)
├── components/
│   ├── layout/
│   │   └── Navbar.jsx         # Top navigation bar
│   └── ui/
│       └── index.jsx          # Badge, Button, Input, Modal, Card, etc.
├── context/
│   └── AuthContext.jsx        # Global auth state + JWT storage
├── pages/
│   ├── LoginPage.jsx          # Login screen
│   ├── POSPage.jsx            # New order / cashier screen
│   ├── OrdersPage.jsx         # Order management + status updates
│   └── MenuPage.jsx           # Menu items management
├── App.jsx                    # Routes + auth guard
├── main.jsx                   # Entry point
└── index.css                  # CSS variables + global styles
```

---

## Getting Started

### 1. Make sure the backend is running
```bash
# In your sisigan-pos-backend folder
npm run dev   # runs on http://localhost:3000
```

### 2. Install and start the frontend
```bash
cd sisigan-pos-web
npm install
npm run dev   # runs on http://localhost:5173
```

Vite proxies `/api` and `/socket.io` requests to `localhost:3000` automatically — no CORS config needed in dev.

---

## Pages

### `/pos` — New Order (POS Screen)
- Browse menu by category
- Tap items to add to cart, adjust quantities
- Choose Dine In / Takeout / Delivery
- Enter table number and customer name
- Place order → sent to backend

### `/orders` — Order Management
- Filter by status: Pending, Preparing, Ready, Completed, Cancelled
- Click any order card for full detail
- Advance order through status stages
- Process payment (Cash, GCash, Maya, Card) when Ready
- Auto-refreshes every 15 seconds

### `/menu` — Menu Management *(Manager/Admin)*
- View all items grouped by category
- Toggle item availability (86 an item)
- Add new menu items

---

## Building for Production

```bash
npm run build    # outputs to /dist
npm run preview  # preview the production build locally
```

For production, update the `vite.config.js` proxy target to point to your deployed backend URL, or set the `VITE_API_BASE` environment variable.

---

## Customization Tips

- **Colors**: All colors are CSS variables in `src/index.css` under `:root`
- **API URL**: Change the proxy target in `vite.config.js` → `server.proxy`
- **Add pages**: Create a new file in `src/pages/`, import it in `App.jsx`, add a route and a nav link in `Navbar.jsx`
- **Fonts**: Change the Google Fonts import in `index.html` and update `--font-display` / `--font-body` in `index.css`
