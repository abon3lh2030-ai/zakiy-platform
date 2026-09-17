import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import app


class _Response:
    def __init__(self, data=None):
        self.data = data or []


class _UpdateQuery:
    def __init__(self, table, updates):
        self.table = table
        self.updates = updates

    def eq(self, *_args): return self
    def execute(self): return _Response()


class _RecordingTable:
    def __init__(self, name, database):
        self.name = name
        self.database = database

    def update(self, values):
        self.database.updates.append((self.name, values))
        return _UpdateQuery(self, values)


class _RecordingSupabase:
    def __init__(self):
        self.updates = []

    def table(self, name): return _RecordingTable(name, self)


class _RenewalTable:
    def __init__(self, database): self.database = database
    def select(self, *_args): return self
    def eq(self, *_args): return self
    def limit(self, *_args): return self
    def insert(self, values): self.database.inserted = values; return self
    def execute(self): return _Response([])


class _RenewalSupabase:
    def __init__(self): self.inserted = None
    def table(self, _name): return _RenewalTable(self)


class _MoyasarResponse:
    status_code = 201
    content = b"{}"
    def json(self): return {"status": "paid", "amount": 1999, "currency": "SAR", "id": "pay_1"}


class RecurringSubscriptionTests(unittest.TestCase):
    def test_monthly_and_annual_periods_are_deterministic(self):
        start = datetime(2026, 9, 17, tzinfo=timezone.utc)
        self.assertEqual(app._subscription_period_end(start, "monthly"), start + timedelta(days=30))
        self.assertEqual(app._subscription_period_end(start, "annual"), start + timedelta(days=365))

    def test_trial_offer_expires_and_is_once_only(self):
        now = datetime(2026, 9, 17, tzinfo=timezone.utc)
        active = app._trial_offer_payload({
            "trial_used": False,
            "trial_offer_ends_at": (now + timedelta(hours=1)).isoformat(),
        }, now)
        used = app._trial_offer_payload({
            "trial_used": True,
            "trial_offer_ends_at": (now + timedelta(hours=1)).isoformat(),
        }, now)
        expired = app._trial_offer_payload({
            "trial_used": False,
            "trial_offer_ends_at": now.isoformat(),
        }, now)
        self.assertTrue(active["available"])
        self.assertFalse(used["available"])
        self.assertFalse(expired["available"])

    def test_cancel_only_stops_renewal_and_keeps_profile_access(self):
        database = _RecordingSupabase()
        end = datetime.now(timezone.utc) + timedelta(days=10)
        with (
            app.app.test_request_context("/api/subscription/cancel", method="POST"),
            patch.object(app, "supabase_admin", database),
            patch.object(app, "_billing_row", return_value={"current_period_end": end.isoformat()}),
        ):
            app.request.user_id = "user-1"
            response, status = app.subscription_cancel.__wrapped__()

        self.assertEqual(status, 200)
        self.assertEqual(response.get_json()["active_until"], end.isoformat())
        self.assertEqual([name for name, _ in database.updates], ["web_subscription_billing"])
        self.assertFalse(database.updates[0][1]["auto_renew"])
        self.assertEqual(database.updates[0][1]["status"], "cancel_at_period_end")

    def test_payment_token_extraction_never_accepts_arbitrary_values(self):
        self.assertEqual(app._extract_moyasar_token({"source": {"token": "token_safe"}}), "token_safe")
        self.assertIsNone(app._extract_moyasar_token({"source": {"token": "card-number"}}))
        self.assertIsNone(app._extract_moyasar_token({}))

    def test_renewal_uses_saved_token_and_publishable_key(self):
        now = datetime(2026, 9, 17, tzinfo=timezone.utc)
        billing = {
            "user_id": "user-1", "plan": "plus", "period": "monthly",
            "auto_renew": True, "moyasar_token": "token_safe",
            "next_charge_at": now.isoformat(), "retry_count": 0, "next_retry_at": None,
        }
        database = _RenewalSupabase()
        with (
            patch.object(app, "supabase_admin", database),
            patch.object(app, "MOYASAR_PUBLISHABLE_KEY", "pk_live_example"),
            patch.object(app.requests, "post", return_value=_MoyasarResponse()) as post,
            patch.object(app, "_complete_renewal_attempt", return_value=True),
        ):
            self.assertTrue(app._renew_web_subscription(billing, now))
        self.assertEqual(post.call_args.kwargs["auth"], ("pk_live_example", ""))
        self.assertEqual(post.call_args.kwargs["data"]["source[token]"], "token_safe")
        self.assertEqual(post.call_args.kwargs["data"]["amount"], 1999)
        self.assertEqual(database.inserted["attempt_number"], 1)


if __name__ == "__main__":
    unittest.main()
