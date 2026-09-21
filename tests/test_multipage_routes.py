import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES = (
    "messages", "performance", "archive", "friends", "library", "notes",
    "ai-assistant", "smart-quran", "handwriting", "madrasati", "robotics-lab",
    "science-lab", "schedule", "assignments", "quizzes", "gradesheet",
    "settings", "solo-study", "group-study", "live-class",
)


class MultipageRoutesTest(unittest.TestCase):
    def test_every_route_exists_in_both_deploy_outputs(self):
        for directory in (ROOT, ROOT / "website"):
            for route in ROUTES:
                page = directory / f"{route}.html"
                self.assertTrue(page.is_file(), page)
                content = page.read_text(encoding="utf-8")
                self.assertIn(f"const route='{route}'", content)
                self.assertIn("fetch('index.html'", content)

    def test_shared_router_maps_all_routes(self):
        router = (ROOT / "website/src/js/37-multipage-routing.js").read_text(encoding="utf-8")
        for route in ROUTES:
            self.assertIn(f"'{route}.html'", router)

    def test_built_and_root_entries_include_router(self):
        built = (ROOT / "website/index.html").read_text(encoding="utf-8")
        root = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("const ZAKIY_PAGE_BY_BUTTON", built)
        self.assertIn("website/src/js/37-multipage-routing.js", root)


if __name__ == "__main__":
    unittest.main()
