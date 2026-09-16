import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import app


class _Response:
    def __init__(self, data):
        self.data = data


class _SettingsQuery:
    def __init__(self, row):
        self.row = row

    def select(self, *_args, **_kwargs): return self
    def eq(self, *_args, **_kwargs): return self
    def limit(self, *_args, **_kwargs): return self
    def execute(self): return _Response([self.row])


class _Supabase:
    def __init__(self, row): self.row = row
    def table(self, name):
        if name != "platform_access_settings":
            raise AssertionError(name)
        return _SettingsQuery(self.row)


class _CheckoutSupabase:
    def __init__(self, profile):
        self.profile = profile
        self.order_insert_attempted = False

    def table(self, name):
        if name == "profiles":
            return _SettingsQuery(self.profile)
        if name == "subscription_orders":
            self.order_insert_attempted = True
        raise AssertionError(name)


class PlatformAccessTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 6, 12, tzinfo=timezone.utc)

    def state(self, **row):
        defaults = {
            "free_access_enabled": False,
            "free_access_starts_at": None,
            "free_access_ends_at": None,
            "updated_at": None,
        }
        defaults.update(row)
        with patch.object(app, "supabase_admin", _Supabase(defaults)):
            return app._platform_access_state(now=self.now)

    def test_immediate_free_access(self):
        self.assertTrue(self.state(free_access_enabled=True)["free_access_active"])

    def test_scheduled_window(self):
        active = self.state(
            free_access_enabled=True,
            free_access_starts_at=(self.now - timedelta(hours=1)).isoformat(),
            free_access_ends_at=(self.now + timedelta(hours=1)).isoformat(),
        )
        future = self.state(
            free_access_enabled=True,
            free_access_starts_at=(self.now + timedelta(hours=1)).isoformat(),
        )
        expired = self.state(
            free_access_enabled=True,
            free_access_ends_at=self.now.isoformat(),
        )
        self.assertTrue(active["free_access_active"])
        self.assertFalse(future["free_access_active"])
        self.assertFalse(expired["free_access_active"])

    def test_free_mode_preserves_tier_but_removes_limits(self):
        with patch.object(app, "_platform_access_state", return_value={"free_access_active": True}):
            resolved = app._resolve_subscription({"subscription_tier": "plus"})
        self.assertEqual(resolved["tier"], "plus")
        self.assertTrue(resolved["unlimited"])
        self.assertFalse(resolved["subscription_unlimited"])

    def test_active_paid_or_school_account_cannot_start_checkout(self):
        with patch.object(app, "_platform_access_state", return_value={"free_access_active": False}):
            self.assertFalse(app._can_start_subscription_checkout({"subscription_tier": "plus"}))
            self.assertFalse(app._can_start_subscription_checkout({"role": "student"}))

    def test_checkout_endpoint_rejects_active_subscription_before_creating_order(self):
        database = _CheckoutSupabase({"subscription_tier": "plus"})
        with (
            app.app.test_request_context(
                "/api/subscription/checkout",
                method="POST",
                json={"plan": "pro", "period": "monthly"},
            ),
            patch.object(app, "supabase_admin", database),
        ):
            app.request.user_id = "subscribed-user"
            _response, status = app.subscription_checkout.__wrapped__()

        self.assertEqual(status, 409)
        self.assertFalse(database.order_insert_attempted)

    def test_expired_subscription_can_start_checkout_again(self):
        profile = {
            "subscription_tier": "pro",
            "subscription_expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
        }
        with patch.object(app, "_platform_access_state", return_value={"free_access_active": False}):
            self.assertTrue(app._can_start_subscription_checkout(profile))

    def test_platform_free_period_does_not_block_a_free_user_from_subscribing(self):
        with patch.object(app, "_platform_access_state", return_value={"free_access_active": True}):
            self.assertTrue(app._can_start_subscription_checkout({"subscription_tier": "free"}))


if __name__ == "__main__":
    unittest.main()
