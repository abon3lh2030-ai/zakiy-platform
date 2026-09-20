import io
import unittest
from unittest.mock import patch

import app


class SchoolDocumentsTests(unittest.TestCase):
    def _call_upload(self, filename, content=b"example"):
        with app.app.test_request_context(
            "/api/school/documents/upload",
            method="POST",
            data={"file": (io.BytesIO(content), filename), "folder_id": ""},
            content_type="multipart/form-data",
        ):
            app.request.user_id = "manager-1"
            app.request.profile = {"role": "school_admin", "school_id": "school-1"}
            return app.school_upload_document.__wrapped__.__wrapped__()

    def test_routes_are_shared_between_school_management_roles(self):
        rules = {rule.rule: set(rule.methods) for rule in app.app.url_map.iter_rules()}
        self.assertIn("GET", rules["/api/school/documents"])
        self.assertIn("POST", rules["/api/school/documents/upload"])
        self.assertIn("POST", rules["/api/school/document-folders"])
        self.assertIn("DELETE", rules["/api/school/documents/<document_id>"])

    def test_upload_rejects_unsafe_file_extension_before_storage(self):
        with patch.object(app, "supabase_admin") as supabase:
            response, status = self._call_upload("payload.exe")
        self.assertEqual(status, 400)
        self.assertIn("غير مدعوم", response.get_json()["error"])
        supabase.storage.from_.assert_not_called()

    def test_upload_rejects_empty_file_before_storage(self):
        with patch.object(app, "supabase_admin") as supabase:
            response, status = self._call_upload("empty.pdf", b"")
        self.assertEqual(status, 400)
        self.assertIn("فاضي", response.get_json()["error"])
        supabase.storage.from_.assert_not_called()

    def test_file_size_limit_is_twenty_megabytes(self):
        self.assertEqual(app.SCHOOL_DOCUMENT_MAX_BYTES, 20 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()
