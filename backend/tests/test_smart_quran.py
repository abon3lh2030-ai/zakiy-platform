import unittest
from unittest.mock import Mock, patch

import app


class SmartQuranTests(unittest.TestCase):
    def setUp(self):
        app._quran_content_cache.clear()

    def test_quran_content_is_cached(self):
        response = Mock()
        response.json.return_value = [{"id": 1, "name": "الفاتحة"}]
        response.raise_for_status.return_value = None
        with patch.object(app.requests, "get", return_value=response) as get:
            first = app._fetch_quran_content("chapters.json")
            second = app._fetch_quran_content("chapters.json")

        self.assertEqual(first, second)
        get.assert_called_once_with(
            "https://quran-json.risanb.com/chapters.json", timeout=15
        )

    def test_invalid_chapter_is_rejected_without_external_request(self):
        client = app.app.test_client()
        with patch.object(app, "_fetch_quran_content") as fetch:
            response = client.get("/api/quran/chapters/0")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "رقم السورة غير صالح")
        fetch.assert_not_called()

    def test_chapter_endpoint_merges_metadata_and_uthmani_text(self):
        client = app.app.test_client()
        with patch.object(
            app,
            "_fetch_quran_content",
            side_effect=[
                {"id": 1, "verses": [{"id": 1, "text": "بِسْمِ اللَّهِ"}]},
                [{"id": 1, "name": "الفاتحة", "total_verses": 7}],
            ],
        ):
            response = client.get("/api/quran/chapters/1")

        self.assertEqual(response.status_code, 200)
        chapter = response.get_json()["chapter"]
        self.assertEqual(chapter["name"], "الفاتحة")
        self.assertEqual(chapter["verses"][0]["text"], "بِسْمِ اللَّهِ")


if __name__ == "__main__":
    unittest.main()
