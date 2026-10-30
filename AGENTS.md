# WindScope project guidance

- Keep the data scope limited to Elexon Insights FUELHH actual generation and WINDFOR wind generation forecasts.
- FUELHH contains multiple fuel types: when handling actual wind generation, select only the wind fuel category and retain source fields and timestamps.
- Do not fabricate, interpolate, backfill, or hard-code data, sample values, or analytics. Missing data must remain visibly missing.
- Keep actual and forecast series distinct and label their provenance and units from source documentation.
- Do not add external data providers, deployment configuration, or publishing automation without explicit direction.
- Prefer small, typed React/TypeScript components and explicit Pydantic schemas for API contracts.
- Keep secrets and local environment files out of version control; `.env.example` must contain placeholders only.
