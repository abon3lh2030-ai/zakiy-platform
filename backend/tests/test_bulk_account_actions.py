import unittest
from unittest.mock import patch

import app


class BulkAccountActionHelpersTests(unittest.TestCase):
    def test_bulk_ids_removes_duplicates_and_empty_values(self):
        values, error = app._bulk_ids({"user_ids": ["u1", "", "u1", None, "u2"]}, "user_ids")
        self.assertIsNone(error)
        self.assertEqual(values, ["u1", "u2"])

    def test_bulk_ids_rejects_empty_or_non_list_payloads(self):
        self.assertIsNotNone(app._bulk_ids({"user_ids": []}, "user_ids")[1])
        self.assertIsNotNone(app._bulk_ids({"user_ids": "u1"}, "user_ids")[1])

    def test_bulk_ids_caps_request_size(self):
        values, error = app._bulk_ids({"school_ids": [f"s{i}" for i in range(101)]}, "school_ids")
        self.assertIsNone(values)
        self.assertIn("100", error)

    def test_bulk_routes_are_registered(self):
        rules = {rule.rule: set(rule.methods) for rule in app.app.url_map.iter_rules()}
        self.assertIn("POST", rules["/api/admin/schools/bulk-actions"])
        self.assertIn("POST", rules["/api/school/accounts/bulk-actions"])

    def test_school_administration_bulk_action_keeps_privileged_accounts_protected(self):
        target = {"user_id": "admin-2", "username": "إداري", "role": "school_administration"}
        with app.app.test_request_context(
            "/api/school/accounts/bulk-actions",
            method="POST",
            json={"action": "delete", "user_ids": ["admin-2"]},
        ), patch.object(app, "_school_scoped_profile", return_value=target), \
                patch.object(app, "_delete_school_account") as delete_account:
            app.request.user_id = "admin-1"
            app.request.profile = {"role": "school_administration", "school_id": "school-1"}
            response, status = app.school_bulk_account_actions.__wrapped__.__wrapped__()

        self.assertEqual(status, 200)
        self.assertEqual(len(response.get_json()["failed"]), 1)
        delete_account.assert_not_called()

    def test_school_admin_can_bulk_reset_school_accounts(self):
        targets = {
            "teacher-1": {"user_id": "teacher-1", "username": "معلم", "role": "teacher"},
            "student-1": {"user_id": "student-1", "username": "student", "role": "student"},
        }
        reset_results = [
            ({"id": user_id, "identifier": row["username"], "password": "Temp-123"}, None)
            for user_id, row in targets.items()
        ]
        with app.app.test_request_context(
            "/api/school/accounts/bulk-actions",
            method="POST",
            json={"action": "reset_passwords", "user_ids": list(targets)},
        ), patch.object(app, "_school_scoped_profile", side_effect=lambda user_id: targets[user_id]), \
                patch.object(app, "_reset_school_account_password", side_effect=reset_results) as reset_password:
            app.request.user_id = "school-admin"
            app.request.profile = {"role": "school_admin", "school_id": "school-1"}
            response, status = app.school_bulk_account_actions.__wrapped__.__wrapped__()

        payload = response.get_json()
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["succeeded"]), 2)
        self.assertFalse(payload["failed"])
        self.assertEqual(reset_password.call_count, 2)


if __name__ == "__main__":
    unittest.main()
