from datetime import date, datetime, timezone
import unittest
from unittest.mock import patch

from app.services.national_demand import get_primary_national_demand_forecast


UTC = timezone.utc


class PrimaryDemandForecastTests(unittest.TestCase):
    @patch("app.services.national_demand._get_national_demand_forecast_for_date")
    def test_before_uk_cutoff_uses_today_earliest_forecast(self, get_for_date):
        now = datetime(2026, 11, 2, 9, 19, tzinfo=UTC)

        get_primary_national_demand_forecast(now)

        get_for_date.assert_called_once_with(date(2026, 11, 2), selection="earliest")

    @patch("app.services.national_demand._get_national_demand_forecast_for_date")
    def test_at_uk_cutoff_switches_to_tomorrow_latest_forecast(self, get_for_date):
        now = datetime(2026, 11, 2, 9, 20, tzinfo=UTC)

        get_primary_national_demand_forecast(now)

        get_for_date.assert_called_once_with(date(2026, 11, 3), selection="latest")

    @patch("app.services.national_demand._get_national_demand_forecast_for_date")
    def test_cutoff_uses_london_summer_time(self, get_for_date):
        now = datetime(2026, 7, 1, 8, 20, tzinfo=UTC)

        get_primary_national_demand_forecast(now)

        get_for_date.assert_called_once_with(date(2026, 7, 2), selection="latest")

    def test_rejects_naive_datetime(self):
        with self.assertRaisesRegex(ValueError, "timezone aware"):
            get_primary_national_demand_forecast(datetime(2026, 11, 2, 9, 20))


if __name__ == "__main__":
    unittest.main()
