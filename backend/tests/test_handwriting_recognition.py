import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app


class HandwritingRecognitionTests(unittest.TestCase):
    def _call(self, content=b"image-bytes", filename="notes.png", mime="image/png", context=None):
        fields = {"file": (io.BytesIO(content), filename, mime), "lang": "ar"}
        if context:
            fields["context"] = context
        with app.app.test_request_context(
            "/api/handwriting/recognize",
            method="POST",
            data=fields,
            content_type="multipart/form-data",
        ):
            app.request.user_id = "user-1"
            return app.recognize_handwriting.__wrapped__()

    def test_route_requires_auth_and_is_registered(self):
        rules = {rule.rule: set(rule.methods) for rule in app.app.url_map.iter_rules()}
        self.assertIn("POST", rules["/api/handwriting/recognize"])

    def test_image_is_sent_as_multimodal_input(self):
        interaction = SimpleNamespace(output_text="قانون نيوتن الثاني")
        with patch.object(app, "create_interaction", return_value=interaction) as create:
            response, status = self._call()
        self.assertEqual(status, 200)
        self.assertEqual(response.get_json()["text"], "قانون نيوتن الثاني")
        payload = create.call_args.kwargs["input"]
        self.assertEqual(payload[1]["type"], "image")
        self.assertEqual(payload[1]["mime_type"], "image/png")
        self.assertTrue(payload[1]["data"])

    def test_pdf_is_sent_as_document(self):
        interaction = SimpleNamespace(output_text="نص الدرس")
        with patch.object(app, "create_interaction", return_value=interaction) as create:
            response, status = self._call(filename="lesson.pdf", mime="application/pdf")
        self.assertEqual(status, 200)
        self.assertEqual(create.call_args.kwargs["input"][1]["type"], "document")

    def test_unsupported_file_is_rejected_without_ai_call(self):
        with patch.object(app, "create_interaction") as create:
            response, status = self._call(filename="notes.docx", mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertEqual(status, 400)
        create.assert_not_called()

    def test_solo_context_respects_solo_daily_limit(self):
        with patch.object(app, "_check_and_record_daily_action", return_value=(False, "وصلت للحد اليومي")), \
             patch.object(app, "create_interaction") as create:
            response, status = self._call(context="solo")
        self.assertEqual(status, 402)
        self.assertEqual(response.get_json()["error"], "وصلت للحد اليومي")
        create.assert_not_called()


class AiAssistantDailyLimitTests(unittest.TestCase):
    def test_plan_limits_match_product_requirements(self):
        self.assertEqual(app.SUBSCRIPTION_PLANS["free"]["ai_assistant_daily"], 10)
        self.assertEqual(app.SUBSCRIPTION_PLANS["plus"]["ai_assistant_daily"], 25)
        self.assertEqual(app.SUBSCRIPTION_PLANS["pro"]["ai_assistant_daily"], 40)
        self.assertIsNone(app.SUBSCRIPTION_PLANS["ultimate"]["ai_assistant_daily"])
        self.assertEqual(app._DAILY_LIMIT_KEYS["ai_assistant_message"], "ai_assistant_daily")


if __name__ == "__main__":
    unittest.main()
