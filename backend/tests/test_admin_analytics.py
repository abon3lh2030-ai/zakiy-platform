import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import app


class AdminAnalyticsHelpersTests(unittest.TestCase):
    def test_daily_series_filters_range_and_sums_revenue(self):
        end = datetime(2026, 9, 19, 12, tzinfo=timezone.utc)
        start = end - timedelta(days=7)
        rows = [
            {"at": "2026-09-18T09:00:00+00:00", "amount": 20},
            {"at": "2026-09-18T18:00:00+00:00", "amount": 5.5},
            {"at": "2026-08-01T00:00:00+00:00", "amount": 999},
        ]
        result = app._analytics_series(rows, "at", "amount", "7d", start, end)
        point = next(item for item in result if item["key"] == "2026-09-18")
        self.assertEqual(point["value"], 25.5)
        self.assertNotIn(999, [item["value"] for item in result])

    def test_cumulative_user_growth_never_goes_backwards(self):
        end = datetime(2026, 9, 19, 12, tzinfo=timezone.utc)
        start = end - timedelta(days=3)
        rows = [
            {"created_at": "2026-09-17T10:00:00+00:00"},
            {"created_at": "2026-09-19T08:00:00+00:00"},
        ]
        values = [
            point["value"] for point in app._analytics_series(
                rows, "created_at", None, "7d", start, end, cumulative=True
            )
        ]
        self.assertEqual(values, sorted(values))
        self.assertEqual(values[-1], 2)

    def test_today_uses_hour_buckets(self):
        dt = datetime(2026, 9, 19, 8, 45, tzinfo=timezone.utc)
        self.assertEqual(app._analytics_bucket(dt, "today"), "2026-09-19T08:00:00Z")

    def test_dashboard_endpoint_aggregates_confirmed_revenue_only(self):
        now = datetime.now(timezone.utc)
        users = [{
            "id": "u1", "email": "user@example.com",
            "created_at": (now - timedelta(days=4)).isoformat(),
            "last_sign_in_at": now.isoformat(),
        }]
        tables = {
            "profiles": [{
                "user_id": "u1", "username": "student", "full_name": "طالب",
                "role": None, "subscription_tier": "pro", "subscription_period": "monthly",
                "subscription_expires_at": (now + timedelta(days=20)).isoformat(),
                "subscription_source": "web", "last_active_at": now.isoformat(),
            }],
            "subscription_orders": [
                {"id": "o1", "user_id": "u1", "plan": "pro", "period": "monthly", "amount": 39.99,
                 "currency": "SAR", "status": "paid", "created_at": now.isoformat(), "paid_at": now.isoformat()},
                {"id": "o2", "user_id": "u1", "plan": "ultimate", "period": "annual", "amount": 299.99,
                 "currency": "SAR", "status": "pending", "created_at": now.isoformat(), "paid_at": None},
            ],
            "web_subscription_billing": [],
            "subscription_renewal_attempts": [],
            "platform_analytics_events": [],
        }

        with app.app.test_request_context("/api/admin/analytics?period=30d"), \
                patch.object(app, "_list_all_auth_users", return_value=users), \
                patch.object(app, "_fetch_all_rows", side_effect=lambda table, *_args, **_kwargs: tables[table]):
            response, status = app.admin_platform_analytics.__wrapped__.__wrapped__()

        payload = response.get_json()
        self.assertEqual(status, 200)
        self.assertEqual(payload["metrics"]["total_users"], 1)
        self.assertEqual(payload["metrics"]["current_subscribers"], 1)
        self.assertEqual(payload["metrics"]["total_revenue"], 39.99)
        self.assertEqual(payload["metrics"]["new_subscriptions"], 1)


if __name__ == "__main__":
    unittest.main()
