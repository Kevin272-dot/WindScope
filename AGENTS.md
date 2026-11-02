# WindScope project guidance

- Keep the data scope limited to Elexon Insights FUELHH actual generation, WINDFOR wind generation forecasts, and NDF national demand forecasts for tomorrow.
- FUELHH contains multiple fuel types: when handling actual wind generation, select only the wind fuel category and retain source fields and timestamps.
- NDF demand values are average MW per settlement period. Convert to daily MWh using each period's duration and keep this demand series distinct from wind generation. Use latest-per-period NDF for tomorrow and earliest-published NDF for historical forecast totals.
- Do not fabricate, interpolate, backfill, or hard-code data, sample values, or analytics. Missing data must remain visibly missing.
- Keep actual generation, wind generation forecasts, and national demand forecasts distinct; label their provenance and units from source documentation.
- Do not add external data providers, deployment configuration, or publishing automation without explicit direction.
- Prefer small, typed React/TypeScript components and explicit Pydantic schemas for API contracts.
- Keep secrets and local environment files out of version control; `.env.example` must contain placeholders only.
