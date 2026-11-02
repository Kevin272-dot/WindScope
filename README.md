# WindScope

WindScope uses Elexon Insights **NDF** (day-ahead national demand forecast), **FUELHH** (half-hourly actual generation by fuel type), and **WINDFOR** (wind generation forecasts). No sample values are hardcoded; calculated metrics are derived from source records.

## National demand outlook

The primary outlook uses today's delivery date before 09:20 UK time and switches to tomorrow after the cutoff. `GET /api/demand/day?delivery_date=YYYY-MM-DD` returns the profile for a selected day; `GET /api/demand/tomorrow` remains as a compatibility alias for the primary outlook. NDF reports average demand in MW for each settlement period. The daily energy headline is the sum of each period's average MW multiplied by 0.5 hours; it is available only when every expected settlement period has a valid value. Missing periods remain visible in the interval response and make the daily total unavailable. `GET /api/demand/history?days=20` returns daily totals for the preceding 10–30 completed days, using Elexon's earliest published NDF value for each settlement period. Unlike the historical wind accuracy endpoints, these demand endpoints retrieve NDF from Elexon when requested.

Elexon describes NDF as the National Demand forecast received from NGESO. It includes transmission losses and excludes interconnector flows, station transformer demand, and pumped-storage demand. The forecast issue time and raw source fields are retained with the response.

## Forecast decision cutoff

For this pilot, the primary outlook switches to the next UK delivery date at 09:20 local time. This is a project assumption, not a confirmed client trading procedure. Europe/London timezone rules are used so the cutoff follows GMT and BST.

## Forecast accuracy methodology

FUELHH WIND values are half-hourly average generation in MW; WINDFOR values are hourly forecast generation in MW. The comparison averages the two FUELHH half-hour MW values into the matching delivery hour. If either half-hour value is missing, null, or duplicated, that hourly actual remains missing and is not used as a zero. The source records and timestamps remain available separately.

Metrics use only delivery hours with both a selected pre-cutoff forecast and a valid hourly actual. Error is forecast minus actual, so positive bias means over-forecasting. MAE and RMSE are reported in MW. MAPE is the mean absolute percentage error over paired hours with nonzero actual generation; zero-actual hours are excluded from MAPE and explicitly counted. If there are no paired values (or no nonzero actuals for MAPE), the relevant metric is reported as unavailable, not zero. The ingestion report includes expected hours, paired samples, and missing forecast/actual counts.

Generation values and resolution are taken from [Elexon generation by fuel type](https://bmrs.elexon.co.uk/generation-by-fuel-type) and [Elexon wind generation forecast](https://bmrs.elexon.co.uk/generation-forecast-for-wind-and-solar). The NDF definition is documented in the [Elexon NDF API reference](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/NDF). FUELHH represents metered transmission-connected generation and may not include all embedded wind generation.

## Local development

Requirements: Node.js/npm, Python 3.11+, and optionally Docker Compose.

```sh
# Frontend
cd frontend
npm install
npm run dev

# Backend (in another terminal)
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The frontend uses Vite's `/api` proxy to reach FastAPI at `http://localhost:8000`. The backend health route is `GET /api/health`; API docs are available at `/docs`.

To retrieve and refresh the verified January snapshot, run this from the backend directory after installing dependencies:

```sh
python -m app.services.elexon
```

The command fetches the Elexon data, reports coverage and accuracy, then writes `data/snapshots/january-2026.json`. The verified January snapshot is included in the repository and backend Docker image so a clean checkout has the data required by the wind report. The API reads the snapshot and does not fetch January wind data on each request.

The accuracy endpoint is `GET /api/accuracy?delivery_date=2026-01-01&cutoff_time=09:20`. It returns the selected cutoff, paired and missing hour counts, and accuracy metrics. It returns HTTP 503 until the snapshot has been generated.

To run both services with Docker Compose, use `docker compose up --build` from the repository root. The backend image includes the verified wind snapshot. Copy `.env.example` to `.env` to adjust local ports.

## Data scope

Elexon Insights is the only intended data source. Use NDF for tomorrow's national demand forecast and historical forecast totals, FUELHH for actual generation restricted to the WIND fuel category, and WINDFOR for wind forecasts. Keep all three series distinct, preserve source fields and timestamps, label source units, and surface missing or unavailable data instead of substituting estimates. No Elexon API key is configured in this foundation.

Official API source documentation: [Elexon Insights API Developer Portal](https://developer.data.elexon.co.uk/).
