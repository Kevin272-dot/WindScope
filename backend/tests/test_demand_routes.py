from datetime import date
from unittest.mock import patch

from fastapi import Response

from app.api.routes import demand_day, router
from app.schemas.demand import NationalDemandForecastResponse


def test_selected_day_route_is_registered_and_returns_forecast_shape():
    response_body = NationalDemandForecastResponse(
        delivery_date=date(2026, 11, 2),
        source_selection="earliest",
        forecast_publish_time=None,
        expected_periods=48,
        observed_periods=0,
        missing_periods=48,
        total_energy_mwh=None,
        peak_demand_mw=None,
        peak_period_start=None,
        intervals=[],
    )
    response = Response()

    assert any(route.path == "/api/demand/day" for route in router.routes)
    with patch(
        "app.api.routes.get_national_demand_forecast_for_date",
        return_value=response_body,
    ):
        forecast = demand_day(response, date(2026, 11, 2))

    assert forecast.delivery_date == date(2026, 11, 2)
    assert forecast.source_selection == "earliest"
    assert response.headers["Cache-Control"] == "no-store"
