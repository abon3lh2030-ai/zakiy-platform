import unittest
from unittest.mock import patch

import app


class MoyasarWebhookAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()

    def post(self, payload):
        return self.client.post("/api/subscription/webhook/moyasar", json=payload)

    def test_rejects_request_when_webhook_secret_is_not_configured(self):
        with (
            patch.object(app, "MOYASAR_SECRET_KEY", "sk_live_example"),
            patch.object(app, "MOYASAR_WEBHOOK_SECRET", None),
        ):
            response = self.post({"secret_token": "correct", "data": {"id": "payment-id"}})

        self.assertEqual(response.status_code, 500)

    def test_rejects_missing_or_incorrect_secret_before_contacting_moyasar(self):
        for payload in (
            {"data": {"id": "payment-id"}},
            {"secret_token": "wrong", "data": {"id": "payment-id"}},
        ):
            with self.subTest(payload=payload):
                with (
                    patch.object(app, "MOYASAR_SECRET_KEY", "sk_live_example"),
                    patch.object(app, "MOYASAR_WEBHOOK_SECRET", "correct"),
                    patch.object(app.requests, "get") as moyasar_get,
                ):
                    response = self.post(payload)

                self.assertEqual(response.status_code, 403)
                moyasar_get.assert_not_called()

    def test_accepts_matching_secret_then_validates_payload(self):
        with (
            patch.object(app, "MOYASAR_SECRET_KEY", "sk_live_example"),
            patch.object(app, "MOYASAR_WEBHOOK_SECRET", "correct"),
            patch.object(app.requests, "get") as moyasar_get,
        ):
            response = self.post({"secret_token": "correct"})

        self.assertEqual(response.status_code, 400)
        moyasar_get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
