import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app


class AiVoiceModeTests(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()

    @patch.object(app, "create_interaction")
    def test_solo_voice_chat_uses_short_fast_response(self, create_interaction):
        create_interaction.return_value = SimpleNamespace(output_text="رد صوتي قصير", id="voice-1")

        response = self.client.post("/api/chat", json={
            "message": "اشرح لي الفكرة",
            "context": "محتوى الدرس",
            "lang": "ar",
            "voice_mode": True,
        })

        self.assertEqual(response.status_code, 200)
        kwargs = create_interaction.call_args.kwargs
        self.assertEqual(kwargs["generation_config"]["max_output_tokens"], 260)
        self.assertIn("حوار صوتي مباشر", kwargs["input"])

    @patch.object(app, "create_interaction")
    def test_text_chat_keeps_full_response_budget(self, create_interaction):
        create_interaction.return_value = SimpleNamespace(output_text="رد نصي", id="text-1")

        response = self.client.post("/api/chat", json={
            "message": "اشرح بالتفصيل",
            "context": "محتوى الدرس",
            "lang": "ar",
        })

        self.assertEqual(response.status_code, 200)
        kwargs = create_interaction.call_args.kwargs
        self.assertEqual(kwargs["generation_config"]["max_output_tokens"], 800)
        self.assertNotIn("حوار صوتي مباشر", kwargs["input"])


if __name__ == "__main__":
    unittest.main()
