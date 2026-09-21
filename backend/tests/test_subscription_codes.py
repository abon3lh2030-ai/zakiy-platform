import re
import unittest
from unittest.mock import patch

import app


class _Result:
    def __init__(self, data): self.data = data


class _RpcSupabase:
    def __init__(self, result): self.result = result; self.calls = []
    def rpc(self, name, values): self.calls.append((name, values)); return self
    def execute(self): return _Result(self.result)


class SubscriptionCodeTests(unittest.TestCase):
    def test_generated_redemption_codes_are_exactly_ten_unambiguous_characters(self):
        codes = {app._generate_offer_code() for _ in range(100)}
        self.assertEqual(len(codes), 100)
        self.assertTrue(all(re.fullmatch(r"[A-Z0-9]{10}", code) for code in codes))
        self.assertTrue(all(not set(code) & set("01IO") for code in codes))

    def test_offer_code_normalization_rejects_symbols(self):
        self.assertEqual(app._clean_offer_code(" abcd234567 ", 10, 10), "ABCD234567")
        self.assertIsNone(app._clean_offer_code("ABCD-23456", 10, 10))
        self.assertIsNone(app._clean_offer_code("SHORT", 10, 10))

    def test_discount_amount_is_server_calculated_and_rounded(self):
        self.assertEqual(app._discounted_subscription_amount(19.99, 25), 14.99)
        self.assertEqual(app._discounted_subscription_amount(96, 100), 0)
        self.assertEqual(app._discounted_subscription_amount(99.99, 10), 89.99)

    def test_redeem_endpoint_uses_atomic_database_function(self):
        database = _RpcSupabase({
            "ok": True, "plan": "plus", "period": "monthly",
            "expires_at": "2026-10-21T00:00:00+00:00",
        })
        with (
            app.app.test_request_context("/api/subscription/redeem", method="POST", json={"code": "ABCD234567"}),
            patch.object(app, "supabase_admin", database),
            patch.object(app, "_track_platform_event"),
        ):
            app.request.user_id = "user-1"
            response, status = app.subscription_redeem_code.__wrapped__()

        self.assertEqual(status, 200)
        self.assertEqual(response.get_json()["plan"], "plus")
        self.assertEqual(database.calls, [("redeem_subscription_code", {"p_code": "ABCD234567", "p_user_id": "user-1"})])

    def test_redeem_endpoint_rejects_wrong_length_before_database(self):
        database = _RpcSupabase({"ok": True})
        with (
            app.app.test_request_context("/api/subscription/redeem", method="POST", json={"code": "SHORT"}),
            patch.object(app, "supabase_admin", database),
        ):
            app.request.user_id = "user-1"
            response, status = app.subscription_redeem_code.__wrapped__()
        self.assertEqual(status, 400)
        self.assertFalse(database.calls)


if __name__ == "__main__":
    unittest.main()
