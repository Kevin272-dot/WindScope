"""Persist verified January Elexon source records for the API to read."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def january_snapshot_path() -> Path:
    """Resolve the shared snapshot path in local development and Docker."""
    repository_data = Path(__file__).resolve().parents[3] / "data"
    docker_data = Path("/data")
    data_dir = docker_data if docker_data.exists() else repository_data
    return data_dir / "snapshots" / "january-2026.json"


def save_january_snapshot(
    *,
    actuals: list[dict[str, Any]],
    forecasts: list[dict[str, Any]],
    actual_publication_from: datetime,
    actual_publication_to: datetime,
    forecast_publication_from: datetime,
    forecast_publication_to: datetime,
) -> Path:
    """Atomically save the retrieved records and enough metadata to identify them."""
    path = january_snapshot_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "metadata": {
            "source": "Elexon Insights BMRS API",
            "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "actuals_dataset": "FUELHH",
            "actuals_fuel_type": "WIND",
            "forecasts_dataset": "WINDFOR",
            "delivery_range_start": "2026-01-01T00:00:00Z",
            "delivery_range_end": "2026-02-01T00:00:00Z",
            "actual_publication_range": {
                "from": actual_publication_from.isoformat().replace("+00:00", "Z"),
                "to": actual_publication_to.isoformat().replace("+00:00", "Z"),
            },
            "forecast_publication_range": {
                "from": forecast_publication_from.isoformat().replace("+00:00", "Z"),
                "to": forecast_publication_to.isoformat().replace("+00:00", "Z"),
            },
            "actual_record_count": len(actuals),
            "forecast_record_count": len(forecasts),
            "transformation_version": "1",
        },
        "actuals": actuals,
        "forecasts": forecasts,
    }

    temporary_path = path.with_suffix(path.suffix + ".tmp")
    try:
        with temporary_path.open("w", encoding="utf-8", newline="\n") as file:
            json.dump(snapshot, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
        temporary_path.replace(path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return path
