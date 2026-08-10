"""
سكربت لمرة وحدة: يعبّي عمود profiles.full_name (المضاف بهجرة 003) للطلاب
اللي انضافوا بالجملة قبل ما هذا العمود يصير موجود - الاسم الحقيقي كان
محفوظ أصلًا بـ user_metadata.display_name وقت الإنشاء (school_bulk_add_students)،
بس ما كان يُخزّن بجدول profiles.

يشتغل مرة وحدة، آمن يُعاد تشغيله (يتخطى أي حساب عنده full_name فعلًا).

الاستخدام:
    cd backend && ./venv/bin/python scripts/backfill_full_names.py
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("❌ لازم SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY بملف .env")
    sys.exit(1)

supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def main():
    rows = (
        supabase_admin.table("profiles")
        .select("user_id, username, full_name")
        .eq("role", "student")
        .is_("full_name", "null")
        .execute()
    ).data

    if not rows:
        print("✅ ما فيه طلاب محتاجين تعبئة full_name - كل شي محدّث أصلًا")
        return

    print(f"🔎 لقيت {len(rows)} طالب بدون full_name، جاري التعبئة من بيانات Auth...")
    updated, skipped = 0, 0
    for row in rows:
        try:
            auth_user = supabase_admin.auth.admin.get_user_by_id(row["user_id"]).user
            display_name = (auth_user.user_metadata or {}).get("display_name") if auth_user else None
        except Exception as e:
            print(f"  ⚠️ تعذّر جلب حساب {row['username']}: {e}")
            skipped += 1
            continue

        if not display_name:
            skipped += 1
            continue

        supabase_admin.table("profiles").update({"full_name": display_name}).eq("user_id", row["user_id"]).execute()
        updated += 1
        print(f"  ✅ {row['username']} -> {display_name}")

    print(f"\nتم: {updated} تحديث، {skipped} تخطّي (ما فيه display_name محفوظ لهم أصلًا).")


if __name__ == "__main__":
    main()
