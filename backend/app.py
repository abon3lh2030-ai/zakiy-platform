import eventlet

# لازم يصير أول شي بالملف قبل أي استيراد ثاني - وإلا يصير تعارض بين
# مقابس SSL العادية ومقابس eventlet "الخضراء" وقت التشغيل بـ gunicorn+eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from functools import wraps
from collections import Counter
from datetime import datetime, timezone
import os
import random
import time
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from pypdf import PdfReader
from google import genai
from google.genai import errors as genai_errors
from supabase import create_client, Client

# تحميل متغيرات البيئة من .env
load_dotenv()

app = Flask(__name__)
CORS(app)
app.json.ensure_ascii = False
socketio = SocketIO(app, cors_allowed_origins="*")

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# عملاء الذكاء الاصطناعي - عدة مفاتيح لتفادي حد الباقة المجانية (429)
GEMINI_MODEL = "gemini-3.6-flash"
_gemini_keys = [
    os.getenv("GEMINI_API_KEY"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3"),
]
gemini_clients = [genai.Client(api_key=k) for k in _gemini_keys if k]


def create_interaction(**kwargs):
    """ينشئ interaction، ولو مفتاح معين تجاوز حصته (429) يجرب المفتاح اللي بعده."""
    last_error = None
    for gemini_client in gemini_clients:
        try:
            return gemini_client.interactions.create(**kwargs)
        except genai_errors.APIError as e:
            if e.code == 429:
                last_error = e
                continue
            raise
    raise last_error


# ---------- حسابات الطلاب (Supabase) ----------
# اختياري بالكامل: لو المفاتيح مو موجودة، الـ endpoints المحمية ترجع 503
# بدل ما تكسر تشغيل بقية المشروع (نفس نمط التعامل المتساهل مع مفاتيح Gemini)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase_admin: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def require_auth(f):
    """يتحقق من Authorization: Bearer <jwt> عبر Supabase ويحط request.user_id."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        if supabase_admin is None:
            return jsonify({"error": "نظام الحسابات مو مفعّل حاليًا بالسيرفر"}), 503

        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip()
        if not token:
            return jsonify({"error": "لازم تسجل الدخول"}), 401

        try:
            user_response = supabase_admin.auth.get_user(token)
            if not user_response or not user_response.user:
                raise ValueError("invalid token")
            request.user_id = user_response.user.id
        except Exception:
            return jsonify({"error": "جلسة غير صالحة، سجل الدخول من جديد"}), 401

        return f(*args, **kwargs)

    return wrapper


# ---------- فحص إن السيرفر شغال ----------
@app.route("/api/health")
def health():
    return jsonify({"status": "ذكيّ شغال ✅"})


# ---------- رفع الملف ----------
@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "ما فيه ملف"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "اسم الملف فاضي"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    return jsonify({"message": "تم الرفع بنجاح", "filename": filename}), 200


# ---------- استخراج النص من PDF ----------
def extract_text_from_pdf(filepath):
    text = ""
    reader = PdfReader(filepath)
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()


@app.route("/api/extract", methods=["POST"])
def extract_text():
    data = request.get_json()
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "لازم ترسل اسم الملف"}), 400

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    if not os.path.exists(filepath):
        return jsonify({"error": "الملف مو موجود"}), 404

    try:
        text = extract_text_from_pdf(filepath)
        return jsonify({"text": text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- دعم تعدد اللغات لردود الذكاء الاصطناعي ----------
# الواجهة تصير عربي/إنجليزي، فردود الذكاء الاصطناعي (تلخيص/اختبار/شات) لازم
# تجي بنفس لغة الواجهة - نضيف توجيه صريح بالإنجليزي وقت الحاجة بدل ما نعيد
# كتابة كل الـ prompts بلغتين
def lang_directive(lang):
    if lang == "en":
        return "\n\nIMPORTANT: Write your entire response in English, regardless of the language of the content/question above."
    return ""


# ---------- تلخيص النص بالذكاء الاصطناعي ----------
@app.route("/api/summarize", methods=["POST"])
def summarize():
    data = request.get_json()
    text = data.get("text")
    lang = data.get("lang", "ar")

    if not text:
        return jsonify({"error": "لازم ترسل نص"}), 400

    try:
        interaction = create_interaction(
            model=GEMINI_MODEL,
            input=(
                "لخّص المحتوى التالي بشكل مرتب ونقاط واضحة باللغة العربية. "
                "اكتب نص عادي فقط بدون أي رموز Markdown مثل ** أو ### أو #:\n\n"
                f"{text}"
                f"{lang_directive(lang)}"
            ),
            # thinking_level منخفض لأن التلخيص مهمة بسيطة، وتفكير الموديل يستهلك
            # من نفس حد max_output_tokens ويقدر يقطع الرد لو خليناه بالوضع الافتراضي
            generation_config={"max_output_tokens": 1500, "thinking_level": "minimal"},
        )
        summary = interaction.output_text
        return jsonify({"summary": summary}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- توليد اختبار من النص ----------
@app.route("/api/generate-quiz", methods=["POST"])
def generate_quiz():
    data = request.get_json()
    text = data.get("text")
    num_questions = data.get("num_questions", 5)
    lang = data.get("lang", "ar")

    if not text:
        return jsonify({"error": "لازم ترسل نص"}), 400

    try:
        prompt = f"""بناءً على المحتوى التالي، سوّي اختبار مكون من {num_questions} أسئلة اختيار من متعدد.
رجّع النتيجة بصيغة JSON فقط بدون أي نص إضافي، بهذا الشكل بالضبط:
[
  {{"question": "نص السؤال", "options": ["أ", "ب", "ج", "د"], "correct_answer": "أ", "topic": "اسم قصير للموضوع الفرعي اللي يقيسه السؤال", "explanation": "شرح قصير سطر أو سطرين ليه هذي الإجابة هي الصحيحة"}}
]

حقل "topic" لازم يكون تصنيف قصير (كلمتين إلى ثلاث كلمات) للموضوع الفرعي من المحتوى
اللي يختبره السؤال بالتحديد، مو وصف عام - نستخدمه لاحقًا نعرف الطالب ضعيف بأي جزء.

حقل "explanation" لازم يكون سطر أو سطرين بالعربية بدون أي رموز Markdown، يشرح
ليه الإجابة الصحيحة هي الصح (يفيد الطالب يفهم غلطه لو اختار إجابة ثانية).
{lang_directive(lang)}

المحتوى:
{text}"""

        interaction = create_interaction(
            model=GEMINI_MODEL,
            input=prompt,
            # نفس السبب: thinking_level منخفض عشان ما ياكل من حد max_output_tokens
            # ويقطع الـ JSON قبل ما يكمل. الحد يتناسب مع عدد الأسئلة (لحد 20) عشان
            # ما ينقطع الرد مع الاختبارات الطويلة - رفعناه شوي بعد إضافة حقل الشرح
            generation_config={
                "max_output_tokens": num_questions * 900 + 1200,
                "thinking_level": "minimal",
            },
        )
        quiz_text = interaction.output_text
        return jsonify({"quiz_raw": quiz_text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- شات مع الذكاء الاصطناعي حول الملف (وضع فردي) ----------
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message")
    interaction_id = data.get("interaction_id")
    context = data.get("context")
    name = data.get("name")
    lang = data.get("lang", "ar")

    if not message:
        return jsonify({"error": "لازم ترسل رسالة"}), 400

    try:
        if interaction_id:
            input_text = f"{message}{lang_directive(lang)}"
        else:
            name_line = f"اسم الطالب: {name}\n" if name else ""
            input_text = (
                "هذا نص ملف دراسي رفعه الطالب:\n\n"
                f"{context}\n\n"
                f"{name_line}"
                "جاوب على أسئلة الطالب المتعلقة بهذا المحتوى فقط، بوضوح واختصار "
                "باللغة العربية، بدون رموز Markdown. لو معروف اسم الطالب خاطبه "
                "باسمه بشكل طبيعي بردك الأول."
                f"{lang_directive(lang)}\n\n"
                f"سؤال الطالب: {message}"
            )

        kwargs = {
            "model": GEMINI_MODEL,
            "input": input_text,
            "generation_config": {"max_output_tokens": 800, "thinking_level": "minimal"},
        }
        if interaction_id:
            kwargs["previous_interaction_id"] = interaction_id

        interaction = create_interaction(**kwargs)
        return jsonify(
            {"reply": interaction.output_text, "interaction_id": interaction.id}
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- مساعد ذكيّ يشرح الموقع نفسه (متاح للجميع بدون تسجيل دخول) ----------
SITE_HELP_SYSTEM_PROMPT = """أنت مساعد داخل منصة "ذكيّ" (Zakiy) - منصة دراسية سعودية تحوّل ملفات PDF
الدراسية لملخصات واختبارات تفاعلية بمساعدة الذكاء الاصطناعي. مهمتك تشرح للطالب
كيف يستخدم الموقع بوضوح واختصار، بالعربية، بدون رموز Markdown.

هذي ميزات الموقع اللي تقدر تشرحها:

**الوضع الفردي**: يرفع الطالب ملف PDF، الموقع يستخرج نصه، يلخّصه، ويولّد منه
اختبار اختيار من متعدد (يحدد الطالب عدد الأسئلة من 5 إلى 20). فيه شات ذكاء
اصطناعي يقدر يسأله عن محتوى الملف. بعد كل سؤال بالاختبار يطلع شرح ليه الإجابة
صحيحة. وقت الاختبار يصير تغبيش على الملخص والنص عشان يركّز، مع زر يقدر يكشفه
بتحذير. فيه مؤقت بومودورو اختياري (25 دقيقة مذاكرة / 5 دقائق راحة).

**الغرفة الجماعية**: طالب ينشئ غرفة يطلع له كود، وزملاءه ينضمون بنفس الكود.
أول من ينضم يصير "الهوست" وهو اللي يرفع الملف ويولّد الاختبار ويحدد مدته
ويبدأه للجميع بنفس الوقت. الهوست يقدر يمنح أي منضم صلاحية يرفع ويبدأ الاختبار
بدلًا عنه. فيه شات نصي بين الأعضاء وصوت جماعي مباشر (اختياري)، يوقفون
تلقائيًا وقت الاختبار عشان محد يغش. بعد كل واحد يسلّم يشوف نتيجته وترتيبه،
وأفضل 3 يطلعون بميداليات.

**الحساب (اختياري)**: يقدر الطالب يسجل حساب بإيميل وكلمة مرور واسم يختاره،
مع مرحلته الدراسية ومستواه. يعطيه هذا: لوحة "أدائي" تتتبع نتائجه ونقاط ضعفه
عبر الوقت، ومكتبة شخصية تحفظ الملفات اللي رفعها قبل عشان يعيد استخدامها
بدون ما يرفعها من جديد كل مرة. بدون حساب يقدر يستخدم كل شي عادي بس بدون حفظ.

جاوب بس عن أسئلة تخص الموقع وكيفية استخدامه. لو سُئلت عن شي مو متعلق بالموقع،
وضّح بلطف إنك مختص بمساعدة الطلاب يفهمون المنصة بس."""


@app.route("/api/site-help", methods=["POST"])
def site_help():
    data = request.get_json()
    message = data.get("message")
    interaction_id = data.get("interaction_id")
    lang = data.get("lang", "ar")

    if not message:
        return jsonify({"error": "لازم ترسل رسالة"}), 400

    try:
        if interaction_id:
            input_text = f"{message}{lang_directive(lang)}"
        else:
            input_text = f"{SITE_HELP_SYSTEM_PROMPT}{lang_directive(lang)}\n\nسؤال الطالب: {message}"

        kwargs = {
            "model": GEMINI_MODEL,
            "input": input_text,
            "generation_config": {"max_output_tokens": 600, "thinking_level": "minimal"},
        }
        if interaction_id:
            kwargs["previous_interaction_id"] = interaction_id

        interaction = create_interaction(**kwargs)
        return jsonify(
            {"reply": interaction.output_text, "interaction_id": interaction.id}
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- تقييم تلقائي للجلسة + حساب سلسلة الأيام المتتالية ----------
# صيغة حتمية بسيطة (مو استدعاء ذكاء اصطناعي) بناءً على نسبة الدرجة والوقت المستغرق
def compute_session_rating(score, total, time_taken):
    if not total:
        return {"stars": 0, "label": "", "fast": False}
    pct = score / total
    if pct >= 0.9:
        stars, label = 5, "ممتاز! 🌟"
    elif pct >= 0.75:
        stars, label = 4, "جيد جدًا 👏"
    elif pct >= 0.6:
        stars, label = 3, "جيد 🙂"
    elif pct >= 0.4:
        stars, label = 2, "يحتاج مراجعة 📖"
    else:
        stars, label = 1, "راجع الملخص مرة ثانية 💪"

    # وقت متوقع تقريبي: دقيقة لكل سؤال - لو أسرع بوضوح مع درجة كويسة، شارة "سريع"
    expected_seconds = total * 60
    fast = bool(time_taken) and time_taken < expected_seconds * 0.6 and pct >= 0.6

    return {"stars": stars, "label": label, "fast": fast}


# ساعات المذاكرة والستريك محسوبة من quiz_attempts الموجودة أصلًا، بدون جدول
# منفصل - يمنع أي تضارب بين عداد مخزّن والبيانات الفعلية
def compute_streak(dates_iso):
    days = set()
    for d in dates_iso:
        try:
            days.add(datetime.fromisoformat(d.replace("Z", "+00:00")).date())
        except Exception:
            continue
    if not days:
        return 0, 0

    sorted_days = sorted(days)
    longest = 1
    run = 1
    for i in range(1, len(sorted_days)):
        diff = (sorted_days[i] - sorted_days[i - 1]).days
        run = run + 1 if diff == 1 else 1
        longest = max(longest, run)

    today = datetime.now(timezone.utc).date()
    gap = (today - sorted_days[-1]).days
    current = run if gap <= 1 else 0
    return current, longest


# ---------- تسجيل نتائج الاختبار وتحليل نقاط الضعف (حسابات اختيارية) ----------
@app.route("/api/quiz-attempt", methods=["POST"])
@require_auth
def record_quiz_attempt():
    data = request.get_json()
    score = data.get("score", 0)
    total = data.get("total", 0)
    time_taken = data.get("time_taken", 0)
    try:
        supabase_admin.table("quiz_attempts").insert(
            {
                "user_id": request.user_id,
                "mode": data.get("mode", "solo"),
                "score": score,
                "total": total,
                "time_taken": time_taken,
                "wrong_topics": data.get("wrong_topics", []),
            }
        ).execute()
        rating = compute_session_rating(score, total, time_taken)
        return jsonify({"ok": True, "rating": rating}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/performance", methods=["GET"])
@require_auth
def get_performance():
    try:
        res = (
            supabase_admin.table("quiz_attempts")
            .select("*")
            .eq("user_id", request.user_id)
            .order("created_at")
            .execute()
        )
        all_rows = res.data
        # صفوف "app_open" مجرد بصمة يوم فتحت فيه المنصة (تخدم حساب الستريك بس) - لا تُحتسب
        # كمحاولة اختبار حقيقية ولا تدخل بمتوسط الدرجات أو ساعات المذاكرة
        attempts = [a for a in all_rows if a.get("mode") != "app_open"]

        topic_counter = Counter()
        total_minutes = 0.0
        for attempt in attempts:
            for topic in attempt.get("wrong_topics") or []:
                topic_counter[topic] += 1
            time_taken = attempt.get("time_taken") or 0
            total_minutes += time_taken / 60
            if attempt.get("total") and attempt.get("score") == attempt.get("total"):
                total_minutes += 60  # بونص ساعة كاملة لكل اختبار بدرجة كاملة
        weak_topics = [
            {"topic": topic, "count": count}
            for topic, count in topic_counter.most_common(10)
        ]

        # الستريك يُحسب من كل الأيام اللي فيها أي نشاط - محاولة اختبار حقيقية أو مجرد فتح
        # للمنصة - عشان يعكس "داومت تفتح المنصة" مو بس "حليت اختبار"
        current_streak, longest_streak = compute_streak(
            [a["created_at"] for a in all_rows if a.get("created_at")]
        )

        return jsonify(
            {
                "attempts": attempts,
                "weak_topics": weak_topics,
                "total_study_minutes": round(total_minutes),
                "current_streak": current_streak,
                "longest_streak": longest_streak,
            }
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- بصمة يوم نشاط (تفتح المنصة) - تخدم حساب الستريك اليومي ----------
# نسجّل صف واحد بس كل يوم (مو كل فتحة تطبيق) عشان ما نتضخّم الجدول بلا داعي.
@app.route("/api/ping-active", methods=["POST"])
@require_auth
def ping_active():
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        existing = (
            supabase_admin.table("quiz_attempts")
            .select("id, created_at")
            .eq("user_id", request.user_id)
            .eq("mode", "app_open")
            .gte("created_at", today)
            .limit(1)
            .execute()
        )
        if existing.data:
            return jsonify({"ok": True, "already_pinged": True}), 200

        supabase_admin.table("quiz_attempts").insert(
            {
                "user_id": request.user_id,
                "mode": "app_open",
                "score": 0,
                "total": 0,
                "time_taken": 0,
                "wrong_topics": [],
            }
        ).execute()
        return jsonify({"ok": True, "already_pinged": False}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- مكتبة الكتب الشخصية (حسابات مسجّلة بس) ----------
# نخزّن النص المستخرج بس، مو الملف نفسه - التطبيق أصلًا ما يحتاج الـ PDF
# بعد استخراج نصه، وهذا يغنينا عن إعداد تخزين ملفات منفصل بالكامل
@app.route("/api/library", methods=["GET"])
@require_auth
def list_library_books():
    try:
        res = (
            supabase_admin.table("library_books")
            .select("id, title, created_at")
            .eq("user_id", request.user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify({"books": res.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/library/<book_id>", methods=["GET"])
@require_auth
def get_library_book(book_id):
    try:
        res = (
            supabase_admin.table("library_books")
            .select("title, extracted_text")
            .eq("id", book_id)
            .eq("user_id", request.user_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "الكتاب مو موجود"}), 404
        return jsonify(res.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/library", methods=["POST"])
@require_auth
def create_library_book():
    data = request.get_json()
    title = (data.get("title") or "").strip()
    extracted_text = data.get("extracted_text") or ""

    if not title or not extracted_text:
        return jsonify({"error": "لازم عنوان ونص مستخرج"}), 400

    try:
        res = (
            supabase_admin.table("library_books")
            .insert({"user_id": request.user_id, "title": title, "extracted_text": extracted_text})
            .execute()
        )
        return jsonify({"id": res.data[0]["id"]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/library/<book_id>", methods=["PATCH"])
@require_auth
def rename_library_book(book_id):
    data = request.get_json()
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "لازم عنوان"}), 400

    try:
        res = (
            supabase_admin.table("library_books")
            .update({"title": title})
            .eq("id", book_id)
            .eq("user_id", request.user_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "الكتاب مو موجود"}), 404
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/library/<book_id>", methods=["DELETE"])
@require_auth
def delete_library_book(book_id):
    try:
        res = (
            supabase_admin.table("library_books")
            .delete()
            .eq("id", book_id)
            .eq("user_id", request.user_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "الكتاب مو موجود"}), 404
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- ملف تعريف الطالب (username قابل للبحث - يخدم ميزة الأصدقاء) ----------
@app.route("/api/profile/sync", methods=["POST"])
@require_auth
def sync_profile():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "لازم اسم مستخدم"}), 400

    try:
        supabase_admin.table("profiles").upsert(
            {"user_id": request.user_id, "username": username}
        ).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


PROFILE_EDITABLE_FIELDS = (
    "bio", "school_name", "is_private",
    "show_performance", "show_library", "show_archive", "show_friends",
)


@app.route("/api/profile", methods=["PATCH"])
@require_auth
def update_profile():
    data = request.get_json() or {}
    patch = {k: data[k] for k in PROFILE_EDITABLE_FIELDS if k in data}
    if not patch:
        return jsonify({"error": "ما فيه شي نحدّثه"}), 400
    if "bio" in patch:
        patch["bio"] = (patch["bio"] or "").strip()[:300]
    if "school_name" in patch:
        patch["school_name"] = (patch["school_name"] or "").strip()[:100]

    try:
        supabase_admin.table("profiles").update(patch).eq("user_id", request.user_id).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _get_friend_status(my_id, other_id):
    if my_id == other_id:
        return "self"
    try:
        res = (
            supabase_admin.table("friend_requests")
            .select("sender_id, receiver_id, status")
            .or_(
                f"and(sender_id.eq.{my_id},receiver_id.eq.{other_id}),"
                f"and(sender_id.eq.{other_id},receiver_id.eq.{my_id})"
            )
            .execute()
        ).data
    except Exception:
        return "none"
    if not res:
        return "none"
    row = res[0]
    if row["status"] == "accepted":
        return "friends"
    return "pending_sent" if row["sender_id"] == my_id else "pending_received"


def _compute_performance_summary(user_id):
    all_rows = (
        supabase_admin.table("quiz_attempts")
        .select("score, total, time_taken, created_at, mode")
        .eq("user_id", user_id)
        .execute()
    ).data
    # صفوف "app_open" تخدم الستريك بس - لا تُحتسب كمحاولة اختبار حقيقية
    res = [a for a in all_rows if a.get("mode") != "app_open"]
    total_minutes = 0.0
    scores = []
    for a in res:
        total_minutes += (a.get("time_taken") or 0) / 60
        if a.get("total") and a.get("score") == a.get("total"):
            total_minutes += 60
        if a.get("total"):
            scores.append(round((a["score"] / a["total"]) * 100))
    current_streak, _ = compute_streak([a["created_at"] for a in all_rows if a.get("created_at")])
    return {
        "attempts_count": len(res),
        "avg_score": round(sum(scores) / len(scores)) if scores else 0,
        "total_study_minutes": round(total_minutes),
        "current_streak": current_streak,
    }


# ---------- نظام الأصدقاء ----------
# البروفايل الكامل: هوية أساسية دايمًا + أقسام (أداء/مكتبة/أرشيف/أصدقاء)
# حسب إعدادات الخصوصية لصاحب البروفايل - يخدم صفحة البروفايل وQR الشخصي
@app.route("/api/profile/<user_id>", methods=["GET"])
@require_auth
def get_profile(user_id):
    try:
        res = (
            supabase_admin.table("profiles")
            .select("user_id, username, bio, school_name, is_private, "
                     "show_performance, show_library, show_archive, show_friends")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            # سباق محتمل: /api/profile/sync ما اكتمل بعد وقت التسجيل (fire-and-forget بالفرونت)
            # لو صاحب البروفايل نفسه يطلبه، ننشئه الحين بدل ما نرجع 404 له عن نفسه
            if user_id == request.user_id:
                username = (
                    supabase_admin.auth.get_user(
                        request.headers.get("Authorization", "").replace("Bearer ", "").strip()
                    ).user.user_metadata.get("username")
                    or "طالب"
                )
                supabase_admin.table("profiles").upsert(
                    {"user_id": request.user_id, "username": username}
                ).execute()
                profile = {"user_id": request.user_id, "username": username}
            else:
                return jsonify({"error": "المستخدم مو موجود"}), 404
        else:
            profile = res.data[0]
        is_owner = user_id == request.user_id
        friend_status = _get_friend_status(request.user_id, user_id)

        result = {
            "user_id": profile["user_id"],
            "username": profile["username"],
            "is_owner": is_owner,
            "friend_status": friend_status,
            "is_private": bool(profile.get("is_private")),
        }

        # البروفايل الخاص: ما نكشف شي غير الاسم لغير صاحبه
        if profile.get("is_private") and not is_owner:
            return jsonify(result), 200

        result["bio"] = profile.get("bio")
        result["school_name"] = profile.get("school_name")

        # القيم الحقيقية المخزّنة (تُرجع دائمًا كما هي بالرد - صفحة الإعدادات تعتمد
        # عليها بالضبط لتعبئة المفاتيح، فلازم تعكس المخزّن مو "هل تظهر للزائر الحالي")
        show_perf_flag = profile.get("show_performance", True)
        show_lib_flag = profile.get("show_library", True)
        show_arch_flag = profile.get("show_archive", True)
        show_friends_flag_raw = profile.get("show_friends", True)
        result["show_performance"] = show_perf_flag
        result["show_library"] = show_lib_flag
        result["show_archive"] = show_arch_flag
        result["show_friends"] = show_friends_flag_raw

        # بوابة تضمين بيانات القسم فعليًا بالرد: صاحب البروفايل يشوف كل شي دائمًا
        # بغض النظر عن إعدادات خصوصيته (هذي بس تتحكم بغيره)
        include_perf = is_owner or show_perf_flag
        include_lib = is_owner or show_lib_flag
        include_arch = is_owner or show_arch_flag
        include_friends = is_owner or show_friends_flag_raw

        if include_perf:
            result["performance"] = _compute_performance_summary(user_id)

        if include_lib:
            lib_res = (
                supabase_admin.table("library_books")
                .select("title")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            ).data
            result["library"] = {"count": len(lib_res), "titles": [b["title"] for b in lib_res[:10]]}

        if include_arch:
            hosted = (
                supabase_admin.table("session_archive").select("*").eq("host_user_id", user_id).execute()
            ).data
            attended = (
                supabase_admin.table("session_archive")
                .select("*")
                .contains("participant_user_ids", [user_id])
                .execute()
            ).data
            merged = {row["id"]: row for row in hosted + attended}
            sessions = sorted(merged.values(), key=lambda r: r.get("created_at") or "", reverse=True)
            result["archive"] = sessions[:10]

        if include_friends:
            as_sender = (
                supabase_admin.table("friend_requests")
                .select("receiver_id")
                .eq("sender_id", user_id)
                .eq("status", "accepted")
                .execute()
            ).data
            as_receiver = (
                supabase_admin.table("friend_requests")
                .select("sender_id")
                .eq("receiver_id", user_id)
                .eq("status", "accepted")
                .execute()
            ).data
            friend_ids = [r["receiver_id"] for r in as_sender] + [r["sender_id"] for r in as_receiver]
            names = {}
            if friend_ids:
                profiles_res = (
                    supabase_admin.table("profiles").select("user_id, username").in_("user_id", friend_ids).execute()
                ).data
                names = {p["user_id"]: p["username"] for p in profiles_res}
            result["friends"] = {
                "count": len(friend_ids),
                "list": [{"user_id": fid, "username": names.get(fid, "?")} for fid in friend_ids[:20]],
            }

        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/search", methods=["GET"])
@require_auth
def search_friends():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"results": []}), 200
    try:
        res = (
            supabase_admin.table("profiles")
            .select("user_id, username")
            .ilike("username", f"%{q}%")
            .neq("user_id", request.user_id)
            .limit(20)
            .execute()
        )
        return jsonify({"results": res.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/request", methods=["POST"])
@require_auth
def send_friend_request():
    data = request.get_json()
    to_user_id = data.get("to_user_id")
    if not to_user_id or to_user_id == request.user_id:
        return jsonify({"error": "مستخدم غير صالح"}), 400

    try:
        existing = (
            supabase_admin.table("friend_requests")
            .select("id")
            .or_(
                f"and(sender_id.eq.{request.user_id},receiver_id.eq.{to_user_id}),"
                f"and(sender_id.eq.{to_user_id},receiver_id.eq.{request.user_id})"
            )
            .execute()
        )
        if existing.data:
            return jsonify({"error": "فيه طلب أو صداقة موجودة أصلًا"}), 400

        supabase_admin.table("friend_requests").insert(
            {"sender_id": request.user_id, "receiver_id": to_user_id, "status": "pending"}
        ).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/requests", methods=["GET"])
@require_auth
def list_friend_requests():
    try:
        incoming = (
            supabase_admin.table("friend_requests")
            .select("id, sender_id, created_at")
            .eq("receiver_id", request.user_id)
            .eq("status", "pending")
            .execute()
        ).data
        outgoing = (
            supabase_admin.table("friend_requests")
            .select("id, receiver_id, created_at")
            .eq("sender_id", request.user_id)
            .eq("status", "pending")
            .execute()
        ).data

        other_ids = [r["sender_id"] for r in incoming] + [r["receiver_id"] for r in outgoing]
        names = {}
        if other_ids:
            profiles_res = (
                supabase_admin.table("profiles").select("user_id, username").in_("user_id", other_ids).execute()
            )
            names = {p["user_id"]: p["username"] for p in profiles_res.data}

        for r in incoming:
            r["username"] = names.get(r["sender_id"], "طالب")
        for r in outgoing:
            r["username"] = names.get(r["receiver_id"], "طالب")

        return jsonify({"incoming": incoming, "outgoing": outgoing}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/accept", methods=["POST"])
@require_auth
def accept_friend_request():
    data = request.get_json()
    request_id = data.get("request_id")
    try:
        res = (
            supabase_admin.table("friend_requests")
            .update({"status": "accepted"})
            .eq("id", request_id)
            .eq("receiver_id", request.user_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "الطلب مو موجود"}), 404
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/reject", methods=["POST"])
@require_auth
def reject_friend_request():
    data = request.get_json()
    request_id = data.get("request_id")
    try:
        supabase_admin.table("friend_requests").delete().eq("id", request_id).eq(
            "receiver_id", request.user_id
        ).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends", methods=["GET"])
@require_auth
def list_friends():
    try:
        as_sender = (
            supabase_admin.table("friend_requests")
            .select("id, receiver_id")
            .eq("sender_id", request.user_id)
            .eq("status", "accepted")
            .execute()
        ).data
        as_receiver = (
            supabase_admin.table("friend_requests")
            .select("id, sender_id")
            .eq("receiver_id", request.user_id)
            .eq("status", "accepted")
            .execute()
        ).data

        friend_ids = [r["receiver_id"] for r in as_sender] + [r["sender_id"] for r in as_receiver]
        names = {}
        if friend_ids:
            profiles_res = (
                supabase_admin.table("profiles").select("user_id, username").in_("user_id", friend_ids).execute()
            )
            names = {p["user_id"]: p["username"] for p in profiles_res.data}

        friends = [{"user_id": fid, "username": names.get(fid, "طالب")} for fid in friend_ids]
        return jsonify({"friends": friends}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/<friend_user_id>", methods=["DELETE"])
@require_auth
def remove_friend(friend_user_id):
    try:
        supabase_admin.table("friend_requests").delete().eq("status", "accepted").or_(
            f"and(sender_id.eq.{request.user_id},receiver_id.eq.{friend_user_id}),"
            f"and(sender_id.eq.{friend_user_id},receiver_id.eq.{request.user_id})"
        ).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- دعوة الأصدقاء لجلسة/كلاس حالية ----------
# الدعوة تُخزّن (مو بث لحظي - ما فيه قناة سوكيت عامة مربوطة بحساب المستخدم
# خارج نطاق الغرف) وتظهر للصديق أول ما يفتح شاشة الأصدقاء بعدها
@app.route("/api/friends/invite", methods=["POST"])
@require_auth
def send_session_invite():
    data = request.get_json()
    to_user_id = data.get("to_user_id")
    room_code = (data.get("room_code") or "").strip().upper()
    room_type = data.get("room_type") if data.get("room_type") in ("quiz", "classroom") else "quiz"
    if not to_user_id or not room_code:
        return jsonify({"error": "بيانات ناقصة"}), 400

    try:
        profile_res = (
            supabase_admin.table("profiles").select("username").eq("user_id", request.user_id).limit(1).execute()
        )
        from_username = profile_res.data[0]["username"] if profile_res.data else None

        supabase_admin.table("session_invites").insert(
            {
                "room_code": room_code,
                "room_type": room_type,
                "from_user_id": request.user_id,
                "from_username": from_username,
                "to_user_id": to_user_id,
            }
        ).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/invites", methods=["GET"])
@require_auth
def list_session_invites():
    try:
        res = (
            supabase_admin.table("session_invites")
            .select("*")
            .eq("to_user_id", request.user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify({"invites": res.data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends/invites/<invite_id>", methods=["DELETE"])
@require_auth
def dismiss_session_invite(invite_id):
    try:
        supabase_admin.table("session_invites").delete().eq("id", invite_id).eq(
            "to_user_id", request.user_id
        ).execute()
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- أرشيف الجلسات الجماعية/الكلاسات المنتهية ----------
@app.route("/api/sessions", methods=["GET"])
@require_auth
def list_sessions():
    try:
        hosted = (
            supabase_admin.table("session_archive")
            .select("*")
            .eq("host_user_id", request.user_id)
            .execute()
        ).data
        attended = (
            supabase_admin.table("session_archive")
            .select("*")
            .contains("participant_user_ids", [request.user_id])
            .execute()
        ).data

        merged = {row["id"]: row for row in hosted + attended}
        sessions = sorted(merged.values(), key=lambda r: r.get("created_at") or "", reverse=True)
        return jsonify({"sessions": sessions}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- غرفة المذاكرة الجماعية (Real-time) ----------
# تخزين الغرف بالذاكرة، كافي بدون قاعدة بيانات.
# الغرفة تُبنى فاضية أول شي (بدون اختبار)، أول من ينضم يصير الهوست، وهو اللي
# يرفع الملف ويولّد الاختبار ويبدأه لاحقًا بضغطة start_quiz.
rooms = {}
# room_code -> {
#   "host_sid": str | None,
#   "host_client_id": str | None,
#   "host_name": str | None,
#   "created_at": float,
#   "room_type": "quiz" | "classroom",
#   "quiz": list | None,
#   "quiz_started_at": float | None,
#   "duration_minutes": float | None,
#   "co_host_client_ids": [str],  # منضمين منحهم الهوست صلاحية الرفع/التوليد/البدء
#   "voice_participants": {sid},  # مشاركين متصلين بالصوت الجماعي حاليًا
#   "muted_client_ids": {str},    # طلاب كتمهم المدرس إجباريًا (كلاس)
#   "raised_hands": [client_id],  # بترتيب الرفع (كلاس)
#   "board_strokes": [stroke],    # سبورة الكلاس (تُبث للمنضمين المتأخرين)
#   "class_started": bool,
#   "participants": {sid: {"name", "score", "total", "finished", "time_taken", "client_id", "user_id"}},
#   "ever_participants": {client_id: {"name", "user_id", "score", "total", "time_taken", "finished"}},
#   # ↑ ما ينحذف عند الـ disconnect (بعكس participants) - يُستخدم لأرشفة الجلسة
# }

ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # بدون أحرف/أرقام تتشابه بالشكل
CHAT_MESSAGE_MAX_LEN = 300


def generate_room_code():
    while True:
        code = "".join(random.choices(ROOM_CODE_CHARS, k=5))
        if code not in rooms:
            return code


def get_leaderboard(room_code):
    room = rooms[room_code]
    co_hosts = room["co_host_client_ids"]
    voice = room["voice_participants"]
    participants = [
        {
            **data,
            "sid": sid,
            "is_co_host": data.get("client_id") in co_hosts,
            "in_voice": sid in voice,
        }
        for sid, data in room["participants"].items()
    ]
    # الدرجة أولاً (الأعلى فوق)، والوقت يفصل بين المتساوين بالدرجة (الأسرع فوق)
    participants.sort(
        key=lambda p: (-p["score"], p["time_taken"]) if p["finished"] else (1, p["name"])
    )
    return participants


def can_manage_content(room, sid):
    """يتحقق هل هذا الـ sid يقدر يرفع/يولّد/يبدأ الاختبار - الهوست الأصلي أو
    أي منضم منحه الهوست صلاحية صريحة."""
    if sid == room["host_sid"]:
        return True
    participant = room["participants"].get(sid)
    return bool(participant and participant.get("client_id") in room["co_host_client_ids"])


@app.route("/api/room/create", methods=["POST"])
def create_room():
    data = request.get_json(silent=True) or {}
    room_type = data.get("room_type") if data.get("room_type") in ("quiz", "classroom") else "quiz"
    room_code = generate_room_code()
    rooms[room_code] = {
        "host_sid": None,
        "host_client_id": None,
        "host_name": None,
        "created_at": time.time(),
        "room_type": room_type,
        "quiz": None,
        "quiz_started_at": None,
        "duration_minutes": None,
        "shared_summary": None,
        "co_host_client_ids": [],
        "voice_participants": set(),
        "muted_client_ids": set(),
        "raised_hands": [],
        "board_strokes": [],
        "class_started": False,
        "chat_enabled": True,
        "participants": {},
        "ever_participants": {},
    }
    return jsonify({"room_code": room_code, "room_type": room_type}), 200


@socketio.on("join_room")
def handle_join_room(data):
    room_code = (data.get("room_code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    client_id = (data.get("client_id") or "").strip()
    token = (data.get("token") or "").strip()

    if room_code not in rooms:
        emit("join_error", {"error": "الغرفة غير موجودة، تأكد من الكود"})
        return
    if not name:
        emit("join_error", {"error": "لازم تكتب اسمك"})
        return

    room = rooms[room_code]

    # ربط اختياري بحساب مسجّل - لو الطالب داخل الجلسة وهو مسجّل دخول، نربط
    # نتيجته بحسابه (ساعات مذاكرة/ستريك/أرشيف) بدون ما نجبره على تسجيل دخول
    user_id = None
    if token and supabase_admin is not None:
        try:
            user_response = supabase_admin.auth.get_user(token)
            if user_response and user_response.user:
                user_id = user_response.user.id
        except Exception:
            user_id = None

    # socket.io يسوي إعادة اتصال تلقائية بعد أي انقطاع بسيط بالنت، وكل reconnect
    # يجيب sid جديد. لو نفس المتصفح (نفس client_id) يرجع ينضم، نلقى مشاركته
    # القديمة ونربطها بالـ sid الجديد بدل ما نصفّرها - وإلا كل انقطاع بسيط
    # بيوقف الشات والتسليم بصمت لأن sid القديم صار ميت
    existing_sid = next(
        (
            sid
            for sid, p in room["participants"].items()
            if client_id and p.get("client_id") == client_id and sid != request.sid
        ),
        None,
    )

    if existing_sid:
        participant = room["participants"].pop(existing_sid)
        participant["name"] = name
    else:
        participant = {"name": name, "score": 0, "total": 0, "finished": False, "time_taken": 0}

    participant["client_id"] = client_id
    participant["user_id"] = user_id
    join_room(room_code)
    room["participants"][request.sid] = participant

    if client_id:
        room["ever_participants"][client_id] = {
            **room["ever_participants"].get(client_id, {}),
            "name": name,
            "user_id": user_id,
        }

    # صفة الهوست مربوطة بـ client_id ثابت مو بالـ sid المتغيّر، عشان الهوست ما
    # يفقد صلاحياته لو النت انقطع عنده لحظيًا (الـ disconnect ينحذف قبل ما
    # يرجع ينضم، فمطابقة sid وحدها ما تكفي لاسترجاع صفة الهوست)
    if room["host_client_id"] is None:
        room["host_client_id"] = client_id
        room["host_sid"] = request.sid
        room["host_name"] = name
    elif client_id and client_id == room["host_client_id"]:
        room["host_sid"] = request.sid
        room["host_name"] = name

    emit(
        "room_state",
        {
            "room_code": room_code,
            "created_at": room["created_at"],
            "room_type": room["room_type"],
            "is_host": room["host_sid"] == request.sid,
            "quiz": room["quiz"],
            "quiz_started_at": room["quiz_started_at"],
            "duration_minutes": room["duration_minutes"],
            "shared_summary": room["shared_summary"],
            "can_manage_content": can_manage_content(room, request.sid),
            "board_strokes": room["board_strokes"],
            "raised_hands": room["raised_hands"],
            "class_started": room["class_started"],
            "chat_enabled": room.get("chat_enabled", True),
        },
    )
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("grant_permission")
def handle_grant_permission(data):
    room_code = (data.get("room_code") or "").strip().upper()
    target_sid = data.get("sid")

    if room_code not in rooms:
        return

    room = rooms[room_code]
    # الهوست الأصلي بس يقدر يمنح الصلاحية (مو أي حد عنده صلاحية أصلًا)
    if request.sid != room["host_sid"] or target_sid not in room["participants"]:
        return

    target_client_id = room["participants"][target_sid].get("client_id")
    if target_client_id and target_client_id not in room["co_host_client_ids"]:
        room["co_host_client_ids"].append(target_client_id)

    emit("permission_granted", {}, to=target_sid)
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("revoke_permission")
def handle_revoke_permission(data):
    room_code = (data.get("room_code") or "").strip().upper()
    target_sid = data.get("sid")

    if room_code not in rooms:
        return

    room = rooms[room_code]
    if request.sid != room["host_sid"] or target_sid not in room["participants"]:
        return

    target_client_id = room["participants"][target_sid].get("client_id")
    if target_client_id in room["co_host_client_ids"]:
        room["co_host_client_ids"].remove(target_client_id)

    emit("permission_revoked", {}, to=target_sid)
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("share_summary")
def handle_share_summary(data):
    room_code = (data.get("room_code") or "").strip().upper()
    summary = (data.get("summary") or "").strip()

    if room_code not in rooms:
        return

    room = rooms[room_code]
    # الهوست أو أي منضم منحه الهوست صلاحية يقدر يشارك الملخص
    if not can_manage_content(room, request.sid) or not summary:
        return

    room["shared_summary"] = summary
    emit("summary_shared", {"summary": summary}, to=room_code)


@socketio.on("start_quiz")
def handle_start_quiz(data):
    room_code = (data.get("room_code") or "").strip().upper()
    quiz = data.get("quiz")
    duration_minutes = data.get("duration_minutes")

    if room_code not in rooms:
        return

    room = rooms[room_code]
    # الهوست أو أي منضم منحه الهوست صلاحية يقدر يبدأ الاختبار للجميع
    if not can_manage_content(room, request.sid) or not quiz or not duration_minutes:
        return

    room["quiz"] = quiz
    room["quiz_started_at"] = time.time()
    room["duration_minutes"] = duration_minutes

    emit(
        "quiz_started",
        {
            "quiz": quiz,
            "started_at": room["quiz_started_at"],
            "duration_minutes": duration_minutes,
        },
        to=room_code,
    )


@socketio.on("chat_message")
def handle_chat_message(data):
    room_code = (data.get("room_code") or "").strip().upper()
    message = (data.get("message") or "").strip()[:CHAT_MESSAGE_MAX_LEN]

    if room_code not in rooms or not message:
        return

    room = rooms[room_code]
    if request.sid not in room["participants"]:
        return
    if not room.get("chat_enabled", True):
        return

    participant = room["participants"][request.sid]
    # ما يقدر يسولف بالشات وهو لسا يحل الاختبار (بعد ما بدأ وقبل ما يسلّم)
    if room["quiz_started_at"] and not participant["finished"]:
        return

    name = participant["name"]
    emit(
        "chat_message",
        {"name": name, "message": message, "ts": time.time()},
        to=room_code,
    )


@socketio.on("toggle_chat")
def handle_toggle_chat(data):
    """يفتح/يقفل شات الغرفة النصي للجميع - المضيف أو أي منضم منحه صلاحية بس."""
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid):
        return
    room["chat_enabled"] = not room.get("chat_enabled", True)
    emit("chat_state", {"enabled": room["chat_enabled"]}, to=room_code)


@socketio.on("typing")
def handle_typing(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms or request.sid not in rooms[room_code]["participants"]:
        return
    name = rooms[room_code]["participants"][request.sid]["name"]
    emit("user_typing", {"name": name}, to=room_code, include_self=False)


@socketio.on("stop_typing")
def handle_stop_typing(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms or request.sid not in rooms[room_code]["participants"]:
        return
    name = rooms[room_code]["participants"][request.sid]["name"]
    emit("user_stop_typing", {"name": name}, to=room_code, include_self=False)


@socketio.on("kick_participant")
def handle_kick_participant(data):
    room_code = (data.get("room_code") or "").strip().upper()
    target_sid = data.get("sid")

    if room_code not in rooms:
        return

    room = rooms[room_code]
    # الهوست بس يقدر يطرد، وما يقدر يطرد نفسه
    if request.sid != room["host_sid"] or target_sid == room["host_sid"]:
        return
    if target_sid not in room["participants"]:
        return

    del room["participants"][target_sid]
    leave_room(room_code, sid=target_sid)

    if target_sid in room["voice_participants"]:
        room["voice_participants"].discard(target_sid)
        emit("voice_peer_left", {"sid": target_sid}, to=room_code)

    emit("kicked", {}, to=target_sid)
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


# ---------- الكلاس المباشر (سبورة + رفع يد + لفة حظ + كتم إجباري) ----------
@socketio.on("start_class")
def handle_start_class(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid):
        return
    room["class_started"] = True
    emit("class_started_event", {}, to=room_code)


@socketio.on("raise_hand")
def handle_raise_hand(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms or request.sid not in rooms[room_code]["participants"]:
        return
    room = rooms[room_code]
    client_id = room["participants"][request.sid].get("client_id")
    if not client_id:
        return
    if client_id in room["raised_hands"]:
        room["raised_hands"].remove(client_id)
    else:
        room["raised_hands"].append(client_id)

    names = {p.get("client_id"): p.get("name") for p in room["participants"].values()}
    hands = [{"client_id": cid, "name": names.get(cid, "طالب")} for cid in room["raised_hands"]]
    emit("hands_update", {"raised": hands}, to=room_code)


@socketio.on("board_stroke")
def handle_board_stroke(data):
    room_code = (data.get("room_code") or "").strip().upper()
    stroke = data.get("stroke")
    if room_code not in rooms or not stroke:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid):
        return
    room["board_strokes"].append(stroke)
    if len(room["board_strokes"]) > 1000:
        room["board_strokes"] = room["board_strokes"][-1000:]
    emit("board_stroke", {"stroke": stroke}, to=room_code, include_self=False)


@socketio.on("board_update_stroke")
def handle_board_update_stroke(data):
    """يحدّث موضع/حجم عنصر نص موجود أصلًا بالسبورة (تحريك/تحجيم) بدل ما نضيف
    stroke جديد - يبحث بالـ id ويعدّل بمكانه، عشان المنضمين المتأخرين يشوفون
    آخر حالة صحيحة وقت الـ replay."""
    room_code = (data.get("room_code") or "").strip().upper()
    stroke_id = data.get("id")
    patch = data.get("patch") or {}
    if room_code not in rooms or not stroke_id:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid):
        return
    for stroke in room["board_strokes"]:
        if stroke.get("id") == stroke_id:
            for key in ("x", "y", "fontSize"):
                if key in patch:
                    stroke[key] = patch[key]
            break
    emit("board_update_stroke", {"id": stroke_id, "patch": patch}, to=room_code, include_self=False)


@socketio.on("board_clear")
def handle_board_clear(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid):
        return
    room["board_strokes"] = []
    emit("board_clear", {}, to=room_code, include_self=False)


@socketio.on("force_mute_participant")
def handle_force_mute_participant(data):
    room_code = (data.get("room_code") or "").strip().upper()
    target_sid = data.get("sid")
    if room_code not in rooms:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid) or target_sid not in room["participants"]:
        return
    target_client_id = room["participants"][target_sid].get("client_id")
    if target_client_id:
        room["muted_client_ids"].add(target_client_id)
    emit("force_muted", {}, to=target_sid)


@socketio.on("lucky_draw")
def handle_lucky_draw(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms:
        return
    room = rooms[room_code]
    if not can_manage_content(room, request.sid) or not room["raised_hands"]:
        emit("lucky_draw_error", {"error": "ما فيه أحد رافع إيده"})
        return

    winner_client_id = random.choice(room["raised_hands"])
    room["raised_hands"].remove(winner_client_id)

    winner_name = next(
        (p.get("name") for p in room["participants"].values() if p.get("client_id") == winner_client_id),
        "طالب",
    )
    names = {p.get("client_id"): p.get("name") for p in room["participants"].values()}
    hands = [{"client_id": cid, "name": names.get(cid, "طالب")} for cid in room["raised_hands"]]

    emit(
        "lucky_draw_result",
        {"winner_client_id": winner_client_id, "winner_name": winner_name},
        to=room_code,
    )
    emit("hands_update", {"raised": hands}, to=room_code)


# ---------- الصوت الجماعي (WebRTC، السيرفر يسوي إشارة signaling بس) ----------
# ما فيه أي صوت يمر على السيرفر - هذي أحداث تنسيق بس (تبادل عروض/إجابات SDP
# ومرشحات ICE) بين المتصفحات مباشرة عبر اتصال WebRTC مباشر (mesh topology،
# مناسب لعدد صغير من المشاركين بغرفة مذاكرة)
@socketio.on("voice_join")
def handle_voice_join(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms or request.sid not in rooms[room_code]["participants"]:
        return

    room = rooms[room_code]
    name = room["participants"][request.sid]["name"]

    existing_peers = [
        {"sid": sid, "name": room["participants"][sid]["name"]}
        for sid in room["voice_participants"]
        if sid != request.sid and sid in room["participants"]
    ]
    room["voice_participants"].add(request.sid)

    emit("voice_existing_peers", {"peers": existing_peers})
    emit("voice_peer_joined", {"sid": request.sid, "name": name}, to=room_code, include_self=False)
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("voice_leave")
def handle_voice_leave(data):
    room_code = (data.get("room_code") or "").strip().upper()
    if room_code not in rooms:
        return
    room = rooms[room_code]
    room["voice_participants"].discard(request.sid)
    emit("voice_peer_left", {"sid": request.sid}, to=room_code, include_self=False)
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("voice_offer")
def handle_voice_offer(data):
    target_sid = data.get("to_sid")
    if not target_sid:
        return
    emit("voice_offer", {"from_sid": request.sid, "offer": data.get("offer")}, to=target_sid)


@socketio.on("voice_answer")
def handle_voice_answer(data):
    target_sid = data.get("to_sid")
    if not target_sid:
        return
    emit("voice_answer", {"from_sid": request.sid, "answer": data.get("answer")}, to=target_sid)


@socketio.on("voice_ice_candidate")
def handle_voice_ice_candidate(data):
    target_sid = data.get("to_sid")
    if not target_sid:
        return
    emit(
        "voice_ice_candidate",
        {"from_sid": request.sid, "candidate": data.get("candidate")},
        to=target_sid,
    )


@socketio.on("submit_score")
def handle_submit_score(data):
    room_code = (data.get("room_code") or "").strip().upper()

    if room_code not in rooms or request.sid not in rooms[room_code]["participants"]:
        return

    room = rooms[room_code]
    score = data.get("score", 0)
    total = data.get("total", 0)
    time_taken = data.get("time_taken", 0)

    participant = room["participants"][request.sid]
    participant.update(
        {"score": score, "total": total, "time_taken": time_taken, "finished": True}
    )

    client_id = participant.get("client_id")
    if client_id and client_id in room["ever_participants"]:
        room["ever_participants"][client_id].update(
            {"score": score, "total": total, "time_taken": time_taken, "finished": True}
        )

    # لو الطالب داخل بحساب مسجّل، تنعد نتيجة الغرفة الجماعية بأدائه الشخصي
    # (ساعات مذاكرة/ستريك/أرشيف) بنفس نمط الفردي - أفضل-جهد، ما يوقف الغرفة لو فشل
    user_id = participant.get("user_id")
    if user_id and supabase_admin is not None:
        try:
            supabase_admin.table("quiz_attempts").insert(
                {
                    "user_id": user_id,
                    "mode": "room",
                    "score": score,
                    "total": total,
                    "time_taken": time_taken,
                    "wrong_topics": data.get("wrong_topics", []),
                }
            ).execute()
        except Exception:
            pass
        emit("session_rating", compute_session_rating(score, total, time_taken), to=request.sid)

    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


ROOM_EMPTY_GRACE_SECONDS = 30  # مهلة قبل حذف الغرفة الفاضية، عشان انقطاع نت مؤقت ما يمسحها قبل ما الكل يرجع يتصل


def _archive_room(room_code, room):
    """يحفظ الجلسة بالأرشيف لو صار فيها نشاط حقيقي (اختبار بدأ أو حصة بدأت) -
    أفضل-جهد، ما توقف حذف الغرفة لو Supabase مو متاح أو فشل الإدراج."""
    had_activity = room.get("quiz_started_at") is not None or room.get("class_started")
    if not had_activity or supabase_admin is None:
        return
    try:
        ever = room["ever_participants"]
        host_client_id = room.get("host_client_id")
        participants_payload = [
            {"name": p.get("name"), "user_id": p.get("user_id"), "score": p.get("score"),
             "total": p.get("total"), "time_taken": p.get("time_taken"), "finished": p.get("finished"),
             "is_host": cid == host_client_id}
            for cid, p in ever.items()
        ]
        participant_user_ids = [p["user_id"] for p in ever.values() if p.get("user_id")]
        supabase_admin.table("session_archive").insert(
            {
                "room_code": room_code,
                "room_type": room.get("room_type", "quiz"),
                "host_name": room.get("host_name"),
                "host_user_id": ever.get(room.get("host_client_id"), {}).get("user_id"),
                "participants": participants_payload,
                "participant_user_ids": participant_user_ids,
                "created_at": datetime.fromtimestamp(room["created_at"], tz=timezone.utc).isoformat(),
            }
        ).execute()
    except Exception:
        pass


def _delete_room_if_still_empty(room_code):
    socketio.sleep(ROOM_EMPTY_GRACE_SECONDS)
    room = rooms.get(room_code)
    if room and not room["participants"]:
        _archive_room(room_code, room)
        del rooms[room_code]


@socketio.on("disconnect")
def handle_disconnect():
    for room_code, room in list(rooms.items()):
        if request.sid not in room["participants"]:
            continue

        del room["participants"][request.sid]
        leave_room(room_code)

        if request.sid in room["voice_participants"]:
            room["voice_participants"].discard(request.sid)
            emit("voice_peer_left", {"sid": request.sid}, to=room_code)

        if room["participants"]:
            emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)
        else:
            socketio.start_background_task(_delete_room_if_still_empty, room_code)
        break


if __name__ == "__main__":
    # allow_unsafe_werkzeug مطلوب محليًا لأن Flask-SocketIO يرفض تشغيل سيرفر Werkzeug
    # الافتراضي بدون تفعيل صريح؛ مناسب هنا لأن المشروع للتطوير المحلي فقط
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
