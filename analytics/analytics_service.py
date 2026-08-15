"""
Harvey's Sisigan — Analytics & Continuous-Learning Forecast Service  v5.1.0
===========================================================================
FastAPI microservice.  Endpoint: http://localhost:8000

What's new in v5.1:
  - /api/trending-items-forecast: ranks items by recent sales GROWTH
    (not just volume), forecasts the top N (1-5), and returns projected
    total demand per item over the horizon — feeds the ingredient
    recommendation feature in the Node backend / dashboard.

What's new in v5:
  - Pulls LIVE data directly from MySQL (orders + order_items + menu_items)
  - Falls back to seed Excel if DB is unavailable (dev / offline mode)
  - Auto-retrains every 24 h via APScheduler (continuous learning)
  - Model + scaler persisted to disk so restarts are instant
  - /api/retrain   → trigger manual retrain
  - /api/model-info → last train time, record count, MAE/RMSE

Install extras:
    pip install fastapi uvicorn pandas numpy scikit-learn statsmodels \
                sqlalchemy pymysql apscheduler openpyxl
"""

# ── Imports ───────────────────────────────────────────────────────────────────
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from statsmodels.tsa.statespace.sarimax import SARIMAX
from sqlalchemy import create_engine, text
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
import pickle, os, logging, warnings

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("harvey-analytics")

def _safe(val):
    """Convert NaN/inf to None so JSON serialization never crashes."""
    if val is None:
        return None
    try:
        f = float(val)
        if f != f or f == float("inf") or f == float("-inf"):
            return None
        return f
    except (TypeError, ValueError):
        return val

def _clean(records: list) -> list:
    """Recursively sanitize all float values in a list of dicts."""
    cleaned = []
    for row in records:
        cleaned.append({k: _safe(v) if isinstance(v, float) else v
                        for k, v in row.items()})
    return cleaned

# ── Config ────────────────────────────────────────────────────────────────────
DB_URL        = os.getenv("DB_URL", "mysql+pymysql://root:@localhost:3306/sisigan_pos")
SEED_PATH     = os.getenv("SEED_PATH", "./sales_forecast_seed_data.xlsx")
MODEL_PATH    = "./model_cache.pkl"          # persisted GBR model state
RETRAIN_HOURS = int(os.getenv("RETRAIN_HOURS", "24"))   # auto-retrain interval

# ── Menu item ID → name map (from menu_items table / CSV) ────────────────────
ITEM_MAP: dict[int, str] = {
    1:  "Beef Bulalo",
    2:  "Pancit Bihon Guisado",
    3:  "Crispy Chicharon Bulaklak",
    4:  "Crispy Dinakdakan",
    5:  "Crispy Sisig Barkada",
    6:  "Calamares",
    7:  "Pancit Canton Guisado",
    8:  "Shanghai",
    9:  "Garlic Butter Bangus",
    10: "Crispy Bagnet",
    11: "CM1 Egg + Rice + Hungarian + Sisig",
    12: "CM2 Egg + Rice + Nuggets + Sisig",
    13: "CM3 Egg + Rice + Shanghai + Sisig",
    14: "CM4 Egg + Rice + Bagnet + Nuggets",
    15: "CM5 Egg + Rice + Bagnet + Sisig",
    16: "CM6 Egg + Rice + Hotdog + Sisig",
    17: "CM7 Egg + Rice + Bagnet + Hotdog",
    18: "CM8 Egg + Rice + Bagnet + Hungarian",
    19: "Sisilog",
    20: "Bagnetsilog",
    21: "Hungarian Silog",
    22: "Shanghaisilog",
    23: "Nuggets Silog",
    24: "Hotsilog",
    25: "Siomaisilog",
    26: "Siomairice",
    27: "Dinakdakansilog",
    28: "Chicksilog",
    29: "Bangsilog",
    30: "Porksilog",
    31: "4 in 1",
    32: "Double Cheese",
    33: "Shawarma",
    34: "Hawaiian",
    35: "Beefy Mushroom",
    36: "Ham and Cheese",
    37: "Bacon",
    38: "Pepperoni",
    39: "Sarap",
}
ITEM_COLS = list(ITEM_MAP.values())

