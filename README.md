READ ME SISIGAN
### CD both backend and frontend mga hindot
  Need niyo MySQL at Node.JS tyaka bago irun open niyo na XAMPP Apache at MySQL 

### Terminal 1 — Backend
```bash
cd "sisigan backend"
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run db:seed
```
### Terminal 2 — Frontend
```bash
cd "sisigan frontend"
npm install
npm install xlsx
```

### Terminal 3 — Analytics
```bash
py -3.11 -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
pip install apscheduler pymysql sqlalchemy
uvicorn analytics_service:app --reload --port 8000
```


## How to Run

### Terminal 1 — Backend
```bash
cd "sisigan backend"
npm run dev
```
> Runs at http://localhost:3000

### Terminal 2 — Frontend
```bash
cd "sisigan frontend"
npm run dev
```
> Opens at http://localhost:5173

### Terminal 3 — Analytics
```bash
.\venv\Scripts\activate
uvicorn analytics_service:app --reload --port 8000
```