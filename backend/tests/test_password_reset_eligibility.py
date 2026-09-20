import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import app


class PasswordResetEligibilityTests(unittest.TestCase):
    def _call(self, email):
        with app.app.test_request_context(
            "/api/auth/password-reset/eligibility",
            method="POST",
            json={"email": email},
        ):
            return app.password_reset_eligibility()

    def test_route_is_publicly_registered(self):
        rules = {rule.rule: set(rule.methods) for rule in app.app.url_map.iter_rules()}
        self.assertIn("POST", rules["/api/auth/password-reset/eligibility"])

    def test_nonexistent_email_gets_generic_allowed_response(self):
        with patch.object(app, "supabase_admin", MagicMock()), patch.object(
            app, "_list_all_auth_users", return_value=[]
        ):
            response, status = self._call("person@example.com")
        self.assertEqual(status, 200)
        self.assertTrue(response.get_json()["allowed"])

    def test_personal_account_can_use_email_recovery(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"role": None}
        ]
        user = SimpleNamespace(id="personal-1", email="person@example.com")
        with patch.object(app, "supabase_admin", client), patch.object(
            app, "_list_all_auth_users", return_value=[user]
        ):
            response, status = self._call("person@example.com")
        self.assertEqual(status, 200)
        self.assertTrue(response.get_json()["allowed"])

    def test_every_school_role_is_blocked_from_email_recovery(self):
        for role in ("school_admin", "school_administration", "teacher", "student"):
            with self.subTest(role=role):
                client = MagicMock()
                client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                    {"role": role}
                ]
                user = SimpleNamespace(id=f"{role}-1", email=f"{role}@school.test")
                with patch.object(app, "supabase_admin", client), patch.object(
                    app, "_list_all_auth_users", return_value=[user]
                ):
                    response, status = self._call(user.email)
                self.assertEqual(status, 403)
                body = response.get_json()
                self.assertFalse(body["allowed"])
                self.assertTrue(body["institutional"])

    def test_invalid_email_is_rejected(self):
        with patch.object(app, "supabase_admin", MagicMock()):
            response, status = self._call("not-an-email")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
