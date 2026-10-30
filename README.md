# WindScope

WindScope is a UK wind generation forecast analytics assignment. Its approved data inputs are Elexon Insights **FUELHH** (half-hourly actual generation by fuel type) and **WINDFOR** (wind generation forecasts). No sample values or calculated metrics are included in this foundation.

## Forecast decision cutoff

For this pilot, the forecast cutoff is assumed to be 09:20 UK local time on the day before delivery, using the EPEX GB hourly day-ahead auction schedule as a reference. This is a project assumption, not a confirmed client trading procedure. Forecasts published after each cutoff are excluded. January 2026 is on GMT, so the cutoff timestamps are also UTC.

## Forecast accuracy methodology

FUELHH WIND values are half-hourly average generation in MW; WINDFOR values are hourly forecast generation in MW. The comparison averages the two FUELHH half-hour MW values into the matching delivery hour. If either half-hour value is missing, null, or duplicated, that hourly actual remains missing and is not used as a zero. The source records and timestamps remain available separately.

Metrics use only delivery hours with both a selected pre-cutoff forecast and a valid hourly actual. Error is forecast minus actual, so positive bias means over-forecasting. MAE and RMSE are reported in MW. MAPE is the mean absolute percentage error over paired hours with nonzero actual generation; zero-actual hours are excluded from MAPE and explicitly counted. If there are no paired values (or no nonzero actuals for MAPE), the relevant metric is reported as unavailable, not zero. The ingestion report includes expected hours, paired samples, and missing forecast/actual counts.

Generation values and resolution are taken from [Elexon generation by fuel type](https://bmrs.elexon.co.uk/generation-by-fuel-type) and [Elexon wind generation forecast](https://bmrs.elexon.co.uk/generation-forecast-for-wind-and-solar). These sources represent metered transmission-connected generation and may not include all embedded wind generation.

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

The command fetches the Elexon data, reports coverage and accuracy, then writes `data/snapshots/january-2026.json`. The API reads that local snapshot; it does not fetch Elexon on each request. The snapshot is local and ignored by Git, so run ingestion on each environment that needs the data.

The accuracy endpoint is `GET /api/accuracy?delivery_date=2026-01-01&cutoff_time=09:20`. It returns the selected cutoff, paired and missing hour counts, and accuracy metrics. It returns HTTP 503 until the snapshot has been generated.

To run both services with Docker Compose, use `docker compose up --build` from the repository root. Copy `.env.example` to `.env` to adjust local ports.

## Data scope

Elexon Insights is the only intended data source. Use FUELHH for actual generation and restrict actual values to the wind fuel category; use WINDFOR for forecast values. Keep actual and forecast records clearly identified, preserve source timestamps and units, and surface missing or unavailable data instead of substituting estimates. No Elexon API key is configured in this foundation.

Official API source documentation: [Elexon Insights API Developer Portal](https://developer.data.elexon.co.uk/).
