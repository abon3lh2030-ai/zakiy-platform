#!/usr/bin/env python3
"""يجمع كل ملفات src/ (HTML/CSS/JS منفصلة) بملف index.html واحد نهائي جاهز
للنشر - الموقع يُنشر على GitHub Pages كملف ثابت واحد بدون أي خطوة بناء من
عندهم، فلازم نبنيه إحنا محليًا قبل كل رفع.

الاستخدام:
    python3 website/build.py                 # يكتب website/index.html مباشرة
    python3 website/build.py /tmp/out.html    # يكتب لمسار تجربة (بدون لمس index.html)

يقرأ من:  website/src/  (head.html, css/*.css, js/*.js, pages/**/*.html,
                          manifest.json لترتيب صفحات <div class="wrap">)
يكتب في:  website/index.html
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "index.html")

# ترتيب ملفات CSS/JS - نفس ترتيبها الأصلي بالملف الواحد سابقًا (الأرقام
# بادئة الاسم تحفظ الترتيب، بس نصرّح فيه هنا صراحة عشان ما يعتمد البناء
# على ترتيب أسماء ملفات نظام التشغيل)
CSS_ORDER = [
    "00-base", "01-header", "02-hero", "03-cards", "04-dropzone", "05-buttons",
    "06-loading", "07-text-summary", "08-quiz", "09-misc", "10-rooms",
    "11-admin-tables", "12-chat", "13-back-button", "14-pomodoro",
    "15-exam-blur", "16-payment-modal", "17-leaderboard",
    "18-account-performance", "19-sidebar", "20-close-button",
    "21-guest-modal", "22-streak-badge", "23-session-rating", "24-live-class",
    "25-qr-modal", "26-friends-archive", "27-lang-buttons", "28-privacy-toggle",
    "29-profile", "30-subscription", "31-notes", "32-assignments",
    "33-ai-assistant", "34-quizzes",
]

JS_ORDER = [
    "00-globals", "01-i18n", "02-navigation", "03-auth", "04-profile",
    "05-friends", "06-settings", "07-subscriptions", "08-library",
    "09-rooms-core", "10-whiteboard", "11-room-extras", "12-study-flow",
    "13-voice", "14-pomodoro", "15-qr", "16-school-system-core",
    "17-admin-dashboard", "18-school-admin-dashboard", "19-teacher-dashboard",
    "20-student-schedule", "21-messages", "22-broadcast-attendance",
    "23-notes", "24-assignments", "25-ai-assistant", "26-quizzes",
]


def read(*parts):
    with open(os.path.join(SRC, *parts), encoding="utf-8") as f:
        return f.read()


def build():
    out = []

    out.append(read("head.html"))
    out.append("<style>\n")
    for name in CSS_ORDER:
        out.append(read("css", f"{name}.css"))
    out.append("</style>\n")
    out.append("</head>\n")
    out.append('<body class="with-sidebar">\n')
    out.append("<script>\n")
    out.append(read("js", "00-early-theme.js"))
    out.append("</script>\n\n")

    # manifest.json هو مصدر الحقيقة الوحيد لترتيب كل شي بجسم الصفحة (من
    # sidebar لين آخر مودال) - نمشي عليه بالترتيب بدون أي منطق إضافي هنا
    with open(os.path.join(SRC, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    for entry in manifest:
        if entry["type"] == "literal":
            out.append(entry["text"])
        else:
            out.append(read(*entry["path"].split("/")))
            out.append("\n")

    out.append('<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>\n')
    out.append('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n')
    out.append("<script>\n")
    for name in JS_ORDER:
        out.append(read("js", f"{name}.js"))
    out.append("</script>\n")
    out.append("</body>\n")
    out.append("</html>\n")

    return "".join(out)


if __name__ == "__main__":
    result = build()
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"OK - built {OUT} ({len(result)} bytes, {result.count(chr(10))} lines)")
