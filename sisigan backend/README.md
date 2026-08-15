# 🍖 Sisigan Restaurant — POS Backend

Multi-branch Point of Sale backend for **Sisigan Restaurant** built with **Node.js + Express + Prisma + MySQL**.

---

## Tech Stack

| Layer       | Technology              |
|-------------|-------------------------|
| Runtime     | Node.js 18+             |
| Framework   | Express.js              |
| Database    | MySQL 8.0+              |
| ORM         | Prisma                  |
| Auth        | JWT + bcryptjs          |
| Real-time   | Socket.IO               |
| Validation  | express-validator        |

---

## Project Structure

```
sisigan-pos-backend/
├── prisma/
│   ├── schema.prisma          # All DB models
│   └── seed.js                # Sample data seeder
├── src/
│   ├── config/
│   │   └── db.js              # Prisma singleton client
│   ├── modules/
│   │   ├── auth/              # Login, JWT
│   │   ├── menu/              # Menu items & categories
│   │   └── orders/            # Orders, payments
│   ├── middleware/
│   │   ├── auth.middleware.js  # JWT verification
│   │   ├── role.middleware.js  # RBAC guard
│   │   └── error.middleware.js # Global error handler
│   ├── socket/
│   │   └── orderSocket.js     # Real-time kitchen events
│   └── app.js                 # Express app config
└── server.js                  # Entry point
```

---

## Getting Started

### 1. Prerequisites
- Node.js 18+
- MySQL 8.0 running locally or remote

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="mysql://root:yourpassword@localhost:3306/sisigan_pos"
JWT_SECRET=your_super_secret_key_here
```

### 4. Setup database
```bash
# Generate Prisma client
npm run db:generate

# Run migrations (creates tables)
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 5. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs at: `http://localhost:3000`

---

## API Reference

### Base URL
```
http://localhost:3000/api
```

### Authentication
All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

### 🔐 Auth

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "cashier1@sisigan.ph",
  "password": "cashier123"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 2,
      "name": "Cashier Branch 1",
      "email": "cashier1@sisigan.ph",
      "role": "CASHIER",
      "branch": { "id": 1, "name": "Sisigan BGC", "city": "Taguig" }
    }
  }
}
```

#### Get Current User
```http
GET /api/auth/me
```

---

### 📋 Menu

#### Get Menu by Category (Flutter POS screen)
```http
GET /api/menu/categories
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Sisig",
      "items": [
        { "id": 1, "name": "Classic Pork Sisig", "price": "189.00", "isAvailable": true }
      ]
    }
  ]
}
```

#### Get All Items (flat list)
```http
GET /api/menu
```

#### Create Menu Item *(OWNER/MANAGER)*
```http
POST /api/menu
{
  "name": "Spicy Sisig",
  "price": 209,
  "categoryId": 1,
  "description": "Extra spicy variant"
}
```

#### Toggle Item Availability *(86 an item)*
```http
PATCH /api/menu/:id/toggle
```

---

### 🧾 Orders

#### Create Order
```http
POST /api/orders
{
  "type": "DINE_IN",
  "tableNumber": "T5",
  "customerName": "Juan dela Cruz",
  "items": [
    { "menuItemId": 1, "quantity": 2, "notes": "Extra spicy" },
    { "menuItemId": 13, "quantity": 2 }
  ]
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "BR1-00001",
    "status": "PENDING",
    "type": "DINE_IN",
    "tableNumber": "T5",
    "totalAmount": "468.00",
    "items": [...],
    "branch": { "id": 1, "name": "Sisigan BGC" }
  }
}
```

#### List Orders
```http
GET /api/orders?status=PENDING&date=2025-02-14&page=1&limit=20
```
*Non-owners automatically scoped to their branch.*

#### Get Order Detail
```http
GET /api/orders/:id
```

#### Update Order Status
```http
PATCH /api/orders/:id/status
{
  "status": "PREPARING"
}
```

**Valid Transitions:**
```
PENDING → PREPARING → READY → COMPLETED
Any (except COMPLETED) → CANCELLED
```

#### Cancel Order *(OWNER/MANAGER only)*
```http
DELETE /api/orders/:id
```

#### Process Payment
```http
POST /api/orders/:id/payment
{
  "method": "CASH",
  "amountPaid": 500,
  "referenceNo": null
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "payment": {
      "id": 1,
      "method": "CASH",
      "amountPaid": "500.00",
      "change": "32.00"
    },
    "change": 32
  }
}
```

---

## Real-time Events (Socket.IO)

Connect with JWT:
```dart
// Flutter
final socket = io('http://localhost:3000', {
  'auth': { 'token': jwtToken }
});
```

### Events Emitted by Server

| Event | Payload | When |
|---|---|---|
| `new_order` | Full order object | New order created |
| `order_status_updated` | `{ orderId, status }` | Status changed |
| `order_cancelled` | `{ orderId, orderNumber }` | Order cancelled |

### Client Events

| Event | Description |
|---|---|
| `join_kitchen` | Subscribe to kitchen display feed |

---

## Roles & Permissions

| Action | CASHIER | MANAGER | OWNER |
|---|---|---|---|
| Login | ✅ | ✅ | ✅ |
| View menu | ✅ | ✅ | ✅ |
| Create/edit menu | ❌ | ✅ | ✅ |
| Create order | ✅ | ✅ | ✅ |
| Update order status | ✅ | ✅ | ✅ |
| Cancel order | ❌ | ✅ | ✅ |
| Process payment | ✅ | ✅ | ✅ |
| View other branches | ❌ | ❌ | ✅ |

---

## Default Seed Accounts

| Role | Email | Password |
|---|---|---|
| Owner | owner@sisigan.ph | owner123 |
| Manager | manager@sisigan.ph | manager123 |
| Cashier (BGC) | cashier1@sisigan.ph | cashier123 |
| Cashier (Makati) | cashier2@sisigan.ph | cashier123 |
| Cashier (Eastwood) | cashier3@sisigan.ph | cashier123 |

---

## Useful Commands

```bash
npm run dev          # Start dev server with nodemon
npm run db:migrate   # Run DB migrations
npm run db:seed      # Seed sample data
npm run db:studio    # Open Prisma Studio (GUI)
npm run db:generate  # Regenerate Prisma client
```

---

## Next Steps

- [ ] Branch management endpoints
- [ ] Inventory / stock tracking
- [ ] Sales reports API (total sales, best sellers)
- [ ] Sales trend forecasting (Phase 3)
- [ ] Push notifications for order updates
