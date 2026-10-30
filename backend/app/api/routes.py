from datetime import date, time

from fastapi import APIRouter, HTTPException, Query

from app.schemas.analytics import AccuracyResponse
from app.schemas.health import HealthResponse
from app.services.analytics import SnapshotUnavailableError, get_daily_accuracy

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="windscope-api",
        source_datasets=["FUELHH", "WINDFOR"],
    )


@router.get("/accuracy", response_model=AccuracyResponse)
def accuracy(
    delivery_date: date = Query(..., description="Delivery date in January 2026"),
    cutoff_time: time = Query(
        default=time(9, 20),
        description="UK local decision cutoff on the day before delivery",
    ),
) -> AccuracyResponse:
    try:
        return get_daily_accuracy(delivery_date, cutoff_time)
    except SnapshotUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