# ── Model cache (in-memory, also persisted to disk) ───────────────────────────
_cache: dict = {
    "gbr":         None,   # trained GradientBoostingRegressor
    "rf":          None,   # trained RandomForestRegressor
    "sigma_gbr":   None,   # residual std for CI
    "sigma_rf":    None,
    "last_train":  None,   # datetime of last fit
    "record_count":0,
    "mae":         None,
    "rmse":        None,
    "last_t":      0,
    "last_date":   None,
    "last_known":  [],     # last 21 TotalOrders values
}

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Harvey's Sisigan Analytics API",
    description="Live DB + Continuous-Learning Forecast Service",
    version="5.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
# DATA LAYER
# ══════════════════════════════════════════════════════════════════════════════

def _load_from_db() -> pd.DataFrame | None:
    """
    Pull completed orders from MySQL and pivot into daily item counts.

    Query logic:
      - Only COMPLETED orders (status = 'COMPLETED')
      - Join order_items → menu_items to get item name + daily quantity
      - Pivot: rows = date, columns = menu item names, values = total qty
      - Add TotalOrders, DayOfWeek, DayType columns to match seed schema
    """
    try:
        engine = create_engine(DB_URL, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        sql = text("""
            SELECT
                DATE(o.createdAt)        AS Date,
                oi.menuItemId            AS menuItemId,
                SUM(oi.quantity)         AS qty
            FROM orders o
            JOIN order_items oi ON oi.orderId = o.id
            WHERE o.status = 'COMPLETED'
            GROUP BY DATE(o.createdAt), oi.menuItemId
            ORDER BY Date
        """)
        with engine.connect() as conn:
            raw = pd.read_sql(sql, conn)

        if raw.empty:
            log.warning("DB returned 0 rows — falling back to seed data")
            return None

        # Map menuItemId → item name
        raw["itemName"] = raw["menuItemId"].map(ITEM_MAP)
        raw = raw.dropna(subset=["itemName"])   # drop unknown IDs

        # Pivot to wide format: Date × item
        pivot = raw.pivot_table(index="Date", columns="itemName",
                                values="qty", aggfunc="sum", fill_value=0)
        pivot = pivot.reset_index()
        pivot["Date"] = pd.to_datetime(pivot["Date"])

        # Ensure all 39 items present (fill missing with 0)
        for col in ITEM_COLS:
            if col not in pivot.columns:
                pivot[col] = 0

        pivot["TotalOrders"] = pivot[ITEM_COLS].sum(axis=1)
        pivot["DayOfWeek"]   = pivot["Date"].dt.day_name()
        pivot["DayType"]     = pivot["DayOfWeek"].apply(
            lambda d: "Weekend" if d in ("Saturday", "Sunday") else "Weekday"
        )

        # Keep only days with at least 1 order (skip partial/test days)
        pivot = pivot[pivot["TotalOrders"] > 0].reset_index(drop=True)

        log.info(f"Loaded {len(pivot)} days from DB  ({pivot['Date'].min().date()} → {pivot['Date'].max().date()})")
        return pivot

    except Exception as e:
        log.warning(f"DB unavailable ({e}) — falling back to seed data")
        return None


def _load_from_seed() -> pd.DataFrame:
    """Load the historical Excel seed file as fallback."""
    df = pd.read_excel(SEED_PATH)
    df["Date"] = pd.to_datetime(df["Date"])

    # Rename seed columns that differ from live DB names
    rename_map = {
        "CM1 Egg + Rice + Hungarian":  "CM1 Egg + Rice + Hungarian + Sisig",
        "CM2 Egg + Rice + Nuggets":    "CM2 Egg + Rice + Nuggets + Sisig",
        "CM3 Egg + Rice + Shanghai":   "CM3 Egg + Rice + Shanghai + Sisig",
        "CM4 Egg + Rice + Bagnet":     "CM4 Egg + Rice + Bagnet + Nuggets",
        "CM5 Egg + Rice + Bagnet":     "CM5 Egg + Rice + Bagnet + Sisig",
        "CM6 Egg + Rice + Hotdog":     "CM6 Egg + Rice + Hotdog + Sisig",
        "CM7 Egg + Rice + Bagnet":     "CM7 Egg + Rice + Bagnet + Hotdog",
        "CM8 Egg + Rice + Bagnet":     "CM8 Egg + Rice + Bagnet + Hungarian",
        "Siomai Rice":                 "Siomairice",
        "Overload":                    "Sarap",
    }
    df = df.rename(columns=rename_map)
    log.info(f"Loaded {len(df)} days from seed file")
    return df.sort_values("Date").reset_index(drop=True)


MIN_DAYS = 60   # minimum days needed for reliable stats & lag features

def load_data() -> pd.DataFrame:
    """
    Merge strategy:
      - If DB has >= MIN_DAYS: use DB only
      - If DB has data but < MIN_DAYS: prepend seed data for history,
        then append live DB rows (live rows take priority on overlap)
      - If DB unavailable: use seed only
    """
    live = _load_from_db()
    seed = _load_from_seed()

    if live is None:
        return seed

    if len(live) >= MIN_DAYS:
        return live

    # Not enough live data yet — prepend seed, append live on top
    log.info(f"Live DB has only {len(live)} days — merging with seed for history")
    combined = pd.concat([seed, live], ignore_index=True)
    combined = combined.drop_duplicates(subset=["Date"], keep="last")  # live wins on overlap
    return combined.sort_values("Date").reset_index(drop=True)


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING  (no DayOfWeek / DayType — lag-driven weekly rhythm)
# ══════════════════════════════════════════════════════════════════════════════

ML_FEATURES = [
    "t", "month", "dom", "doy", "week", "quarter",
    "lag1", "lag2", "lag3", "lag7", "lag14", "lag21",
    "roll3_mean", "roll7_mean", "roll14_mean", "roll7_std",
]

def build_ml_frame(series: pd.Series, dates: pd.Series) -> pd.DataFrame:
    df = pd.DataFrame({"Date": dates.values, "y": series.values})
    df["t"]           = np.arange(len(df))
    dates_dt          = pd.to_datetime(df["Date"])
    df["month"]       = dates_dt.dt.month
    df["dom"]         = dates_dt.dt.day
    df["doy"]         = dates_dt.dt.dayofyear
    df["week"]        = dates_dt.dt.isocalendar().week.astype(int)
    df["quarter"]     = dates_dt.dt.quarter
    df["lag1"]        = df["y"].shift(1)
    df["lag2"]        = df["y"].shift(2)
    df["lag3"]        = df["y"].shift(3)
    df["lag7"]        = df["y"].shift(7)
    df["lag14"]       = df["y"].shift(14)
    df["lag21"]       = df["y"].shift(21)
    df["roll3_mean"]  = df["y"].shift(1).rolling(3).mean()
    df["roll7_mean"]  = df["y"].shift(1).rolling(7).mean()
    df["roll14_mean"] = df["y"].shift(1).rolling(14).mean()
    df["roll7_std"]   = df["y"].shift(1).rolling(7).std()
    return df.dropna().reset_index(drop=True)


def rolling_forecast_ml(model, last_known: list, last_date, last_t: int, days: int):
    """Walk-forward: each prediction feeds the next step's lag features."""
    recent = list(last_known)
    preds  = []
    for i in range(1, days + 1):
        fd  = last_date + timedelta(days=i)
        t_  = last_t + i
        mon = fd.month; dom = fd.day; doy = fd.timetuple().tm_yday
        wk  = int(fd.isocalendar()[1]); qt = (fd.month - 1) // 3 + 1
        lag1  = recent[-1]
        lag2  = recent[-2]  if len(recent) >= 2  else recent[-1]
        lag3  = recent[-3]  if len(recent) >= 3  else recent[-1]
        lag7  = recent[-7]  if len(recent) >= 7  else recent[-1]
        lag14 = recent[-14] if len(recent) >= 14 else recent[-1]
        lag21 = recent[-21] if len(recent) >= 21 else recent[-1]
        r3    = float(np.mean(recent[-3:]))
        r7    = float(np.mean(recent[-7:]))
        r14   = float(np.mean(recent[-14:] if len(recent) >= 14 else recent))
        r7s   = float(np.std(recent[-7:]))
        X     = np.array([[t_, mon, dom, doy, wk, qt,
                            lag1, lag2, lag3, lag7, lag14, lag21,
                            r3, r7, r14, r7s]])
        pred  = float(max(0.0, model.predict(X)[0]))
        preds.append((fd, pred))
        recent.append(pred)
        if len(recent) > 21:
            recent.pop(0)
    return preds


def compute_trend_score(df: pd.DataFrame, item: str, window: int = 14) -> dict:
    """
    "Trend" here means recent momentum, not raw popularity:
    % change between the most recent `window` days average and the
    `window` days average right before that. Positive = trending up.

    Falls back to a smaller window if there isn't enough history yet,
    so short-lived items still get a (less confident) score instead of
    crashing the endpoint.
    """
    series = df[item].values
    w = window
    if len(series) < w * 2:
        w = max(3, len(series) // 2)

    recent = series[-w:]
    prior  = series[-w * 2:-w] if len(series) >= w * 2 else series[:w]

    recent_avg = float(np.mean(recent)) if len(recent) else 0.0
    prior_avg  = float(np.mean(prior)) if len(prior) else 0.0

    if prior_avg <= 0:
        # No baseline to compare against — treat any recent sales as
        # a fresh trend rather than dividing by zero.
        growth = 0.0 if recent_avg <= 0 else 100.0
    else:
        growth = round((recent_avg - prior_avg) / prior_avg * 100, 1)

    return {
        "recentAvgDaily": round(recent_avg, 2),
        "priorAvgDaily":  round(prior_avg, 2),
        "growthPct":      growth,
        "trendWindowDays": w,
    }


# ══════════════════════════════════════════════════════════════════════════════
# TRAINING  (called on startup + every RETRAIN_HOURS)
# ══════════════════════════════════════════════════════════════════════════════

CSV_PATH = os.getenv("CSV_PATH", "./training_data_log.csv")

def train_models(df: pd.DataFrame | None = None):
    """Fit GBR + RF on latest data and update _cache."""
    global _cache
    if df is None:
        df = load_data()

    # ── Export training snapshot to CSV ───────────────────────────────────────
    try:
        export_cols = ["Date", "DayOfWeek", "DayType", "TotalOrders"] + ITEM_COLS
        export_cols = [c for c in export_cols if c in df.columns]
        snapshot = df[export_cols].copy()
        snapshot["Date"] = snapshot["Date"].dt.strftime("%Y-%m-%d")
        snapshot["exported_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        write_header = not os.path.exists(CSV_PATH)
        snapshot.to_csv(CSV_PATH, mode="w", index=False, header=True)
        log.info(f"📄 Training data exported → {CSV_PATH} ({len(snapshot)} rows)")
    except Exception as e:
        log.warning(f"CSV export failed: {e}")

    frame = build_ml_frame(df["TotalOrders"], df["Date"])
    X, y  = frame[ML_FEATURES].values, frame["y"].values

    # GBR — shallower trees keep week-to-week variance high (organic curves)
    gbr = GradientBoostingRegressor(
        n_estimators=200, max_depth=4, learning_rate=0.12,
        subsample=0.75, min_samples_leaf=2, random_state=42,
    )
    gbr.fit(X, y)
    gbr_pred  = gbr.predict(X)
    sigma_gbr = float((y - gbr_pred).std())
    mae       = round(float(mean_absolute_error(y, gbr_pred)), 2)
    rmse      = round(float(np.sqrt(mean_squared_error(y, gbr_pred))), 2)

    # RF — kept as alternative model
    rf = RandomForestRegressor(
        n_estimators=300, max_depth=10, min_samples_leaf=3,
        random_state=42, n_jobs=-1,
    )
    rf.fit(X, y)
    sigma_rf = float((y - rf.predict(X)).std())

    _cache.update({
        "gbr":          gbr,
        "rf":           rf,
        "sigma_gbr":    sigma_gbr,
        "sigma_rf":     sigma_rf,
        "last_train":   datetime.now(),
        "record_count": len(df),
        "mae":          mae,
        "rmse":         rmse,
        "last_t":       int(frame["t"].max()),
        "data_end":     df["Date"].max(),          # actual last date in training data
        "last_known":   list(df["TotalOrders"].values[-21:]),
    })

    # Persist to disk so restarts skip retraining
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(_cache, f)

    log.info(f"✅ Models retrained — {len(df)} days | MAE={mae} RMSE={rmse}")


def load_cached_models():
    """Load persisted model from disk on startup if fresh enough."""
    global _cache
    if not os.path.exists(MODEL_PATH):
        return False
    try:
        with open(MODEL_PATH, "rb") as f:
            saved = pickle.load(f)
        age_h = (datetime.now() - saved["last_train"]).total_seconds() / 3600
        if age_h < RETRAIN_HOURS:
            _cache.update(saved)
            log.info(f"Loaded cached model (age {age_h:.1f}h, {saved['record_count']} records)")
            return True
    except Exception as e:
        log.warning(f"Cache load failed: {e}")
    return False


# ══════════════════════════════════════════════════════════════════════════════
# STARTUP + SCHEDULER
# ══════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
def startup():
    if not load_cached_models():
        log.info("No fresh cache found — training now…")
        train_models()

    scheduler = BackgroundScheduler()
    scheduler.add_job(train_models, "interval", hours=RETRAIN_HOURS,
                      id="auto_retrain", replace_existing=True)
    scheduler.start()
    log.info(f"Scheduler started — auto-retrain every {RETRAIN_HOURS}h")


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "Harvey's Analytics Service running", "version": "5.1.0"}


@app.get("/api/model-info")
def model_info():
    """Return metadata about the currently loaded model."""
    if _cache["last_train"] is None:
        raise HTTPException(503, "Model not yet trained")
    return {
        "lastTrainedAt":  _cache["last_train"].isoformat(),
        "recordCount":    _cache["record_count"],
        "trainMAE":       _cache["mae"],
        "trainRMSE":      _cache["rmse"],
        "retrainInterval": f"every {RETRAIN_HOURS}h",
        "dataSource":     "live_db" if _load_from_db() is not None else "seed_excel",
    }


@app.post("/api/retrain")
def manual_retrain(background_tasks: BackgroundTasks):
    """Trigger an immediate retrain in the background."""
    background_tasks.add_task(train_models)
    return {"message": "Retraining started in background"}


@app.get("/api/overview")
def get_overview():
    df    = load_data()
    total = int(df["TotalOrders"].sum())
    avg   = round(float(df["TotalOrders"].mean()), 1)
    best  = df.loc[df["TotalOrders"].idxmax()]
    worst = df.loc[df["TotalOrders"].idxmin()]
    ly    = df[df["Date"].dt.year == datetime.now().year - 1]["TotalOrders"].sum()
    py    = df[df["Date"].dt.year == datetime.now().year - 2]["TotalOrders"].sum()
    yoy   = round((ly - py) / py * 100, 2) if py else 0
    wd    = df[df["DayType"] == "Weekday"]["TotalOrders"].mean()
    we    = df[df["DayType"] == "Weekend"]["TotalOrders"].mean()
    return {
        "totalOrders":       total,
        "avgDailyOrders":    avg,
        "bestDay":  {"date": str(best["Date"].date()),  "dayOfWeek": best["DayOfWeek"],  "orders": int(best["TotalOrders"])},
        "worstDay": {"date": str(worst["Date"].date()), "dayOfWeek": worst["DayOfWeek"], "orders": int(worst["TotalOrders"])},
        "yoyGrowth":         yoy,
        "weekendMultiplier": round(we / wd, 2) if (wd and wd == wd) else 1.0,
        "weekdayAvg":        _safe(round(wd, 1)) if (wd == wd) else 0,
        "weekendAvg":        _safe(round(we, 1)) if (we == we) else 0,
        "dateRange":         {"start": str(df["Date"].min().date()), "end": str(df["Date"].max().date())},
    }


@app.get("/api/daily-orders")
def get_daily_orders(year: int = None):
    df = load_data()
    if year:
        df = df[df["Date"].dt.year == year]
    out = df[["Date","TotalOrders","DayType","DayOfWeek"]].copy()
    out["Date"] = out["Date"].dt.strftime("%Y-%m-%d")
    return out.to_dict(orient="records")


@app.get("/api/weekly-summary")
def get_weekly_summary():
    df    = load_data()
    order = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    g = df.groupby("DayOfWeek")["TotalOrders"].agg(["mean","std","min","max"]).reset_index()
    g.columns = ["dayOfWeek","avg","std","min","max"]
    g[["avg","std"]] = g[["avg","std"]].round(1)
    g["dayOfWeek"] = pd.Categorical(g["dayOfWeek"], categories=order, ordered=True)
    return _clean(g.sort_values("dayOfWeek").to_dict(orient="records"))


@app.get("/api/monthly-summary")
def get_monthly_summary():
    df = load_data()
    df["_year"]  = df["Date"].dt.year
    df["_month"] = df["Date"].dt.month
    g = df.groupby(["_year","_month"])["TotalOrders"].sum().reset_index()
    g.columns = ["year","month","total"]
    names = {1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",
             7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"}
    g["monthName"] = g["month"].map(names)
    return _clean(g.to_dict(orient="records"))


@app.get("/api/top-items")
def get_top_items(n: int = 10, day_type: str = None):
    df = load_data()
    if day_type in ("Weekday","Weekend"):
        df = df[df["DayType"] == day_type]
    means = df[ITEM_COLS].mean().sort_values(ascending=False)
    return [{"rank": i+1, "item": item, "avgDaily": round(val, 2)}
            for i, (item, val) in enumerate(means.head(n).items())]


@app.get("/api/item-trends")
def get_item_trends(item: str = Query(...)):
    df = load_data()
    if item not in ITEM_COLS:
        raise HTTPException(404, f"Item '{item}' not found")
    df["_year"]  = df["Date"].dt.year
    df["_month"] = df["Date"].dt.month
    g = df.groupby(["_year","_month"])[item].mean().reset_index()
    g.columns = ["year","month","avgOrders"]
    g["avgOrders"] = g["avgOrders"].round(2)
    g["label"] = g["year"].astype(str) + "-" + g["month"].astype(str).str.zfill(2)
    return g.to_dict(orient="records")


@app.get("/api/heatmap")
def get_heatmap():
    df    = load_data()
    names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    df["_month"] = df["Date"].dt.month
    p = df.groupby(["DayOfWeek","_month"])["TotalOrders"].mean().reset_index()
    p.columns = ["dayOfWeek","month","avg"]
    p["avg"]       = p["avg"].round(1)
    p["monthName"] = p["month"].apply(lambda m: names[m-1])
    return p.to_dict(orient="records")


# ─── /api/forecast ────────────────────────────────────────────────────────────

@app.get("/api/forecast")
def get_forecast(
    days:  int = Query(30, ge=7, le=90),
    model: str = Query("gbr", regex="^(gbr|rf|sarima)$"),
):
    """
    Demand forecast for the next N days.

    model=gbr    (default) — Gradient Boosting, organic week-to-week curves
    model=rf               — Random Forest, more conservative
    model=sarima           — SARIMA(2,1,2)(1,1,1,7), statistical baseline
    """
    if model in ("gbr","rf"):
        if _cache[model] is None:
            raise HTTPException(503, "Model not ready — call /api/retrain")

        m     = _cache[model]
        sigma = _cache[f"sigma_{model}"]
        mae   = _cache["mae"]
        rmse  = _cache["rmse"]
        label = ("Gradient Boosting" if model == "gbr" else "Random Forest") + \
                " (lag-7/14/21, no day-type features)"

        _today   = pd.Timestamp.today().normalize()
        _gap     = max(0, (_today - _cache["data_end"]).days)
        _last_t  = _cache["last_t"] + _gap
        _last_dt = _today - timedelta(days=1)
        preds = rolling_forecast_ml(
            m, _cache["last_known"], _last_dt, _last_t, days
        )
        forecast = [{
            "date":      str(dt.date()),
            "dayOfWeek": dt.strftime("%A"),
            "dayType":   "Weekend" if dt.weekday() >= 5 else "Weekday",
            "predicted": round(pred),
            "lower":     round(max(0.0, pred - 1.96 * sigma)),
            "upper":     round(pred + 1.96 * sigma),
        } for dt, pred in preds]

    else:
        # SARIMA — fits on each request (slower but statistically grounded)
        df = load_data()
        ts  = df.set_index("Date")["TotalOrders"]
        fit = SARIMAX(ts, order=(2,1,2), seasonal_order=(1,1,1,7),
                      enforce_stationarity=False, enforce_invertibility=False
                      ).fit(disp=False)
        # Skip gap between data end and today, then forecast N days from today
        _today    = pd.Timestamp.today().normalize()
        _gap      = max(0, (_today - df["Date"].max()).days)
        fc_obj    = fit.get_forecast(steps=_gap + days)
        fc_mean   = fc_obj.predicted_mean.iloc[_gap:]
        fc_ci     = fc_obj.conf_int(alpha=0.05).iloc[_gap:]
        mae       = round(float(mean_absolute_error(ts, fit.fittedvalues)), 2)
        rmse      = round(float(np.sqrt(mean_squared_error(ts, fit.fittedvalues))), 2)
        label     = "SARIMA(2,1,2)(1,1,1,7)"

        forecast = [{
            "date":      str(fc_mean.index[i].date()),
            "dayOfWeek": fc_mean.index[i].strftime("%A"),
            "dayType":   "Weekend" if fc_mean.index[i].weekday() >= 5 else "Weekday",
            "predicted": round(max(0.0, float(fc_mean.iloc[i]))),
            "lower":     round(max(0.0, float(fc_ci.iloc[i, 0]))),
            "upper":     round(float(fc_ci.iloc[i, 1])),
        } for i in range(days)]

    weekend_avg = int(round(np.mean([
        r["predicted"] for r in forecast if r["dayType"] == "Weekend"
    ])))

    return {
        "forecast":     forecast,
        "modelMetrics": {"mae": mae, "rmse": rmse},
        "forecastDays": days,
        "weekendAvg":   weekend_avg,
        "model":        label,
    }


# ─── /api/item-forecast ───────────────────────────────────────────────────────

@app.get("/api/item-forecast")
def get_item_forecast(
    item: str = Query(..., description="Menu item name"),
    days: int = Query(30, ge=7, le=90),
):
    """Per-item forecast using Gradient Boosting + lag features."""
    df = load_data()
    if item not in ITEM_COLS:
        raise HTTPException(404, f"Item '{item}' not found")
    if item not in df.columns:
        raise HTTPException(404, f"Item '{item}' not found in loaded data columns. "
                                 "Check that the seed file or DB contains this item.")

    frame = build_ml_frame(df[item], df["Date"])
    if len(frame) < 30:
        raise HTTPException(422, f"Not enough historical data for '{item}' "
                                 f"({len(frame)} usable rows after lag calculation). "
                                 "Item may have sparse or no sales history.")
    X, y  = frame[ML_FEATURES].values, frame["y"].values

    m = GradientBoostingRegressor(
        n_estimators=200, max_depth=4, learning_rate=0.12,
        subsample=0.75, min_samples_leaf=2, random_state=42,
    )
    m.fit(X, y)
    train_pred = m.predict(X)
    sigma = float((y - train_pred).std())
    mae   = round(float(mean_absolute_error(y, train_pred)), 2)
    rmse  = round(float(np.sqrt(mean_squared_error(y, train_pred))), 2)

    _today    = pd.Timestamp.today().normalize()
    _gap      = (_today - df["Date"].max()).days
    preds = rolling_forecast_ml(
        m, list(df[item].values[-21:]),
        _today - timedelta(days=1),
        int(frame["t"].max()) + _gap, days,
    )
    return {
        "item":     item,
        "forecast": [{
            "date":      str(dt.date()),
            "dayOfWeek": dt.strftime("%A"),
            "dayType":   "Weekend" if dt.weekday() >= 5 else "Weekday",
            "predicted": round(pred, 1),
            "lower":     round(max(0.0, pred - 1.96 * sigma), 1),
            "upper":     round(pred + 1.96 * sigma, 1),
        } for dt, pred in preds],
        "modelMetrics": {"mae": mae, "rmse": rmse},
        "model":        "Gradient Boosting (lag-7/14/21, no day-type features)",
    }


# ─── /api/trending-items-forecast ──────────────────────────────────────────────

@app.get("/api/trending-items-forecast")
def get_trending_items_forecast(
    top_n: int = Query(3, ge=1, le=5, description="How many trending items to forecast (1-5)"),
    days:  int = Query(30, ge=7, le=90),
    min_avg_daily: float = Query(
        0.3, ge=0,
        description="Ignore items selling below this avg units/day — filters out "
                     "one-off noise items from artificially topping the trend list"
    ),
):
    """
    Rank menu items by recent sales GROWTH (not raw volume), forecast the
    top N, and return each item's projected total demand over the horizon.

    Trend = % change between the last 14-day average and the 14 days
    before that. An item selling steadily at a high volume with 0% growth
    ranks below a smaller item that's clearly accelerating.

    Response feeds directly into the Node backend's ingredient
    recommendation endpoint: pass each item's `totalForecastQty` as the
    `forecastQty` for that item name.
    """
    df = load_data()

    candidates = []
    for item in ITEM_COLS:
        if item not in df.columns:
            continue
        avg_daily = float(df[item].mean())
        if avg_daily < min_avg_daily:
            continue  # too sparse to trust a trend calculation on
        trend = compute_trend_score(df, item)
        candidates.append({"item": item, "avgDaily": round(avg_daily, 2), **trend})

    # Highest growth % first = most "trending up"
    candidates.sort(key=lambda c: c["growthPct"], reverse=True)
    top_candidates = candidates[:top_n]

    results = []
    for c in top_candidates:
        item = c["item"]
        frame = build_ml_frame(df[item], df["Date"])

        if len(frame) < 30:
            # Not enough history for a reliable model — still report the
            # trend so the item shows up, just without a forecast number.
            results.append({
                **c, "forecast": None, "totalForecastQty": None,
                "note": "Not enough sales history to forecast this item reliably yet",
            })
            continue

        X, y = frame[ML_FEATURES].values, frame["y"].values
        m = GradientBoostingRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.12,
            subsample=0.75, min_samples_leaf=2, random_state=42,
        )
        m.fit(X, y)
        sigma = float((y - m.predict(X)).std())

        _today = pd.Timestamp.today().normalize()
        _gap   = (_today - df["Date"].max()).days
        preds = rolling_forecast_ml(
            m, list(df[item].values[-21:]),
            _today - timedelta(days=1),
            int(frame["t"].max()) + _gap, days,
        )
        forecast = [{
            "date":      str(dt.date()),
            "predicted": round(pred, 1),
            "lower":     round(max(0.0, pred - 1.96 * sigma), 1),
            "upper":     round(pred + 1.96 * sigma, 1),
        } for dt, pred in preds]

        total_qty = round(sum(p["predicted"] for p in forecast), 1)
        results.append({**c, "forecast": forecast, "totalForecastQty": total_qty})

    return {
        "topItems":     results,
        "forecastDays": days,
        "rankedBy":     "sales growth % (recent 14-day avg vs prior 14-day avg)",
    }


@app.get("/api/items")
def list_items():
    return ITEM_COLS