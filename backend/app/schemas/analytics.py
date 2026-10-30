from datetime import date, datetime

from pydantic import BaseModel


class AccuracyResponse(BaseModel):
    delivery_date: date
    cutoff: datetime
    expected_hours: int
    paired_hours: int
    missing_forecast_hours: int
    missing_actual_hours: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    mape_percent: float | None
    mape_sample_count: int
    mape_zero_actual_excluded_count: int
