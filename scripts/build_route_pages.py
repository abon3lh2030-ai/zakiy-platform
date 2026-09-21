#!/usr/bin/env python3
"""Generate small, real HTML entry files for every main Zakiy section.

Each entry keeps its own URL/file while loading the shared built application from
index.html. The injected route marker tells the shared app which section to open
after Supabase restores the authenticated session.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    "messages": "messages.html",
    "performance": "performance.html",
    "archive": "archive.html",
    "friends": "friends.html",
    "library": "library.html",
    "notes": "notes.html",
    "ai-assistant": "ai-assistant.html",
    "smart-quran": "smart-quran.html",
    "handwriting": "handwriting.html",
    "madrasati": "madrasati.html",
    "robotics-lab": "robotics-lab.html",
    "science-lab": "science-lab.html",
    "schedule": "schedule.html",
    "assignments": "assignments.html",
    "quizzes": "quizzes.html",
    "gradesheet": "gradesheet.html",
    "settings": "settings.html",
    "solo-study": "solo-study.html",
    "group-study": "group-study.html",
    "live-class": "live-class.html",
}

TEMPLATE = """<!doctype html>
<html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>ذكيّ</title></head>
<body><p style=\"font-family:sans-serif;text-align:center;margin-top:20vh\">جاري فتح ذكيّ…</p>
<script>
(async()=>{{
  const route={route!r};
  try {{
    const response=await fetch('index.html',{{cache:'no-store'}});
    if(!response.ok) throw new Error('load failed');
    let html=await response.text();
    const marker='<script>window.ZAKIY_ENTRY_ROUTE='+JSON.stringify(route)+';<\\/script>';
    html=html.replace('</head>',marker+'</head>');
    document.open('text/html','replace'); document.write(html); document.close();
  }} catch (_) {{ location.replace('index.html?entry='+encodeURIComponent(route)); }}
}})();
</script></body></html>
"""

for directory in (ROOT, ROOT / "website"):
    for route, filename in ROUTES.items():
        (directory / filename).write_text(TEMPLATE.format(route=route), encoding="utf-8")

print(f"Generated {len(ROUTES)} route pages in root and website/")
