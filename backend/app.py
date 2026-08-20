import eventlet

# لازم يصير أول شي بالملف قبل أي استيراد ثاني - وإلا يصير تعارض بين
# مقابس SSL العادية ومقابس eventlet "الخضراء" وقت التشغيل بـ gunicorn+eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from functools import wraps
from collections import Counter
from datetime import datetime, timedelta, timezone
import os
import random
import re
import requests
import secrets
import string
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


def _optional_user_id():
    """يرجّع user_id لو فيه توكن Supabase صالح بالهيدر، وإلا None (ضيف) - بدون
    ما يفشل الطلب أصلًا. تستخدمها endpoints عامة (رفع ملف/إنشاء غرفة) تشتغل
    للضيوف والمسجّلين مع بعض، بس تحتاج تعرف هوية المسجّل لو موجودة (حدود
    الباقات، ربط اختياري بفصل مدرسي، إلخ)."""
    if supabase_admin is None:
        return None
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        return None
    try:
        user_response = supabase_admin.auth.get_user(token)
        return user_response.user.id if user_response and user_response.user else None
    except Exception:
        return None


def require_role(*roles):
    """فوق require_auth: يتأكد إن دور المستخدم (بجدول profiles) من ضمن roles
    المسموحة لهذا الـ endpoint، ويحط request.profile (role/school_id/class_id/
    must_change_password) عشان الدالة تستخدمها بدون ما تعيد جلبها."""

    def decorator(f):
        @wraps(f)
        def role_checked(*args, **kwargs):
            profile = (
                supabase_admin.table("profiles")
                .select("role, school_id, class_id, must_change_password")
                .eq("user_id", request.user_id)
                .limit(1)
                .execute()
            ).data
            if not profile or profile[0]["role"] not in roles:
                return jsonify({"error": "ما عندك صلاحية لهذا الإجراء"}), 403
            request.profile = profile[0]
            return f(*args, **kwargs)

        return require_auth(role_checked)

    return decorator


def require_personal_account(f):
    """عكس require_role - يمنع أي حساب مؤسسي (role موجود: طالب/معلم/إدارة
    مدرسة) من الوصول، لميزات مخصصة للحساب الفردي بس (مثل دفتر الملاحظات)."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        profile = (
            supabase_admin.table("profiles").select("role").eq("user_id", request.user_id).limit(1).execute()
        ).data
        if profile and profile[0].get("role"):
            return jsonify({"error": "هذي الميزة متاحة للحسابات الفردية بس"}), 403
        return f(*args, **kwargs)

    return require_auth(wrapper)


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

    # هذا الـ endpoint مشترك بين ٣ مسارات مختلفة بالواجهة (مذاكرة فردية/إضافة
    # لمكتبتك مباشرة/رفع مادة داخل غرفة أنشأها المضيف أصلًا) - context=solo
    # يوصلنا بس من مسار "مذاكرة فردية" (مطابق تمامًا لحظة UsageLimiter.
    # recordUsage(.soloSession) بتطبيق iOS)؛ المسارين الثانيين ما يحتاجوا هذا
    # الفحص هنا (المكتبة سقفها كلي بمكانه، والغرفة انفحصت أصلًا وقت إنشائها)
    if request.form.get("context") == "solo":
        uid = _optional_user_id()
        allowed, reject_msg = _check_and_record_daily_action(uid, "solo_session")
        if not allowed:
            return jsonify({"error": reject_msg}), 402

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


# ============================================================================
# ---------- المساعد الذكي (محادثات محفوظة متعددة + تلخيص كتب عند الطلب) ----------
# ============================================================================
# سلسلة المحادثة الفعلية مع Gemini محفوظة عند Google نفسها (كل رد مبني على
# آخر interaction_id) - إحنا بس نخزّن النصوص للعرض بقائمة المحادثات + آخر
# interaction_id عشان نكمل نفس السلسلة بدل ما نبدأ وحدة جديدة كل رسالة.
AI_ASSISTANT_SYSTEM_PROMPT = """أنت "ذكيّ" - مساعد دراسي ودود جوّا منصة ذكيّ التعليمية. تسولف مع الطالب
بأي موضوع يبيه، تجاوب أسئلته العامة أو الدراسية بأسلوب واضح ومبسّط وقريب منه،
بالعربية، بدون رموز Markdown. خلك ودود ومرح بأسلوبك، مو رسمي وجاف. لو طلب
منك تلخّص كتاب أو محتوى معيّن، لخصه بوضوح وبنقاط مرتبة تسهّل عليه المراجعة."""


def _ai_conversation_title(text):
    text = " ".join(text.strip().split())
    return text[:40] + ("…" if len(text) > 40 else "")


@app.route("/api/ai/conversations", methods=["GET"])
@require_auth
def list_ai_conversations():
    rows = (
        supabase_admin.table("ai_conversations")
        .select("id, title, book_title, updated_at")
        .eq("user_id", request.user_id)
        .order("updated_at", desc=True)
        .execute()
    ).data
    return jsonify({"conversations": rows}), 200


@app.route("/api/ai/conversations", methods=["POST"])
@require_auth
def create_ai_conversation():
    row = (
        supabase_admin.table("ai_conversations")
        .insert({"user_id": request.user_id, "title": ""})
        .execute()
        .data[0]
    )
    return jsonify(row), 200


@app.route("/api/ai/conversations/<conversation_id>", methods=["GET"])
@require_auth
def get_ai_conversation(conversation_id):
    convo = (
        supabase_admin.table("ai_conversations").select("*").eq("id", conversation_id).eq("user_id", request.user_id)
        .limit(1).execute()
    ).data
    if not convo:
        return jsonify({"error": "المحادثة مو موجودة"}), 404
    messages = (
        supabase_admin.table("ai_messages").select("role, content, created_at").eq("conversation_id", conversation_id)
        .order("created_at").execute()
    ).data
    result = convo[0]
    result["messages"] = messages
    return jsonify(result), 200


@app.route("/api/ai/conversations/<conversation_id>", methods=["DELETE"])
@require_auth
def delete_ai_conversation(conversation_id):
    res = (
        supabase_admin.table("ai_conversations").delete().eq("id", conversation_id).eq("user_id", request.user_id).execute()
    )
    if not res.data:
        return jsonify({"error": "المحادثة مو موجودة"}), 404
    return jsonify({"ok": True}), 200


@app.route("/api/ai/conversations/<conversation_id>/messages", methods=["POST"])
@require_auth
def send_ai_message(conversation_id):
    """رسالة عادية ({content}) أو طلب تلخيص كتاب ({book_title, book_text}) -
    الاثنين يمرون بنفس مسار الحفظ/الرد، بس نص الطلب المُرسل فعليًا لـ Gemini
    يختلف (الرسالة المعروضة بالمحادثة تبقى مختصرة "📚 لخّص: العنوان")."""
    convo_rows = (
        supabase_admin.table("ai_conversations").select("*").eq("id", conversation_id).eq("user_id", request.user_id)
        .limit(1).execute()
    ).data
    if not convo_rows:
        return jsonify({"error": "المحادثة مو موجودة"}), 404
    convo = convo_rows[0]

    data = request.get_json(silent=True) or {}
    lang = data.get("lang", "ar")
    book_title = (data.get("book_title") or "").strip()
    book_text = data.get("book_text") or ""

    if book_title and book_text:
        display_message = f"📚 لخّص: {book_title}"
        prompt_message = (
            f'لخّص لي محتوى الكتاب/الملف التالي بعنوان "{book_title}" بشكل واضح ومنظم '
            f"بنقاط، يركّز على أهم الأفكار والمعلومات اللي تفيد الطالب وقت المراجعة:\n\n{book_text}"
        )
    else:
        display_message = (data.get("content") or "").strip()
        prompt_message = display_message
    if not display_message:
        return jsonify({"error": "لازم ترسل رسالة"}), 400

    try:
        if convo.get("last_interaction_id"):
            input_text = f"{prompt_message}{lang_directive(lang)}"
        else:
            input_text = f"{AI_ASSISTANT_SYSTEM_PROMPT}{lang_directive(lang)}\n\nالطالب: {prompt_message}"

        kwargs = {
            "model": GEMINI_MODEL,
            "input": input_text,
            "generation_config": {"max_output_tokens": 800, "thinking_level": "minimal"},
        }
        if convo.get("last_interaction_id"):
            kwargs["previous_interaction_id"] = convo["last_interaction_id"]

        interaction = create_interaction(**kwargs)
        reply = interaction.output_text
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    supabase_admin.table("ai_messages").insert(
        [
            {"conversation_id": conversation_id, "role": "user", "content": display_message},
            {"conversation_id": conversation_id, "role": "assistant", "content": reply},
        ]
    ).execute()

    patch = {"last_interaction_id": interaction.id, "updated_at": datetime.now(timezone.utc).isoformat()}
    if not convo.get("title"):
        patch["title"] = _ai_conversation_title(display_message)
    if book_title and not convo.get("book_title"):
        patch["book_title"] = book_title
    supabase_admin.table("ai_conversations").update(patch).eq("id", conversation_id).execute()

    return jsonify({"reply": reply, "title": patch.get("title", convo.get("title"))}), 200


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

        # حد "الأداء" حسب الباقة - آخر N محاولة بس (attempts أصلًا تصاعدي
        # بالوقت، فـ[-N:] يعطينا آخر N مع الحفاظ على نفس الترتيب التصاعدي).
        # الستريك والمواضيع الضعيفة تفضل محسوبة من كل البيانات - القيد على
        # عرض المحاولات بس، مو على تتبّع النشاط العام
        performance_limit = _resolve_performance_limit(request.user_id)
        if performance_limit is not None:
            attempts = attempts[-performance_limit:]

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

    # سقف تخزين كلي (مو يومي) حسب الباقة - عدد الكتب المحفوظة فعليًا الآن،
    # حساب مؤسسي أو باقة ألتميت (library_limit=None) يتخطّون الفحص
    library_limit = _resolved_plan_for_user(request.user_id)["library_limit"]
    if library_limit is not None:
        current_count = (
            supabase_admin.table("library_books").select("id", count="exact").eq("user_id", request.user_id).execute()
        ).count or 0
        if current_count >= library_limit:
            return jsonify({"error": "وصلت الحد الأقصى لعدد الكتب بمكتبتك - رقّي اشتراكك من الإعدادات عشان تضيف أكثر"}), 402

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


# ---------- دفتر الملاحظات (حسابات فردية بس - ما يظهر لأي حساب مؤسسي) ----------
@app.route("/api/notes/folders", methods=["GET"])
@require_personal_account
def list_note_folders():
    rows = (
        supabase_admin.table("note_folders")
        .select("*")
        .eq("user_id", request.user_id)
        .order("created_at", desc=False)
        .execute()
    ).data
    return jsonify({"folders": rows}), 200


@app.route("/api/notes/folders", methods=["POST"])
@require_personal_account
def create_note_folder():
    name = ((request.get_json(silent=True) or {}).get("name") or "").strip()
    if not name:
        return jsonify({"error": "لازم اسم للمجلد"}), 400
    row = (
        supabase_admin.table("note_folders").insert({"user_id": request.user_id, "name": name}).execute().data[0]
    )
    return jsonify(row), 200


@app.route("/api/notes/folders/<folder_id>", methods=["PATCH"])
@require_personal_account
def update_note_folder(folder_id):
    name = ((request.get_json(silent=True) or {}).get("name") or "").strip()
    if not name:
        return jsonify({"error": "لازم اسم للمجلد"}), 400
    res = (
        supabase_admin.table("note_folders")
        .update({"name": name})
        .eq("id", folder_id)
        .eq("user_id", request.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "المجلد مو موجود"}), 404
    return jsonify(res.data[0]), 200


@app.route("/api/notes/folders/<folder_id>", methods=["DELETE"])
@require_personal_account
def delete_note_folder(folder_id):
    """حذف المجلد بس - الملاحظات جواه ما تنحذف، ترجع "بدون مجلد" (ON DELETE
    SET NULL على مستوى قاعدة البيانات نفسها، مو منطق هنا)."""
    res = (
        supabase_admin.table("note_folders")
        .delete()
        .eq("id", folder_id)
        .eq("user_id", request.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "المجلد مو موجود"}), 404
    return jsonify({"ok": True}), 200


@app.route("/api/notes", methods=["GET"])
@require_personal_account
def list_notes():
    """يدعم فلترة بمجلد (folder_id) وبحث نصي بالعنوان أو المحتوى (q) - يرجّع
    المثبّتة أول دايمًا، ثم الباقي بأحدث تحديث."""
    folder_id = request.args.get("folder_id")
    q = (request.args.get("q") or "").strip()
    query = supabase_admin.table("notes").select(
        "id, folder_id, title, note_type, is_pinned, created_at, updated_at"
    ).eq("user_id", request.user_id)
    if folder_id:
        query = query.eq("folder_id", folder_id)
    if q:
        safe_q = q.replace(",", " ").replace("%", " ")
        query = query.or_(f"title.ilike.%{safe_q}%,content.ilike.%{safe_q}%")
    rows = query.order("is_pinned", desc=True).order("updated_at", desc=True).execute().data
    return jsonify({"notes": rows}), 200


@app.route("/api/notes/<note_id>", methods=["GET"])
@require_personal_account
def get_note(note_id):
    rows = (
        supabase_admin.table("notes").select("*").eq("id", note_id).eq("user_id", request.user_id).limit(1).execute()
    ).data
    if not rows:
        return jsonify({"error": "الملاحظة مو موجودة"}), 404
    return jsonify(rows[0]), 200


@app.route("/api/notes", methods=["POST"])
@require_personal_account
def create_note():
    data = request.get_json(silent=True) or {}
    note_type = data.get("note_type") if data.get("note_type") in ("text", "checklist") else "text"
    row = (
        supabase_admin.table("notes")
        .insert(
            {
                "user_id": request.user_id,
                "folder_id": data.get("folder_id"),
                "title": (data.get("title") or "").strip(),
                "content": data.get("content") or "",
                "note_type": note_type,
                "checklist_items": data.get("checklist_items") or [],
            }
        )
        .execute()
        .data[0]
    )
    return jsonify(row), 200


@app.route("/api/notes/<note_id>", methods=["PATCH"])
@require_personal_account
def update_note(note_id):
    data = request.get_json(silent=True) or {}
    patch = {}
    for key in ("title", "content", "folder_id", "note_type", "checklist_items", "is_pinned"):
        if key in data:
            patch[key] = data[key]
    # نص فاضي لـ folder_id = "بدون مجلد" صراحة - حل لقيد بمكتبة kotlinx.serialization
    # بتطبيق أندرويد (explicitNulls=false تحذف أي حقل null تلقائيًا، فما يقدر
    # يرسل "امسح المجلد" كـ null صريح زي iOS/الموقع، فيرسل نص فاضي بدلها)
    if patch.get("folder_id") == "":
        patch["folder_id"] = None
    if not patch:
        return jsonify({"error": "ما فيه شي نحدّثه"}), 400
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = (
        supabase_admin.table("notes")
        .update(patch)
        .eq("id", note_id)
        .eq("user_id", request.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "الملاحظة مو موجودة"}), 404
    return jsonify(res.data[0]), 200


@app.route("/api/notes/<note_id>", methods=["DELETE"])
@require_personal_account
def delete_note(note_id):
    res = (
        supabase_admin.table("notes").delete().eq("id", note_id).eq("user_id", request.user_id).execute()
    )
    if not res.data:
        return jsonify({"error": "الملاحظة مو موجودة"}), 404
    return jsonify({"ok": True}), 200


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

        # حد "الأرشيف" حسب الباقة - آخر N جلسة بس (sessions أصلًا تنازلي بالوقت)
        archive_limit = _resolve_archive_limit(request.user_id)
        if archive_limit is not None:
            sessions = sessions[:archive_limit]

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

    # لازم حساب مسجّل عشان تنشئ غرفة (درس مباشر أو جلسة جماعية) - ما نسمح
    # للضيوف إطلاقًا، وإلا حد الباقة اليومي ما له أي معنى (ولا نقدر نربط
    # الاستخدام بحساب أصلًا)
    uid = _optional_user_id()
    if uid is None:
        return jsonify({"error": "لازم تسجل الدخول عشان تنشئ درس مباشر أو جلسة جماعية"}), 401

    # حد يومي حسب الباقة (غرفة جماعية = quiz، درس مباشر = classroom) - حساب
    # مؤسسي يتخطّى الفحص تلقائيًا (_check_and_record_daily_action)
    limited_action = "live_lesson" if room_type == "classroom" else "group_room"
    allowed, reject_msg = _check_and_record_daily_action(uid, limited_action)
    if not allowed:
        return jsonify({"error": reject_msg}), 402

    room_code = generate_room_code()

    # ربط اختياري بفصل مدرسي (يخدم تسجيل الحضور التلقائي بـ handle_join_room) -
    # نتحقق إن صاحب الطلب فعلًا معلم هذا الفصل بالذات، وإلا نتجاهل الربط بصمت
    # بدون ما نمنع إنشاء الغرفة أصلًا (غرف الاختبار/الدراسة العامة تبقى تشتغل
    # عادي لأي أحد، الربط بالفصل ميزة إضافية بس)
    class_id = None
    requested_class_id = data.get("class_id")
    if requested_class_id and uid:
        try:
            owns_class = (
                supabase_admin.table("classes")
                .select("id")
                .eq("id", requested_class_id)
                .eq("teacher_id", uid)
                .limit(1)
                .execute()
            ).data
            if owns_class:
                class_id = requested_class_id
        except Exception:
            class_id = None

    rooms[room_code] = {
        "host_sid": None,
        "host_client_id": None,
        "host_name": None,
        "created_at": time.time(),
        "room_type": room_type,
        "class_id": class_id,
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

    # لازم حساب مسجّل عشان تدخل أي درس مباشر أو جلسة جماعية - ما فيه دخول
    # كضيف إطلاقًا (نفس قيد إنشاء الغرفة بـ /api/room/create بالضبط)
    user_id = None
    if token and supabase_admin is not None:
        try:
            user_response = supabase_admin.auth.get_user(token)
            if user_response and user_response.user:
                user_id = user_response.user.id
        except Exception:
            user_id = None
    if user_id is None:
        emit("join_error", {"error": "لازم تسجل الدخول عشان تدخل درس مباشر أو جلسة جماعية"})
        return

    # تسجيل حضور تلقائي: لو الغرفة مرتبطة بفصل مدرسي (class_id) وهذا مستخدم
    # مسجّل، نسجّل بصمة انضمام وحدة باليوم (نفس نمط عدم-التكرار المستخدم أصلًا
    # بـ /api/ping-active). هذا هو الأثر الدائم الوحيد اللي يبقى بعد ما الغرفة
    # تختفي من الذاكرة، ويُستخدم لحساب تقرير الحضور تلقائيًا من النشاط الفعلي
    if room.get("class_id") and user_id and supabase_admin is not None:
        try:
            today = datetime.now(timezone.utc).date().isoformat()
            existing = (
                supabase_admin.table("session_attendance")
                .select("id")
                .eq("class_id", room["class_id"])
                .eq("user_id", user_id)
                .gte("joined_at", today)
                .limit(1)
                .execute()
            )
            if not existing.data:
                supabase_admin.table("session_attendance").insert(
                    {"class_id": room["class_id"], "room_code": room_code, "user_id": user_id}
                ).execute()
        except Exception:
            pass

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

        # لحظة ما المضيف (المعلم) يبدأ فعليًا كلاس مباشر مرتبط بفصل، ننبّه كل
        # طلاب ذاك الفصل إن الحصة بدأت - مو بمؤقّت أعمى، بحدث فعلي حقيقي
        if room.get("class_id"):
            try:
                _notify_class_started(room["class_id"], room_code, name)
            except Exception:
                pass
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


# ============================================================================
# ---------- نظام إدارة حسابات المدارس (٥ أدوار) ----------
# Admin (عام) → School Admin/School Administration (لكل مدرسة) → Teacher → Student
# ملاحظة معمارية: نفس نمط بقية الملف - كل الكتابة عبر supabase_admin (مفتاح
# service role)، والتحقق من الصلاحيات كود Flask صريح (require_role تحت)،
# مو RLS - RLS المفعّلة بجدول الهجرة طبقة حماية إضافية بس.
# ============================================================================

STUDENT_EMAIL_DOMAIN = "students.zakiy.internal"


def generate_strong_password(length=12):
    """كلمة سر عشوائية قوية (حروف كبيرة/صغيرة + أرقام + رموز) عبر secrets -
    توليد آمن تشفيريًا، مو module random العادي."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*" for c in pwd)
        ):
            return pwd


# تحويل تقريبي (transliteration) للحروف العربية لحروف لاتينية - ضروري لأن اسم
# المستخدم يُستخدم حرفيًا بالجزء المحلي من البريد الاصطناعي، وSupabase Auth يرفض
# أي بريد فيه أحرف غير ASCII بالجزء قبل الـ @ ("invalid format")
_ARABIC_TRANSLIT = {
    "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ب": "b", "ت": "t", "ث": "th",
    "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "th", "ر": "r", "ز": "z",
    "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
    "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "و": "w", "ي": "y", "ة": "h", "ى": "a", "ء": "", "ئ": "e", "ؤ": "o",
}


def _transliterate_arabic(text):
    return "".join(_ARABIC_TRANSLIT.get(ch, ch) for ch in text)


def _slugify_username(name):
    base = _transliterate_arabic(name.strip())
    base = re.sub(r"[^A-Za-z0-9]+", "", base)
    return (base[:20] or "student").lower()


def _generate_unique_student_username(name):
    """يضمن عدم تعارض مع اسم مستخدم طالب موجود - الفهرس الفريد الجزئي بقاعدة
    البيانات (role='student') هو خط الدفاع الأخير لو صار تعارض نادر وقت الإدخال."""
    base = _slugify_username(name)
    candidate = base
    suffix = 1
    while True:
        existing = (
            supabase_admin.table("profiles")
            .select("user_id")
            .eq("role", "student")
            .ilike("username", candidate)
            .limit(1)
            .execute()
        ).data
        if not existing:
            return candidate
        suffix += 1
        candidate = f"{base}{suffix}"


def _get_institutional_profile(user_id):
    """نفس شكل رد /api/profile/<id> (الاسم/الأداء/الأرشيف) لكن بدون بوابات
    الخصوصية الاجتماعية (is_private/show_*) - إشراف مؤسسي (معلم/إدارة مدرسة على
    طالب/معلم تحت مسؤوليتهم) مو مشاركة اجتماعية بين أقران."""
    res = (
        supabase_admin.table("profiles")
        .select("user_id, username, full_name, bio, school_name, role, class_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    profile = res.data[0]
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
    return {
        "user_id": profile["user_id"],
        "username": profile["username"],
        "full_name": profile.get("full_name"),
        "bio": profile.get("bio"),
        "school_name": profile.get("school_name"),
        "role": profile.get("role"),
        "class_id": profile.get("class_id"),
        "is_private": False,
        "is_owner": False,
        "performance": _compute_performance_summary(user_id),
        "archive": sessions[:10],
    }


# ---------- أي مستخدم مسجّل دخول ----------
@app.route("/api/me", methods=["GET"])
@require_auth
def get_me():
    """أول شي يناديه الفرونت إند بعد تسجيل الدخول - يحدد هل يوجّه المستخدم للوحة
    مؤسسية (role موجود) أو يكمل بنفس تجربة الحساب الفردي الحالية (role فاضي)."""
    profile = (
        supabase_admin.table("profiles")
        .select("role, school_id, class_id, must_change_password, username")
        .eq("user_id", request.user_id)
        .limit(1)
        .execute()
    ).data
    if not profile:
        return jsonify(
            {"role": None, "school_id": None, "class_id": None, "must_change_password": False, "username": None}
        ), 200
    p = profile[0]
    return jsonify(
        {
            "role": p.get("role"),
            "school_id": p.get("school_id"),
            "class_id": p.get("class_id"),
            "must_change_password": bool(p.get("must_change_password")),
            "username": p.get("username"),
        }
    ), 200


@app.route("/api/me/complete-password-change", methods=["POST"])
@require_auth
def complete_password_change():
    supabase_admin.table("profiles").update({"must_change_password": False}).eq(
        "user_id", request.user_id
    ).execute()
    return jsonify({"ok": True}), 200


@app.route("/api/resolve-login-identifier", methods=["POST"])
def resolve_login_identifier():
    """يحوّل اسم مستخدم طالب لبريده الاصطناعي عشان يقدر يسجّل دخول بيه عبر
    Supabase (يتطلب بريد دايمًا). لو المُدخل بريد فعلي (فيه @) يرجعه زي ما هو
    بدون أي بحث - نقطة عامة بدون تسجيل دخول (تُستدعى قبله بالضبط)."""
    if supabase_admin is None:
        return jsonify({"error": "نظام الحسابات مو مفعّل حاليًا بالسيرفر"}), 503
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip()
    if not identifier:
        return jsonify({"error": "لازم تكتب إيميلك أو اسم المستخدم"}), 400
    if "@" in identifier:
        return jsonify({"email": identifier}), 200

    res = (
        supabase_admin.table("profiles")
        .select("user_id")
        .eq("role", "student")
        .ilike("username", identifier)
        .limit(1)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "بيانات الدخول غير صحيحة"}), 404
    try:
        user = supabase_admin.auth.admin.get_user_by_id(res.data[0]["user_id"])
        return jsonify({"email": user.user.email}), 200
    except Exception:
        return jsonify({"error": "بيانات الدخول غير صحيحة"}), 404


# ---------- Admin (صاحب المنصة) ----------
@app.route("/api/admin/schools", methods=["POST"])
@require_role("admin")
def admin_create_school():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    admin_email = (data.get("admin_email") or "").strip()
    try:
        max_accounts = int(data.get("max_accounts") or 0)
    except (TypeError, ValueError):
        max_accounts = 0
    if not name or not admin_email:
        return jsonify({"error": "لازم اسم المدرسة وإيميل مدير المدرسة"}), 400

    school = (
        supabase_admin.table("schools")
        .insert(
            {
                "name": name,
                "max_accounts": max_accounts,
                "subscription_package": data.get("subscription_package"),
                "created_by": request.user_id,
            }
        )
        .execute()
        .data[0]
    )

    temp_password = generate_strong_password()
    try:
        created = supabase_admin.auth.admin.create_user(
            {
                "email": admin_email,
                "password": temp_password,
                "email_confirm": True,
                "user_metadata": {"username": name},
            }
        )
    except Exception as e:
        # نظّف المدرسة اللي أنشأناها لو فشل إنشاء حساب مديرها - عشان ما تصير
        # مدرسة يتيمة بدون أي حساب يديرها
        supabase_admin.table("schools").delete().eq("id", school["id"]).execute()
        return jsonify({"error": f"فشل إنشاء حساب مدير المدرسة: {e}"}), 400

    supabase_admin.table("profiles").upsert(
        {
            "user_id": created.user.id,
            "username": name,
            "role": "school_admin",
            "school_id": school["id"],
            "must_change_password": True,
        }
    ).execute()

    return jsonify({"school": school, "school_admin": {"email": admin_email, "password": temp_password}}), 200


@app.route("/api/admin/schools", methods=["GET"])
@require_role("admin")
def admin_list_schools():
    schools_res = supabase_admin.table("schools").select("*").order("created_at", desc=True).execute().data
    counts = supabase_admin.table("profiles").select("school_id").not_.is_("school_id", "null").execute().data
    usage = Counter(r["school_id"] for r in counts)

    # إيميل مدير كل مدرسة - ما نخزّن كلمة السر الأصلية بأي مكان (أمان)، بس
    # الإيميل معلومة عادية نقدر نعرضها دايمًا بدون أي مشكلة
    admins = (
        supabase_admin.table("profiles").select("user_id, school_id").eq("role", "school_admin").execute()
    ).data
    admin_by_school = {a["school_id"]: a["user_id"] for a in admins}

    for s in schools_res:
        s["accounts_used"] = usage.get(s["id"], 0)
        admin_uid = admin_by_school.get(s["id"])
        s["admin_email"] = None
        if admin_uid:
            try:
                s["admin_email"] = supabase_admin.auth.admin.get_user_by_id(admin_uid).user.email
            except Exception:
                pass
    return jsonify({"schools": schools_res}), 200


@app.route("/api/admin/schools/<school_id>", methods=["PATCH"])
@require_role("admin")
def admin_update_school(school_id):
    data = request.get_json(silent=True) or {}
    patch = {k: data[k] for k in ("max_accounts", "subscription_status", "subscription_package", "is_active") if k in data}
    if not patch:
        return jsonify({"error": "ما فيه شي نحدّثه"}), 400
    supabase_admin.table("schools").update(patch).eq("id", school_id).execute()
    return jsonify({"ok": True}), 200


@app.route("/api/admin/schools/<school_id>", methods=["DELETE"])
@require_role("admin")
def admin_delete_school(school_id):
    """حذف فعلي (مو بس إيقاف) - يشيل المدرسة وكل حساباتها نهائيًا. ترتيب
    مهم: نجيب قائمة المستخدمين أول، ثم نحذف صف المدرسة (يكسح تلقائيًا كل
    الفصول/الجدول/الحضور/صفوف profiles عبر cascade المُعرّف بالهجرة)، وبعدها
    بس نحذف حسابات Auth - نفس ترتيب حذف الحساب الفردي (profiles أول) لأن
    حذف Auth وصف profiles لسا موجود يفشل بخطأ قيد مفتاح خارجي."""
    user_ids = [
        r["user_id"]
        for r in supabase_admin.table("profiles").select("user_id").eq("school_id", school_id).execute().data
    ]
    supabase_admin.table("schools").delete().eq("id", school_id).execute()
    for uid in user_ids:
        try:
            supabase_admin.auth.admin.delete_user(uid)
        except Exception:
            pass
    return jsonify({"ok": True}), 200


@app.route("/api/admin/schools/<school_id>/reset-admin-password", methods=["POST"])
@require_role("admin")
def admin_reset_school_password(school_id):
    """ما نقدر نعرض كلمة السر الأصلية (ما تُخزّن نص صريح أبدًا - أمان)، فبدلها
    نولّد كلمة سر جديدة لحساب مدير المدرسة ونرجعها مرة وحدة، ونجبره يغيّرها
    أول ما يسجل دخول - يخدم نفس الغرض (تقدر تعطيه بيانات دخول صالحة بأي وقت)."""
    admin_row = (
        supabase_admin.table("profiles")
        .select("user_id, username")
        .eq("school_id", school_id)
        .eq("role", "school_admin")
        .limit(1)
        .execute()
    ).data
    if not admin_row:
        return jsonify({"error": "ما فيه حساب مدير لهذي المدرسة"}), 404

    admin_uid = admin_row[0]["user_id"]
    new_password = generate_strong_password()
    try:
        supabase_admin.auth.admin.update_user_by_id(admin_uid, {"password": new_password})
    except Exception as e:
        return jsonify({"error": f"تعذّر تحديث كلمة السر: {e}"}), 400
    supabase_admin.table("profiles").update({"must_change_password": True}).eq("user_id", admin_uid).execute()

    try:
        email = supabase_admin.auth.admin.get_user_by_id(admin_uid).user.email
    except Exception:
        email = None
    return jsonify({"email": email, "password": new_password}), 200


# ---------- School Admin + School Administration ----------
def _school_scoped_profile(target_user_id):
    """يرجّع بروفايل target_user_id بس لو تابع لنفس مدرسة صاحب الطلب، وإلا None."""
    res = (
        supabase_admin.table("profiles")
        .select("user_id, role, school_id, class_id, username, full_name")
        .eq("user_id", target_user_id)
        .limit(1)
        .execute()
    ).data
    if not res or res[0].get("school_id") != request.profile["school_id"]:
        return None
    return res[0]


def _school_account_usage(school_id):
    used = (
        supabase_admin.table("profiles")
        .select("user_id", count="exact")
        .eq("school_id", school_id)
        .in_("role", ["teacher", "student", "school_administration"])
        .execute()
    )
    return used.count or 0


@app.route("/api/school/info", methods=["GET"])
@require_role("school_admin", "school_administration", "teacher", "student")
def school_info():
    """معلومات مدرسة صاحب الطلب (الاسم/الحد الأقصى/الاستهلاك) - تخدم عدّاد
    استهلاك الحسابات بلوحة إدارة المدرسة."""
    school_id = request.profile["school_id"]
    school = supabase_admin.table("schools").select("*").eq("id", school_id).limit(1).execute().data
    if not school:
        return jsonify({"error": "مدرستك غير موجودة"}), 404
    result = school[0]
    result["accounts_used"] = _school_account_usage(school_id)
    return jsonify(result), 200


@app.route("/api/school/teachers", methods=["POST"])
@require_role("school_admin", "school_administration")
def school_add_teacher():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    if not name or not email:
        return jsonify({"error": "لازم الاسم والإيميل"}), 400

    school_id = request.profile["school_id"]
    school = supabase_admin.table("schools").select("max_accounts").eq("id", school_id).limit(1).execute().data
    if not school:
        return jsonify({"error": "مدرستك غير موجودة"}), 400
    if _school_account_usage(school_id) >= school[0]["max_accounts"]:
        return jsonify({"error": "وصلت الحد الأقصى لعدد الحسابات المسموح لمدرستك"}), 400

    temp_password = generate_strong_password()
    try:
        created = supabase_admin.auth.admin.create_user(
            {"email": email, "password": temp_password, "email_confirm": True, "user_metadata": {"username": name}}
        )
    except Exception as e:
        return jsonify({"error": f"فشل إنشاء الحساب: {e}"}), 400

    supabase_admin.table("profiles").upsert(
        {
            "user_id": created.user.id,
            "username": name,
            "role": "teacher",
            "school_id": school_id,
            "must_change_password": True,
        }
    ).execute()
    return jsonify({"email": email, "password": temp_password, "user_id": created.user.id}), 200


@app.route("/api/school/teachers", methods=["GET"])
@require_role("school_admin", "school_administration")
def school_list_teachers():
    school_id = request.profile["school_id"]
    teachers = (
        supabase_admin.table("profiles")
        .select("user_id, username")
        .eq("school_id", school_id)
        .eq("role", "teacher")
        .execute()
    ).data
    classes = supabase_admin.table("classes").select("id, name, teacher_id").eq("school_id", school_id).execute().data
    students = (
        supabase_admin.table("profiles").select("class_id").eq("school_id", school_id).eq("role", "student").execute()
    ).data
    student_counts = Counter(s["class_id"] for s in students if s.get("class_id"))

    result = []
    for t in teachers:
        my_classes = [c for c in classes if c["teacher_id"] == t["user_id"]]
        try:
            auth_user = supabase_admin.auth.admin.get_user_by_id(t["user_id"])
            last_login = auth_user.user.last_sign_in_at
        except Exception:
            last_login = None
        result.append(
            {
                "user_id": t["user_id"],
                "username": t["username"],
                "classes": [{"id": c["id"], "name": c["name"]} for c in my_classes],
                "student_count": sum(student_counts.get(c["id"], 0) for c in my_classes),
                "last_login": str(last_login) if last_login else None,
            }
        )
    return jsonify({"teachers": result}), 200


# ---------- حسابات "إداري المدرسة" (school_administration) ----------
# نفس صلاحيات مدير المدرسة (school_admin) بالضبط على المعلمين/الطلاب/
# الحضور، إلا إدارة حسابات مدير/إداري مدرسة ثانية - محجوزة على مدير
# المدرسة الأصلي بس (نفس القيد المطبّق أصلًا بـ PATCH/DELETE accounts).
# ملاحظة: الدور موجود بمنطق الصلاحيات وعدّاد استهلاك الحسابات
# (_school_account_usage) من البداية، بس ما كان فيه أي endpoint فعلي
# ينشئ حساب بهذا الدور - هذا كان ينقص فعليًا.
@app.route("/api/school/administration", methods=["POST"])
@require_role("school_admin")
def school_add_administration():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    if not name or not email:
        return jsonify({"error": "لازم الاسم والإيميل"}), 400

    school_id = request.profile["school_id"]
    school = supabase_admin.table("schools").select("max_accounts").eq("id", school_id).limit(1).execute().data
    if not school:
        return jsonify({"error": "مدرستك غير موجودة"}), 400
    if _school_account_usage(school_id) >= school[0]["max_accounts"]:
        return jsonify({"error": "وصلت الحد الأقصى لعدد الحسابات المسموح لمدرستك"}), 400

    temp_password = generate_strong_password()
    try:
        created = supabase_admin.auth.admin.create_user(
            {"email": email, "password": temp_password, "email_confirm": True, "user_metadata": {"username": name}}
        )
    except Exception as e:
        return jsonify({"error": f"فشل إنشاء الحساب: {e}"}), 400

    supabase_admin.table("profiles").upsert(
        {
            "user_id": created.user.id,
            "username": name,
            "role": "school_administration",
            "school_id": school_id,
            "must_change_password": True,
        }
    ).execute()
    return jsonify({"email": email, "password": temp_password, "user_id": created.user.id}), 200


@app.route("/api/school/administration", methods=["GET"])
@require_role("school_admin", "school_administration")
def school_list_administration():
    school_id = request.profile["school_id"]
    rows = (
        supabase_admin.table("profiles")
        .select("user_id, username")
        .eq("school_id", school_id)
        .eq("role", "school_administration")
        .execute()
    ).data
    result = []
    for r in rows:
        try:
            auth_user = supabase_admin.auth.admin.get_user_by_id(r["user_id"])
            last_login = auth_user.user.last_sign_in_at
        except Exception:
            last_login = None
        result.append({"user_id": r["user_id"], "username": r["username"], "last_login": str(last_login) if last_login else None})
    return jsonify({"administration": result}), 200


@app.route("/api/school/accounts/<user_id>", methods=["PATCH"])
@require_role("school_admin", "school_administration")
def school_update_account(user_id):
    target = _school_scoped_profile(user_id)
    if not target:
        return jsonify({"error": "الحساب مو تابع لمدرستك"}), 404
    if request.profile["role"] == "school_administration" and target["role"] in ("school_admin", "school_administration"):
        return jsonify({"error": "ما عندك صلاحية تعدّل هذا الحساب"}), 403

    data = request.get_json(silent=True) or {}
    patch = {}
    if "username" in data:
        patch["username"] = (data["username"] or "").strip()[:60]
    if "class_id" in data:
        patch["class_id"] = data["class_id"]
    if patch:
        supabase_admin.table("profiles").update(patch).eq("user_id", user_id).execute()
    return jsonify({"ok": True}), 200


@app.route("/api/school/accounts/<user_id>", methods=["DELETE"])
@require_role("school_admin", "school_administration")
def school_delete_account(user_id):
    target = _school_scoped_profile(user_id)
    if not target:
        return jsonify({"error": "الحساب مو تابع لمدرستك"}), 404
    if request.profile["role"] == "school_administration" and target["role"] in ("school_admin", "school_administration"):
        return jsonify({"error": "ما عندك صلاحية تحذف هذا الحساب"}), 403
    # profiles.user_id مربوط بمفتاح خارجي لـ auth.users بدون cascade - لازم نمسح
    # صف profiles أول، وإلا حذف حساب Auth يفشل ("Database error deleting user")
    # لأن الصف لسا يشير له
    supabase_admin.table("profiles").delete().eq("user_id", user_id).execute()
    try:
        supabase_admin.auth.admin.delete_user(user_id)
    except Exception:
        pass
    return jsonify({"ok": True}), 200


@app.route("/api/school/accounts/<user_id>/reset-password", methods=["POST"])
@require_role("school_admin", "school_administration")
def school_reset_account_password(user_id):
    """يولّد كلمة سر جديدة لأي حساب بمدرسة صاحب الطلب (معلم أو طالب) - نفس
    مبدأ إعادة تعيين كلمة سر مدير المدرسة (لا نخزّن كلمة سر أصلية نص صريح
    أبدًا، فالبديل الآمن توليد جديدة عند الحاجة)."""
    target = _school_scoped_profile(user_id)
    if not target:
        return jsonify({"error": "الحساب مو تابع لمدرستك"}), 404
    if request.profile["role"] == "school_administration" and target["role"] in ("school_admin", "school_administration"):
        return jsonify({"error": "ما عندك صلاحية لهذا الحساب"}), 403

    new_password = generate_strong_password()
    try:
        supabase_admin.auth.admin.update_user_by_id(user_id, {"password": new_password})
    except Exception as e:
        return jsonify({"error": f"تعذّر تحديث كلمة السر: {e}"}), 400
    supabase_admin.table("profiles").update({"must_change_password": True}).eq("user_id", user_id).execute()

    identifier = target.get("username") or ""
    if target.get("role") != "student":
        try:
            identifier = supabase_admin.auth.admin.get_user_by_id(user_id).user.email or identifier
        except Exception:
            pass
    return jsonify({"identifier": identifier, "password": new_password}), 200


@app.route("/api/school/profile/<user_id>", methods=["GET"])
@require_role("school_admin", "school_administration")
def school_view_profile(user_id):
    if not _school_scoped_profile(user_id):
        return jsonify({"error": "الحساب مو تابع لمدرستك"}), 404
    profile = _get_institutional_profile(user_id)
    if not profile:
        return jsonify({"error": "المستخدم مو موجود"}), 404
    return jsonify(profile), 200


@app.route("/api/school/classes", methods=["POST"])
@require_role("school_admin", "school_administration")
def school_create_class():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "لازم اسم الفصل"}), 400
    row = {"school_id": request.profile["school_id"], "name": name}
    if data.get("teacher_id"):
        row["teacher_id"] = data["teacher_id"]
    try:
        created = supabase_admin.table("classes").insert(row).execute().data[0]
    except Exception as e:
        return jsonify({"error": f"تعذّر إنشاء الفصل: {e}"}), 400
    return jsonify(created), 200


@app.route("/api/school/classes", methods=["GET"])
@require_role("school_admin", "school_administration", "teacher")
def school_list_classes():
    q = supabase_admin.table("classes").select("*").eq("school_id", request.profile["school_id"])
    if request.profile["role"] == "teacher":
        q = q.eq("teacher_id", request.user_id)
    return jsonify({"classes": q.execute().data}), 200


@app.route("/api/school/classes/<class_id>", methods=["PATCH"])
@require_role("school_admin", "school_administration")
def school_update_class(class_id):
    data = request.get_json(silent=True) or {}
    patch = {}
    if "name" in data:
        patch["name"] = (data["name"] or "").strip()
    if "teacher_id" in data:
        patch["teacher_id"] = data["teacher_id"]
    if patch:
        supabase_admin.table("classes").update(patch).eq("id", class_id).eq(
            "school_id", request.profile["school_id"]
        ).execute()
    return jsonify({"ok": True}), 200


@app.route("/api/school/classes/<class_id>", methods=["DELETE"])
@require_role("school_admin", "school_administration")
def school_delete_class(class_id):
    supabase_admin.table("classes").delete().eq("id", class_id).eq("school_id", request.profile["school_id"]).execute()
    return jsonify({"ok": True}), 200


@app.route("/api/school/classes/<class_id>/schedule", methods=["POST"])
@require_role("school_admin", "school_administration")
def school_add_schedule(class_id):
    data = request.get_json(silent=True) or {}
    row = {
        "class_id": class_id,
        "day_of_week": data.get("day_of_week"),
        "start_time": data.get("start_time"),
        "end_time": data.get("end_time"),
        "subject": data.get("subject"),
    }
    try:
        created = supabase_admin.table("class_schedule").insert(row).execute().data[0]
    except Exception as e:
        return jsonify({"error": f"تعذّر إضافة الحصة: {e}"}), 400
    return jsonify(created), 200


@app.route("/api/school/classes/<class_id>/schedule", methods=["GET"])
@require_role("school_admin", "school_administration", "teacher", "student")
def school_get_schedule(class_id):
    schedule = supabase_admin.table("class_schedule").select("*").eq("class_id", class_id).execute().data
    return jsonify({"schedule": schedule}), 200


@app.route("/api/school/schedule/<schedule_id>", methods=["DELETE"])
@require_role("school_admin", "school_administration")
def school_delete_schedule(schedule_id):
    supabase_admin.table("class_schedule").delete().eq("id", schedule_id).execute()
    return jsonify({"ok": True}), 200


@app.route("/api/school/students/bulk", methods=["POST"])
@require_role("school_admin", "school_administration")
def school_bulk_add_students():
    data = request.get_json(silent=True) or {}
    class_id = data.get("class_id")
    names = [n.strip() for n in (data.get("names") or []) if n and n.strip()]
    if not class_id or not names:
        return jsonify({"error": "لازم تختار فصل وتكتب أسماء"}), 400

    school_id = request.profile["school_id"]
    school = supabase_admin.table("schools").select("max_accounts").eq("id", school_id).limit(1).execute().data
    if not school:
        return jsonify({"error": "مدرستك غير موجودة"}), 400
    remaining = school[0]["max_accounts"] - _school_account_usage(school_id)
    if len(names) > remaining:
        return jsonify(
            {
                "error": f"العدد يتجاوز الحد الأقصى المسموح لمدرستك (متبقي {max(remaining, 0)} حساب)",
                "remaining_slots": max(remaining, 0),
            }
        ), 400

    created_students = []
    for name in names:
        username = _generate_unique_student_username(name)
        password = generate_strong_password()
        email = f"{username}@{STUDENT_EMAIL_DOMAIN}"
        try:
            created = supabase_admin.auth.admin.create_user(
                {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"username": username, "display_name": name},
                }
            )
        except Exception:
            continue  # نتخطى هذا الاسم بس نكمل الباقي - القائمة المُرجعة توضح مين انسوى فعلًا
        supabase_admin.table("profiles").upsert(
            {
                "user_id": created.user.id,
                "username": username,
                "full_name": name,
                "role": "student",
                "school_id": school_id,
                "class_id": class_id,
                "must_change_password": True,
            }
        ).execute()
        created_students.append({"name": name, "username": username, "password": password})

    return jsonify({"students": created_students}), 200


@app.route("/api/school/students", methods=["GET"])
@require_role("school_admin", "school_administration", "teacher")
def school_list_students():
    class_id = request.args.get("class_id")
    q = supabase_admin.table("profiles").select("user_id, username, full_name, class_id").eq("role", "student")
    if request.profile["role"] == "teacher":
        allowed_ids = [
            c["id"]
            for c in supabase_admin.table("classes").select("id").eq("teacher_id", request.user_id).execute().data
        ]
        if class_id and class_id not in allowed_ids:
            return jsonify({"error": "الفصل مو تابع لك"}), 403
        q = q.in_("class_id", [class_id] if class_id else (allowed_ids or ["-"]))
    else:
        q = q.eq("school_id", request.profile["school_id"])
        if class_id:
            q = q.eq("class_id", class_id)
    return jsonify({"students": q.execute().data}), 200


@app.route("/api/school/attendance", methods=["GET"])
@require_role("school_admin", "school_administration")
def school_attendance_report():
    school_id = request.profile["school_id"]
    class_id = request.args.get("class_id")
    classes = supabase_admin.table("classes").select("id, name").eq("school_id", school_id).execute().data
    class_ids = [class_id] if class_id else [c["id"] for c in classes]
    rows = []
    manual_rows = []
    if class_ids:
        rows = (
            supabase_admin.table("session_attendance")
            .select("class_id, user_id, joined_at")
            .in_("class_id", class_ids)
            .order("joined_at", desc=True)
            .limit(500)
            .execute()
        ).data
        # حضور يدوي سجّله المعلم - مصدر منفصل بالإضافة للتلقائي (انضمام الكلاس)
        manual_rows = (
            supabase_admin.table("manual_attendance")
            .select("class_id, student_id, session_date, status")
            .in_("class_id", class_ids)
            .order("session_date", desc=True)
            .limit(500)
            .execute()
        ).data
    return jsonify({"attendance": rows, "manual_attendance": manual_rows, "classes": classes}), 200


# ---------- Teacher ----------
@app.route("/api/teacher/roster", methods=["GET"])
@require_role("teacher")
def teacher_roster():
    my_classes = supabase_admin.table("classes").select("id, name").eq("teacher_id", request.user_id).execute().data
    class_ids = [c["id"] for c in my_classes]
    students = []
    if class_ids:
        students = (
            supabase_admin.table("profiles")
            .select("user_id, username, full_name, class_id")
            .eq("role", "student")
            .in_("class_id", class_ids)
            .execute()
        ).data
    return jsonify({"classes": my_classes, "students": students}), 200


@app.route("/api/teacher/performance", methods=["GET"])
@require_role("teacher")
def teacher_performance():
    """لوحة أداء مجمّعة لكل طلاب فصول المعلم دفعة وحدة - بدل ما يفتح كل طالب
    لحاله. تدعم فلترة اختيارية بفصل وحد عبر ?class_id="""
    requested_class_id = request.args.get("class_id")
    my_classes = supabase_admin.table("classes").select("id, name").eq("teacher_id", request.user_id).execute().data
    my_class_ids = [c["id"] for c in my_classes]
    class_ids = [requested_class_id] if requested_class_id in my_class_ids else my_class_ids
    students = []
    if class_ids:
        students = (
            supabase_admin.table("profiles")
            .select("user_id, username, full_name, class_id")
            .eq("role", "student")
            .in_("class_id", class_ids)
            .execute()
        ).data
    result = []
    for s in students:
        perf = _compute_performance_summary(s["user_id"])
        result.append({
            "user_id": s["user_id"], "username": s["username"], "full_name": s.get("full_name"),
            "class_id": s["class_id"], **perf,
        })
    return jsonify({"performance": result}), 200


@app.route("/api/teacher/students/<user_id>", methods=["GET"])
@require_role("teacher")
def teacher_view_student(user_id):
    target = (
        supabase_admin.table("profiles")
        .select("class_id")
        .eq("user_id", user_id)
        .eq("role", "student")
        .limit(1)
        .execute()
    ).data
    if not target:
        return jsonify({"error": "الطالب مو موجود"}), 404
    my_class_ids = [
        c["id"] for c in supabase_admin.table("classes").select("id").eq("teacher_id", request.user_id).execute().data
    ]
    if target[0]["class_id"] not in my_class_ids:
        return jsonify({"error": "هذا الطالب مو بفصلك"}), 403
    profile = _get_institutional_profile(user_id)
    return jsonify(profile), 200


@app.route("/api/teacher/schedule", methods=["GET"])
@require_role("teacher")
def teacher_schedule():
    my_classes = supabase_admin.table("classes").select("id, name").eq("teacher_id", request.user_id).execute().data
    class_ids = [c["id"] for c in my_classes]
    schedule = []
    if class_ids:
        schedule = supabase_admin.table("class_schedule").select("*").in_("class_id", class_ids).execute().data
    return jsonify({"classes": my_classes, "schedule": schedule}), 200


@app.route("/api/teacher/attendance", methods=["GET"])
@require_role("teacher")
def teacher_attendance():
    requested_class_id = request.args.get("class_id")
    my_class_ids = [
        c["id"] for c in supabase_admin.table("classes").select("id").eq("teacher_id", request.user_id).execute().data
    ]
    class_ids = [requested_class_id] if requested_class_id in my_class_ids else my_class_ids
    rows = []
    if class_ids:
        rows = (
            supabase_admin.table("session_attendance")
            .select("class_id, user_id, joined_at")
            .in_("class_id", class_ids)
            .order("joined_at", desc=True)
            .limit(500)
            .execute()
        ).data
    return jsonify({"attendance": rows}), 200


# ---------- Student ----------
@app.route("/api/student/schedule", methods=["GET"])
@require_role("student")
def student_schedule():
    if not request.profile.get("class_id"):
        return jsonify({"schedule": []}), 200
    schedule = (
        supabase_admin.table("class_schedule").select("*").eq("class_id", request.profile["class_id"]).execute()
    ).data
    return jsonify({"schedule": schedule}), 200


# ============================================================================
# ---------- الرسائل + التنبيهات + الحضور اليدوي ----------
# ============================================================================

RIYADH_OFFSET = timedelta(hours=3)  # المنصة عربية سعودية - أوقات الجدول بتوقيت الرياض


def _riyadh_now():
    return datetime.now(timezone.utc) + RIYADH_OFFSET


def _create_notification(recipient_id, ntype, title, body=None, sender_id=None, class_id=None, room_code=None):
    """يدرج تنبيه ويدفعه لحظيًا للمستلم لو أونلاين (منضم لغرفته الشخصية
    user:<id> عبر حدث register_user) - نفس نمط emit(..., to=room_code) المستخدم
    أصلًا بكل أحداث غرف الدراسة، بس هنا الغرفة خاصة بمستخدم وحد."""
    if supabase_admin is None:
        return
    row = {
        "recipient_user_id": recipient_id,
        "type": ntype,
        "title": title,
        "body": body,
        "sender_id": sender_id,
        "related_class_id": class_id,
        "related_room_code": room_code,
    }
    try:
        supabase_admin.table("notifications").insert(row).execute()
        socketio.emit("new_notification", row, to=f"user:{recipient_id}")
    except Exception:
        pass


def _notify_class_started(class_id, room_code, teacher_name):
    students = (
        supabase_admin.table("profiles").select("user_id").eq("role", "student").eq("class_id", class_id).execute()
    ).data
    for s in students:
        _create_notification(
            s["user_id"], "class_started", "🖍️ الحصة بدأت الآن",
            f"{teacher_name} بدأ الدرس المباشر - ادخل الحين",
            class_id=class_id, room_code=room_code,
        )


@socketio.on("register_user")
def handle_register_user(data):
    """يربط اتصال Socket.IO الحالي بحساب المستخدم المسجّل دخوله - يخلّيه يستلم
    تنبيهاته لحظيًا (رسالة/بث/تذكير حصة/بدء حصة) بأي مكان بالموقع، مو بس وهو
    داخل غرفة دراسة. يُستدعى من الفرونت إند كل ما يتصل/يعيد الاتصال."""
    token = (data.get("token") or "").strip()
    if not token or supabase_admin is None:
        return
    try:
        user_response = supabase_admin.auth.get_user(token)
        if user_response and user_response.user:
            join_room(f"user:{user_response.user.id}")
    except Exception:
        pass


# ---------- الرسائل المباشرة ----------
@app.route("/api/messages/conversations", methods=["GET"])
@require_auth
def list_conversations():
    sent = (
        supabase_admin.table("messages").select("*").eq("sender_id", request.user_id)
        .order("created_at", desc=True).execute()
    ).data
    received = (
        supabase_admin.table("messages").select("*").eq("recipient_id", request.user_id)
        .order("created_at", desc=True).execute()
    ).data
    all_msgs = sorted(sent + received, key=lambda m: m["created_at"], reverse=True)

    conversations = {}
    unread_counts = Counter()
    for m in all_msgs:
        other_id = m["recipient_id"] if m["sender_id"] == request.user_id else m["sender_id"]
        if other_id not in conversations:
            conversations[other_id] = m
        if m["recipient_id"] == request.user_id and not m["read_at"]:
            unread_counts[other_id] += 1

    other_ids = list(conversations.keys())
    names = {}
    if other_ids:
        profiles = supabase_admin.table("profiles").select("user_id, username").in_("user_id", other_ids).execute().data
        names = {p["user_id"]: p["username"] for p in profiles}

    result = [
        {
            "user_id": oid,
            "username": names.get(oid, "?"),
            "last_message": m["body"],
            "last_message_at": m["created_at"],
            "unread_count": unread_counts.get(oid, 0),
        }
        for oid, m in conversations.items()
    ]
    result.sort(key=lambda c: c["last_message_at"], reverse=True)
    return jsonify({"conversations": result}), 200


@app.route("/api/messages/thread/<other_user_id>", methods=["GET"])
@require_auth
def get_message_thread(other_user_id):
    sent = (
        supabase_admin.table("messages").select("*")
        .eq("sender_id", request.user_id).eq("recipient_id", other_user_id).execute()
    ).data
    received = (
        supabase_admin.table("messages").select("*")
        .eq("sender_id", other_user_id).eq("recipient_id", request.user_id).execute()
    ).data
    thread = sorted(sent + received, key=lambda m: m["created_at"])

    # نعلّم الرسائل الواردة كمقروءة أول ما يفتح المحادثة
    unread_ids = [m["id"] for m in received if not m["read_at"]]
    if unread_ids:
        supabase_admin.table("messages").update({"read_at": datetime.now(timezone.utc).isoformat()}).in_(
            "id", unread_ids
        ).execute()

    return jsonify({"messages": thread}), 200


@app.route("/api/messages/send", methods=["POST"])
@require_auth
def send_message():
    data = request.get_json(silent=True) or {}
    recipient_id = data.get("recipient_id")
    body = (data.get("body") or "").strip()[:2000]
    if not recipient_id or not body:
        return jsonify({"error": "لازم مستلم ونص الرسالة"}), 400
    if recipient_id == request.user_id:
        return jsonify({"error": "ما تقدر ترسل لنفسك"}), 400

    row = supabase_admin.table("messages").insert(
        {"sender_id": request.user_id, "recipient_id": recipient_id, "body": body}
    ).execute().data[0]

    sender_name = (
        supabase_admin.table("profiles").select("username").eq("user_id", request.user_id).limit(1).execute().data
    )
    sender_name = sender_name[0]["username"] if sender_name else "مستخدم"
    _create_notification(recipient_id, "new_message", f"💬 رسالة جديدة من {sender_name}", body, sender_id=request.user_id)

    return jsonify(row), 200


# ---------- التنبيهات ----------
@app.route("/api/notifications", methods=["GET"])
@require_auth
def list_notifications():
    rows = (
        supabase_admin.table("notifications").select("*").eq("recipient_user_id", request.user_id)
        .order("created_at", desc=True).limit(50).execute()
    ).data
    unread_count = sum(1 for r in rows if not r["read_at"])
    return jsonify({"notifications": rows, "unread_count": unread_count}), 200


@app.route("/api/notifications/mark-read", methods=["POST"])
@require_auth
def mark_notifications_read():
    data = request.get_json(silent=True) or {}
    notif_id = data.get("id")
    q = supabase_admin.table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()}).eq(
        "recipient_user_id", request.user_id
    )
    if notif_id:
        q = q.eq("id", notif_id)
    else:
        q = q.is_("read_at", "null")
    q.execute()
    return jsonify({"ok": True}), 200


# ---------- البث الجماعي ----------
@app.route("/api/school/broadcast", methods=["POST"])
@require_role("school_admin", "school_administration")
def school_broadcast():
    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()[:2000]
    if not body:
        return jsonify({"error": "لازم نص الرسالة"}), 400
    teachers = (
        supabase_admin.table("profiles").select("user_id")
        .eq("school_id", request.profile["school_id"]).eq("role", "teacher").execute()
    ).data
    for t in teachers:
        _create_notification(t["user_id"], "broadcast", "📢 رسالة من إدارة المدرسة", body, sender_id=request.user_id)
    return jsonify({"ok": True, "sent_to": len(teachers)}), 200


@app.route("/api/teacher/broadcast", methods=["POST"])
@require_role("teacher")
def teacher_broadcast():
    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()[:2000]
    if not body:
        return jsonify({"error": "لازم نص الرسالة"}), 400
    requested_class_id = data.get("class_id")
    my_class_ids = [
        c["id"] for c in supabase_admin.table("classes").select("id").eq("teacher_id", request.user_id).execute().data
    ]
    class_ids = [requested_class_id] if requested_class_id in my_class_ids else my_class_ids
    if not class_ids:
        return jsonify({"error": "ما عندك فصول"}), 400
    students = (
        supabase_admin.table("profiles").select("user_id").eq("role", "student").in_("class_id", class_ids).execute()
    ).data
    for s in students:
        _create_notification(s["user_id"], "broadcast", "📢 رسالة من معلمك", body, sender_id=request.user_id)
    return jsonify({"ok": True, "sent_to": len(students)}), 200


# ---------- الحضور اليدوي (يسجّله المعلم مرة لكل حصة/يوم) ----------
@app.route("/api/teacher/attendance/manual", methods=["GET"])
@require_role("teacher")
def get_manual_attendance():
    class_id = request.args.get("class_id")
    date = request.args.get("date")
    if not class_id or not date:
        return jsonify({"error": "لازم class_id وdate"}), 400
    owns = (
        supabase_admin.table("classes").select("id").eq("id", class_id).eq("teacher_id", request.user_id)
        .limit(1).execute()
    ).data
    if not owns:
        return jsonify({"error": "الفصل مو تابع لك"}), 403
    rows = (
        supabase_admin.table("manual_attendance").select("student_id, status")
        .eq("class_id", class_id).eq("session_date", date).execute()
    ).data
    return jsonify({"records": rows}), 200


@app.route("/api/teacher/attendance/manual", methods=["POST"])
@require_role("teacher")
def save_manual_attendance():
    data = request.get_json(silent=True) or {}
    class_id = data.get("class_id")
    date = data.get("date")
    records = data.get("records") or []
    if not class_id or not date or not records:
        return jsonify({"error": "لازم class_id وdate وقائمة الحضور"}), 400
    owns = (
        supabase_admin.table("classes").select("id").eq("id", class_id).eq("teacher_id", request.user_id)
        .limit(1).execute()
    ).data
    if not owns:
        return jsonify({"error": "الفصل مو تابع لك"}), 403

    rows = [
        {
            "class_id": class_id,
            "student_id": r["student_id"],
            "session_date": date,
            "status": r["status"],
            "recorded_by": request.user_id,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        for r in records
        if r.get("student_id") and r.get("status") in ("present", "absent", "late")
    ]
    if rows:
        supabase_admin.table("manual_attendance").upsert(rows, on_conflict="class_id,student_id,session_date").execute()
    return jsonify({"ok": True, "saved": len(rows)}), 200


# ============================================================================
# ---------- دفتر الواجبات (معلم/طالب بس - محجوب عن الحسابات الفردية) ----------
# ============================================================================
ASSIGNMENT_SUBMISSIONS_BUCKET = "assignment-submissions"


def _assignment_submission_path(assignment_id, student_id, filename):
    safe_name = secure_filename(filename) or "file"
    return f"{assignment_id}/{student_id}/{safe_name}"


@app.route("/api/teacher/assignments", methods=["POST"])
@require_role("teacher")
def create_assignment():
    data = request.get_json(silent=True) or {}
    class_id = data.get("class_id")
    subject = (data.get("subject") or "").strip()
    title = (data.get("title") or "").strip()
    content = data.get("content") or ""
    target_student_id = data.get("target_student_id") or None
    if not class_id or not subject or not title:
        return jsonify({"error": "لازم الفصل والمادة وعنوان الواجب"}), 400

    owns = (
        supabase_admin.table("classes").select("id, name").eq("id", class_id).eq("teacher_id", request.user_id)
        .limit(1).execute()
    ).data
    if not owns:
        return jsonify({"error": "الفصل مو تابع لك"}), 403

    if target_student_id:
        belongs = (
            supabase_admin.table("profiles").select("user_id").eq("user_id", target_student_id)
            .eq("role", "student").eq("class_id", class_id).limit(1).execute()
        ).data
        if not belongs:
            return jsonify({"error": "هذا الطالب مو بهذا الفصل"}), 400

    assignment = (
        supabase_admin.table("assignments")
        .insert(
            {
                "teacher_id": request.user_id,
                "class_id": class_id,
                "target_student_id": target_student_id,
                "subject": subject,
                "title": title,
                "content": content,
            }
        )
        .execute()
        .data[0]
    )

    # نبلّغ الطالب المستهدف، أو كل طلاب الفصل لو الواجب عام
    notif_title = "📚 واجب جديد"
    notif_body = f"{subject} - {title}"
    if target_student_id:
        _create_notification(target_student_id, "new_assignment", notif_title, notif_body, class_id=class_id)
    else:
        students = (
            supabase_admin.table("profiles").select("user_id").eq("role", "student").eq("class_id", class_id).execute()
        ).data
        for s in students:
            _create_notification(s["user_id"], "new_assignment", notif_title, notif_body, class_id=class_id)

    return jsonify(assignment), 200


@app.route("/api/teacher/assignments", methods=["GET"])
@require_role("teacher")
def list_teacher_assignments():
    class_id = request.args.get("class_id")
    query = supabase_admin.table("assignments").select("*").eq("teacher_id", request.user_id)
    if class_id:
        query = query.eq("class_id", class_id)
    assignments = query.order("created_at", desc=True).execute().data

    class_names = {c["id"]: c["name"] for c in supabase_admin.table("classes").select("id, name").eq("teacher_id", request.user_id).execute().data}
    submission_counts = Counter(
        r["assignment_id"]
        for r in supabase_admin.table("assignment_submissions").select("assignment_id").execute().data
    )
    for a in assignments:
        a["class_name"] = class_names.get(a["class_id"])
        a["submitted_count"] = submission_counts.get(a["id"], 0)
        if a["target_student_id"]:
            a["total_count"] = 1
        else:
            a["total_count"] = (
                supabase_admin.table("profiles").select("user_id", count="exact")
                .eq("role", "student").eq("class_id", a["class_id"]).execute().count or 0
            )
    return jsonify({"assignments": assignments}), 200


@app.route("/api/teacher/assignments/<assignment_id>", methods=["GET"])
@require_role("teacher")
def teacher_assignment_detail(assignment_id):
    rows = (
        supabase_admin.table("assignments").select("*").eq("id", assignment_id).eq("teacher_id", request.user_id)
        .limit(1).execute()
    ).data
    if not rows:
        return jsonify({"error": "الواجب مو موجود"}), 404
    assignment = rows[0]

    if assignment["target_student_id"]:
        targets = (
            supabase_admin.table("profiles").select("user_id, username, full_name")
            .eq("user_id", assignment["target_student_id"]).execute()
        ).data
    else:
        targets = (
            supabase_admin.table("profiles").select("user_id, username, full_name")
            .eq("role", "student").eq("class_id", assignment["class_id"]).execute()
        ).data

    submissions = (
        supabase_admin.table("assignment_submissions").select("*").eq("assignment_id", assignment_id).execute()
    ).data
    submissions_by_student = {s["student_id"]: s for s in submissions}

    students = []
    for t in targets:
        sub = submissions_by_student.get(t["user_id"])
        students.append(
            {
                "user_id": t["user_id"],
                "username": t["username"],
                "full_name": t.get("full_name"),
                "submitted": sub is not None,
                "submitted_at": sub.get("submitted_at") if sub else None,
                "file_name": sub.get("file_name") if sub else None,
                "note": sub.get("note") if sub else None,
                "grade": sub.get("grade") if sub else None,
            }
        )
    assignment["students"] = students
    return jsonify(assignment), 200


@app.route("/api/teacher/assignments/<assignment_id>/submissions/<student_id>", methods=["PATCH"])
@require_role("teacher")
def grade_assignment_submission(assignment_id, student_id):
    owns = (
        supabase_admin.table("assignments").select("id").eq("id", assignment_id).eq("teacher_id", request.user_id)
        .limit(1).execute()
    ).data
    if not owns:
        return jsonify({"error": "الواجب مو تابع لك"}), 403
    grade = (request.get_json(silent=True) or {}).get("grade")
    res = (
        supabase_admin.table("assignment_submissions")
        .update({"grade": grade, "graded_at": datetime.now(timezone.utc).isoformat()})
        .eq("assignment_id", assignment_id)
        .eq("student_id", student_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "الطالب ما سلّم الواجب بعد"}), 404
    return jsonify(res.data[0]), 200


@app.route("/api/teacher/assignments/<assignment_id>/submissions/<student_id>/file", methods=["GET"])
@require_role("teacher")
def teacher_download_submission(assignment_id, student_id):
    owns = (
        supabase_admin.table("assignments").select("id").eq("id", assignment_id).eq("teacher_id", request.user_id)
        .limit(1).execute()
    ).data
    if not owns:
        return jsonify({"error": "الواجب مو تابع لك"}), 403
    sub = (
        supabase_admin.table("assignment_submissions").select("file_path")
        .eq("assignment_id", assignment_id).eq("student_id", student_id).limit(1).execute()
    ).data
    if not sub:
        return jsonify({"error": "الطالب ما سلّم الواجب بعد"}), 404
    signed = supabase_admin.storage.from_(ASSIGNMENT_SUBMISSIONS_BUCKET).create_signed_url(sub[0]["file_path"], 3600)
    return jsonify({"url": signed["signedURL"]}), 200


@app.route("/api/teacher/assignments/<assignment_id>", methods=["DELETE"])
@require_role("teacher")
def delete_assignment(assignment_id):
    res = (
        supabase_admin.table("assignments").delete().eq("id", assignment_id).eq("teacher_id", request.user_id).execute()
    )
    if not res.data:
        return jsonify({"error": "الواجب مو موجود"}), 404
    return jsonify({"ok": True}), 200


@app.route("/api/student/assignments", methods=["GET"])
@require_role("student")
def list_student_assignments():
    class_id = request.profile.get("class_id")
    assignments = supabase_admin.table("assignments").select("*").eq("target_student_id", request.user_id).execute().data
    if class_id:
        class_wide = (
            supabase_admin.table("assignments").select("*").eq("class_id", class_id).is_("target_student_id", "null").execute()
        ).data
        assignments = assignments + class_wide
    assignments.sort(key=lambda a: a["created_at"], reverse=True)

    my_submissions = {
        s["assignment_id"]: s
        for s in supabase_admin.table("assignment_submissions").select("*").eq("student_id", request.user_id).execute().data
    }
    for a in assignments:
        sub = my_submissions.get(a["id"])
        a["submitted"] = sub is not None
        a["grade"] = sub.get("grade") if sub else None
    return jsonify({"assignments": assignments}), 200


def _student_can_see_assignment(assignment, student_profile, student_id):
    if assignment["target_student_id"] == student_id:
        return True
    return assignment["target_student_id"] is None and assignment["class_id"] == student_profile.get("class_id")


@app.route("/api/student/assignments/<assignment_id>", methods=["GET"])
@require_role("student")
def student_assignment_detail(assignment_id):
    rows = supabase_admin.table("assignments").select("*").eq("id", assignment_id).limit(1).execute().data
    if not rows or not _student_can_see_assignment(rows[0], request.profile, request.user_id):
        return jsonify({"error": "الواجب مو موجود"}), 404
    assignment = rows[0]
    sub = (
        supabase_admin.table("assignment_submissions").select("*")
        .eq("assignment_id", assignment_id).eq("student_id", request.user_id).limit(1).execute()
    ).data
    assignment["submission"] = sub[0] if sub else None
    return jsonify(assignment), 200


@app.route("/api/student/assignments/<assignment_id>/submit", methods=["POST"])
@require_role("student")
def submit_assignment(assignment_id):
    rows = supabase_admin.table("assignments").select("*").eq("id", assignment_id).limit(1).execute().data
    if not rows or not _student_can_see_assignment(rows[0], request.profile, request.user_id):
        return jsonify({"error": "الواجب مو موجود"}), 404
    if "file" not in request.files:
        return jsonify({"error": "لازم ترفع ملف الواجب"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "اسم الملف فاضي"}), 400
    note = request.form.get("note") or None

    path = _assignment_submission_path(assignment_id, request.user_id, file.filename)
    file_bytes = file.read()
    supabase_admin.storage.from_(ASSIGNMENT_SUBMISSIONS_BUCKET).upload(
        path, file_bytes, file_options={"content-type": file.mimetype or "application/octet-stream", "x-upsert": "true"}
    )

    submission = (
        supabase_admin.table("assignment_submissions")
        .upsert(
            {
                "assignment_id": assignment_id,
                "student_id": request.user_id,
                "file_path": path,
                "file_name": secure_filename(file.filename) or file.filename,
                "note": note,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                # يعيد تسليم الواجب يصفّر الدرجة السابقة - نسخة جديدة تحتاج تقييم جديد
                "grade": None,
                "graded_at": None,
            },
            on_conflict="assignment_id,student_id",
        )
        .execute()
        .data[0]
    )
    my_username_rows = supabase_admin.table("profiles").select("username").eq("user_id", request.user_id).limit(1).execute().data
    my_username = my_username_rows[0]["username"] if my_username_rows else ""
    _create_notification(
        rows[0]["teacher_id"], "assignment_submitted", "✅ تسليم واجب جديد",
        f"{my_username} سلّم واجب {rows[0]['title']}".strip(),
        sender_id=request.user_id, class_id=rows[0]["class_id"],
    )
    return jsonify(submission), 200


@app.route("/api/student/assignments/<assignment_id>/file", methods=["GET"])
@require_role("student")
def student_download_own_submission(assignment_id):
    sub = (
        supabase_admin.table("assignment_submissions").select("file_path")
        .eq("assignment_id", assignment_id).eq("student_id", request.user_id).limit(1).execute()
    ).data
    if not sub:
        return jsonify({"error": "ما سلّمت هذا الواجب بعد"}), 404
    signed = supabase_admin.storage.from_(ASSIGNMENT_SUBMISSIONS_BUCKET).create_signed_url(sub[0]["file_path"], 3600)
    return jsonify({"url": signed["signedURL"]}), 200


# ============================================================================
# ---------- الاشتراكات (٤ باقات: مجاني/بلس/برو/ألتميت) ----------
# ============================================================================
# الأرقام هنا لازم تبقى مطابقة تمامًا لـ ios/Zakiy/Subscriptions/PlanCatalog.swift
# و UsageLimiter.swift - أي تعديل بالأسعار/الحدود لازم يصير بالمكانين مع بعض.
SUBSCRIPTION_PLANS = {
    "free": {
        "name_ar": "المجاني", "name_en": "Free",
        "price_monthly": 0, "price_annual": 0,
        "library_limit": 5, "solo_daily": 3, "group_daily": 1, "lesson_daily": 0,
        "archive_limit": 8, "performance_limit": 5,
    },
    "plus": {
        "name_ar": "بلس", "name_en": "Plus",
        "price_monthly": 19.99, "price_annual": 99.99,
        "library_limit": 20, "solo_daily": 5, "group_daily": 3, "lesson_daily": 1,
        "archive_limit": 15, "performance_limit": 8,
    },
    "pro": {
        "name_ar": "برو", "name_en": "Pro",
        "price_monthly": 39.99, "price_annual": 199.99,
        "library_limit": 30, "solo_daily": 10, "group_daily": 5, "lesson_daily": 3,
        "archive_limit": 30, "performance_limit": 15,
    },
    "ultimate": {
        "name_ar": "ألتميت", "name_en": "Ultimate",
        "price_monthly": 59.99, "price_annual": 299.99,
        "library_limit": 50, "solo_daily": None, "group_daily": None, "lesson_daily": 8,
        "archive_limit": None, "performance_limit": None,
    },
    # باقة داخلية بس (ما تُباع) - لصاحب المنصة نفسه، بلا حدود على كل شي.
    # تُفعّل يدويًا بتحديث profiles.subscription_tier='owner' مباشرة بقاعدة
    # البيانات، مو من أي شاشة اشتراك عادية - مطابقة لنفس فكرة PlanTier.owner
    # بتطبيق iOS (كانت محلية بس هناك، صارت الحين معروفة بالباك إند فتنعكس
    # صح بكل المنصات: الموقع وأندرويد يقرآنها من /api/subscription/me مباشرة)
    "owner": {
        "name_ar": "مالك التطبيق", "name_en": "App Owner",
        "price_monthly": 0, "price_annual": 0,
        "library_limit": None, "solo_daily": None, "group_daily": None, "lesson_daily": None,
        "archive_limit": None, "performance_limit": None,
    },
}

# منتجات StoreKit بتطبيق iOS -> (باقة، دورة فوترة) - لازم تطابق ProductID.swift
APPLE_PRODUCT_PLAN_MAP = {
    "com.zakiy.plus.monthly": ("plus", "monthly"),
    "com.zakiy.plus.yearly": ("plus", "annual"),
    "com.zakiy.pro.monthly": ("pro", "monthly"),
    "com.zakiy.pro.yearly": ("pro", "annual"),
    "com.zakiy.ultimate.monthly": ("ultimate", "monthly"),
    "com.zakiy.ultimate.yearly": ("ultimate", "annual"),
}

# منتجات Google Play Billing بتطبيق أندرويد -> (باقة، دورة فوترة) - لازم
# تطابق PlanCatalog.kt / معرّفات المنتجات المُنشأة فعليًا بـ Play Console
GOOGLE_PRODUCT_PLAN_MAP = {
    "zakiy_plus_monthly": ("plus", "monthly"),
    "zakiy_plus_yearly": ("plus", "annual"),
    "zakiy_pro_monthly": ("pro", "monthly"),
    "zakiy_pro_yearly": ("pro", "annual"),
    "zakiy_ultimate_monthly": ("ultimate", "monthly"),
    "zakiy_ultimate_yearly": ("ultimate", "annual"),
}

# مفتاح سري مشترك بين الباك إند وسيرفر بوابة الدفع - يوقّع/يثبت هوية طلب
# webhook تأكيد الدفع (اللي يوصل من سيرفر البوابة مو متصفح المستخدم، فما
# يقدر يمرر توكن Supabase عادي). خله بمتغير بيئة .env، ونسّقه مع بوابتك
PAYMENT_GATEWAY_WEBHOOK_SECRET = os.getenv("PAYMENT_GATEWAY_WEBHOOK_SECRET")

# بوابة ميسر (Moyasar) - المفتاح العلني آمن يظهر بالفرونت إند (نمرره عبر
# /api/subscription/plans بدل ما نكرره بالكود)، والمفتاح السري بالباك إند
# بس، يُستخدم للتحقق المباشر من حالة أي دفعة (Basic Auth، اسم المستخدم =
# المفتاح السري، بدون كلمة سر) بدل الثقة بمحتوى الـ webhook مباشرة
MOYASAR_PUBLISHABLE_KEY = os.getenv("MOYASAR_PUBLISHABLE_KEY")
MOYASAR_SECRET_KEY = os.getenv("MOYASAR_SECRET_KEY")


@app.route("/api/subscription/plans", methods=["GET"])
def subscription_plans():
    """كتالوج الباقات - عام، بدون تسجيل دخول (تُستخدم بصفحة الأسعار قبل الدخول برضو)."""
    return jsonify({"plans": SUBSCRIPTION_PLANS, "moyasar_publishable_key": MOYASAR_PUBLISHABLE_KEY}), 200


def _resolve_subscription(profile):
    """يرجّع الباقة الفعّالة لحساب معيّن. حساب مؤسسي (role موجود - طالب/معلم/
    إدارة مدرسة) دايمًا بلا حدود بغض النظر عن أي اشتراك شخصي مسجّل له، تماشيًا
    مع نفس قاعدة UsageLimiter.owner بتطبيق iOS - وصوله محكوم بعضوية مدرسته."""
    if profile.get("role"):
        return {"tier": "school", "period": None, "expires_at": None, "unlimited": True}

    tier = profile.get("subscription_tier") or "free"
    expires_at = profile.get("subscription_expires_at")
    days_remaining = None
    if tier != "free" and expires_at:
        try:
            expiry_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            remaining = expiry_dt - datetime.now(timezone.utc)
            if remaining.total_seconds() <= 0:
                tier = "free"  # انتهت صلاحية الاشتراك - يرجع تلقائيًا للباقة المجانية
            else:
                # نقرّب لأعلى - "باقي يوم" يبقى ١ حتى لو تبقى ٣ ساعات بس، مو ٠
                days_remaining = max(1, -(-int(remaining.total_seconds()) // 86400))
        except Exception:
            pass
    return {
        "tier": tier,
        "period": profile.get("subscription_period"),
        "expires_at": expires_at,
        "unlimited": tier in ("ultimate", "owner"),
        "days_remaining": days_remaining,
    }


# مفاتيح حدود اليوم بجدول SUBSCRIPTION_PLANS اللي يقابل كل نوع إجراء محدود -
# مطابق تمامًا لـ LimitedAction بتطبيق iOS (بدون librarySave - ذاك سقف تخزين
# كلي يُفحص مباشرة بعدد صفوف جدول library، مو حد يومي بـ usage_events)
_DAILY_LIMIT_KEYS = {"solo_session": "solo_daily", "group_room": "group_daily", "live_lesson": "lesson_daily"}


def _resolved_plan_for_user(user_id):
    """يرجّع dict حدود الباقة الفعّالة (من SUBSCRIPTION_PLANS) لحساب معيّن -
    اختصار مشترك تستخدمه أي endpoint محتاجة تقصّر عرضها حسب الباقة (أداء/أرشيف)."""
    rows = (
        supabase_admin.table("profiles")
        .select("role, subscription_tier, subscription_expires_at")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data
    resolved = _resolve_subscription(rows[0] if rows else {})
    return SUBSCRIPTION_PLANS.get(resolved["tier"], SUBSCRIPTION_PLANS["free"])


def _resolve_performance_limit(user_id):
    return _resolved_plan_for_user(user_id)["performance_limit"]


def _resolve_archive_limit(user_id):
    return _resolved_plan_for_user(user_id)["archive_limit"]


def _daily_usage_count(user_id, action):
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    res = (
        supabase_admin.table("usage_events")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("action", action)
        .gte("created_at", start_of_day)
        .execute()
    )
    return res.count or 0


def _check_and_record_daily_action(user_id, action):
    """يتحقق من حد اليوم لإجراء محدود (مذاكرة فردية/غرفة جماعية/درس مباشر)
    قبل تنفيذه فعليًا، ويسجّله لو مسموح - إنفاذ سيرفري حقيقي، مو بس عرض
    بالواجهة. يرجّع (مسموح: bool, رسالة الرفض أو None).
    - user_id=None (ضيف) يمر بلا قيد دايمًا - ما فيه حساب نتتبعه.
    - حساب مؤسسي أو باقة فيها الحد None (بلا حدود) يتخطى الفحص بالكامل."""
    if user_id is None or supabase_admin is None:
        return True, None
    plan = _resolved_plan_for_user(user_id)
    limit = plan[_DAILY_LIMIT_KEYS[action]]
    if limit is None:
        return True, None
    if _daily_usage_count(user_id, action) >= limit:
        return False, "وصلت الحد اليومي لباقتك الحالية - رقّي اشتراكك من الإعدادات عشان تكمل"
    supabase_admin.table("usage_events").insert({"user_id": user_id, "action": action}).execute()
    return True, None


@app.route("/api/subscription/me", methods=["GET"])
@require_auth
def subscription_me():
    rows = (
        supabase_admin.table("profiles")
        .select("role, subscription_tier, subscription_period, subscription_expires_at")
        .eq("user_id", request.user_id)
        .limit(1)
        .execute()
    ).data
    profile = rows[0] if rows else {}
    resolved = _resolve_subscription(profile)
    plan_key = resolved["tier"] if resolved["tier"] in SUBSCRIPTION_PLANS else "free"
    return jsonify({**resolved, "limits": SUBSCRIPTION_PLANS[plan_key]}), 200


@app.route("/api/subscription/checkout", methods=["POST"])
@require_auth
def subscription_checkout():
    """ينشئ طلب اشتراك معلّق ويرجّع تفاصيله (المبلغ/الباقة/الدورة) عشان
    الفرونت إند يبدأ بيها تدفّق بوابة الدفع الفعلي (Moyasar/Tap/PayTabs/إلخ -
    أي بوابة تختارها). بعد ما الدفع ينجح فعليًا، بوابتك تستدعي
    /api/subscription/orders/<order_id>/confirm لتفعيل الاشتراك."""
    data = request.get_json(silent=True) or {}
    plan = data.get("plan")
    period = data.get("period")
    if plan not in SUBSCRIPTION_PLANS or plan == "free":
        return jsonify({"error": "باقة غير صالحة"}), 400
    if period not in ("monthly", "annual"):
        return jsonify({"error": "دورة فوترة غير صالحة (monthly أو annual)"}), 400

    amount = SUBSCRIPTION_PLANS[plan]["price_monthly" if period == "monthly" else "price_annual"]
    order = (
        supabase_admin.table("subscription_orders")
        .insert({"user_id": request.user_id, "plan": plan, "period": period, "amount": amount, "currency": "SAR"})
        .execute()
        .data[0]
    )
    return jsonify({"order_id": order["id"], "plan": plan, "period": period, "amount": amount, "currency": "SAR"}), 200


def _activate_subscription_order(order, gateway_reference=None):
    """يفعّل اشتراك المستخدم بعد تأكيد دفع ناجح لطلب معلّق - منطق مشترك بين
    مسار التأكيد اليدوي العام ومسار تأكيد ميسر التلقائي، عشان يبقى بمكان وحد."""
    days = 30 if order["period"] == "monthly" else 365
    expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    supabase_admin.table("subscription_orders").update(
        {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat(), "gateway_reference": gateway_reference}
    ).eq("id", order["id"]).execute()
    supabase_admin.table("profiles").update(
        {
            "subscription_tier": order["plan"],
            "subscription_period": order["period"],
            "subscription_expires_at": expires_at,
            "subscription_source": "web",
        }
    ).eq("user_id", order["user_id"]).execute()
    return expires_at


@app.route("/api/subscription/orders/<order_id>/confirm", methods=["POST"])
def subscription_confirm_order(order_id):
    """مسار تأكيد عام يدوي/لبوابة مستقبلية ثانية - محمي بمفتاح سري مشترك
    بالهيدر X-Gateway-Secret بدل توكن مستخدم عادي. ميسر تحديدًا يُؤكَّد عبر
    /api/subscription/webhook/moyasar (يتحقق مباشرة من ميسر، ما يثق بالطلب)."""
    if not PAYMENT_GATEWAY_WEBHOOK_SECRET or request.headers.get("X-Gateway-Secret") != PAYMENT_GATEWAY_WEBHOOK_SECRET:
        return jsonify({"error": "غير مصرح"}), 403

    rows = supabase_admin.table("subscription_orders").select("*").eq("id", order_id).limit(1).execute().data
    if not rows:
        return jsonify({"error": "الطلب غير موجود"}), 404
    order = rows[0]
    if order["status"] == "paid":
        return jsonify({"ok": True, "already_confirmed": True}), 200

    data = request.get_json(silent=True) or {}
    _activate_subscription_order(order, gateway_reference=data.get("gateway_reference"))
    return jsonify({"ok": True}), 200


@app.route("/api/subscription/webhook/moyasar", methods=["POST"])
def subscription_webhook_moyasar():
    """Webhook ميسر - يوصلنا إشعار بعد أي محاولة دفع. ما نثق بمحتوى الطلب
    مباشرة (أي طرف يقدر يرسل POST مزيّف لهذا الرابط العام) - بدلها نستخدم
    معرّف الدفعة بس عشان نستعلم عن حالتها الحقيقية مباشرة من ميسر بمفتاحنا
    السري (Basic Auth)، ونتحقق كمان إن المبلغ يطابق الطلب المعلّق فعليًا."""
    if not MOYASAR_SECRET_KEY:
        return jsonify({"error": "ميسر غير مُهيّأ بالسيرفر"}), 500

    payload = request.get_json(silent=True) or {}
    payment_id = (payload.get("data") or {}).get("id") or payload.get("id")
    if not payment_id:
        return jsonify({"error": "لا يوجد معرف دفعة بالإشعار"}), 400

    try:
        resp = requests.get(
            f"https://api.moyasar.com/v1/payments/{payment_id}",
            auth=(MOYASAR_SECRET_KEY, ""),
            timeout=15,
        )
    except requests.RequestException:
        return jsonify({"error": "تعذّر الاتصال بميسر"}), 502
    if resp.status_code != 200:
        return jsonify({"error": "تعذّر التحقق من الدفعة لدى ميسر"}), 502
    payment = resp.json()

    if payment.get("status") != "paid":
        return jsonify({"ok": True, "ignored": True}), 200

    order_id = (payment.get("metadata") or {}).get("order_id")
    if not order_id:
        return jsonify({"error": "لا يوجد رقم طلب بالبيانات الوصفية"}), 400

    rows = supabase_admin.table("subscription_orders").select("*").eq("id", order_id).limit(1).execute().data
    if not rows:
        return jsonify({"error": "الطلب غير موجود"}), 404
    order = rows[0]
    if order["status"] == "paid":
        return jsonify({"ok": True, "already_confirmed": True}), 200

    # المبلغ المدفوع فعليًا (بالهللة) لازم يطابق مبلغ الطلب - يمنع أي تلاعب
    # بالـ metadata من طرف العميل (مثلًا دفع باقة أرخص ثم ادّعاء طلب أغلى)
    expected_halalas = round(float(order["amount"]) * 100)
    if payment.get("amount") != expected_halalas or payment.get("currency") != "SAR":
        return jsonify({"error": "المبلغ المدفوع لا يطابق الطلب"}), 400

    _activate_subscription_order(order, gateway_reference=payment_id)
    return jsonify({"ok": True}), 200


@app.route("/api/subscription/apple/verify", methods=["POST"])
@require_auth
def subscription_apple_verify():
    """يستدعيها تطبيق iOS بعد شراء StoreKit ناجح - يربط الاشتراك بحساب
    المستخدم بالباك إند (بدل ما يبقى محلي بالجهاز بس، عشان يبقى متزامن لو
    سجّل دخول من جهاز/منصة ثانية). ملاحظة: هذا تحقق مبسّط يثق بـ product_id
    المُرسل من التطبيق (StoreKit 2 أصلًا يتحقق من توقيع المعاملة JWS على
    الجهاز قبل ما توصلنا) - لو تبي تحقق خادمي إضافي صارم، أضف نداء App Store
    Server API هنا بدل الثقة المباشرة بالقيمة المُرسلة."""
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    if product_id not in APPLE_PRODUCT_PLAN_MAP:
        return jsonify({"error": "منتج غير معروف"}), 400
    plan, period = APPLE_PRODUCT_PLAN_MAP[product_id]
    days = 30 if period == "monthly" else 365
    expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    supabase_admin.table("profiles").update(
        {"subscription_tier": plan, "subscription_period": period, "subscription_expires_at": expires_at, "subscription_source": "apple"}
    ).eq("user_id", request.user_id).execute()
    return jsonify({"tier": plan, "period": period, "expires_at": expires_at}), 200


@app.route("/api/subscription/google/verify", methods=["POST"])
@require_auth
def subscription_google_verify():
    """نفس /api/subscription/apple/verify بالضبط، بس لتطبيق أندرويد بعد شراء
    Google Play Billing ناجح. ملاحظة: تحقق مبسّط يثق بـ product_id المُرسل -
    لو تبي تحقق خادمي صارم، أضف نداء Google Play Developer API
    (purchases.subscriptions.get) هنا بدل الثقة المباشرة بالقيمة المُرسلة."""
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    if product_id not in GOOGLE_PRODUCT_PLAN_MAP:
        return jsonify({"error": "منتج غير معروف"}), 400
    plan, period = GOOGLE_PRODUCT_PLAN_MAP[product_id]
    days = 30 if period == "monthly" else 365
    expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    supabase_admin.table("profiles").update(
        {"subscription_tier": plan, "subscription_period": period, "subscription_expires_at": expires_at, "subscription_source": "google"}
    ).eq("user_id", request.user_id).execute()
    return jsonify({"tier": plan, "period": period, "expires_at": expires_at}), 200


@app.route("/api/subscription/cancel", methods=["POST"])
@require_auth
def subscription_cancel():
    """إلغاء فوري يرجع للباقة المجانية على طول - نسخة مبسّطة لأول إصدار."""
    supabase_admin.table("profiles").update(
        {"subscription_tier": "free", "subscription_period": None, "subscription_expires_at": None, "subscription_source": None}
    ).eq("user_id", request.user_id).execute()
    return jsonify({"ok": True}), 200


# ---------- حلقة خلفية: تذكير قبل الحصة بنص ساعة ----------
def _check_schedule_reminders_once(now=None):
    """جولة فحص وحدة - دالة مستقلة (مو حلقة) عشان تُختبر مباشرة بوقت معطى
    بدل انتظار حقيقي بالاختبارات. day_of_week بالجدول: 0=الأحد..6=السبت،
    بينما Python weekday(): 0=الاثنين..6=الأحد، فلازم تحويل."""
    now = now or _riyadh_now()
    today_str = now.date().isoformat()
    window_end = (now + timedelta(minutes=30)).time()
    python_weekday_to_schedule = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}
    today_schedule_day = python_weekday_to_schedule[now.weekday()]

    schedule_rows = (
        supabase_admin.table("class_schedule").select("id, class_id, day_of_week, start_time, subject")
        .eq("day_of_week", today_schedule_day).execute()
    ).data

    for row in schedule_rows:
        start_time = datetime.strptime(row["start_time"], "%H:%M:%S").time() if len(row["start_time"]) > 5 \
            else datetime.strptime(row["start_time"], "%H:%M").time()
        if not (now.time() <= start_time <= window_end):
            continue

        # ندّعي (claim) صف الحارس أول قبل أي إرسال - القيد الفريد
        # (schedule_id, sent_date) يمنع تكرار الإرسال لو أكثر من عملية
        # عمّال (worker) شغّالة بنفس الوقت، بدل ما نتأكد من عدم وجوده بس ثم نرسل
        try:
            supabase_admin.table("schedule_reminders_sent").insert(
                {"schedule_id": row["id"], "sent_date": today_str}
            ).execute()
        except Exception:
            continue  # صف موجود أصلًا (اتُرسل التذكير قبل) - نتخطى

        cls = supabase_admin.table("classes").select("name, teacher_id").eq("id", row["class_id"]).limit(1).execute().data
        if not cls:
            continue
        class_name = cls[0]["name"]
        teacher_id = cls[0].get("teacher_id")
        title = "⏰ تذكير: حصة بعد نص ساعة"
        body = f"حصة {row.get('subject') or class_name} تبدأ الساعة {row['start_time']}"

        if teacher_id:
            _create_notification(teacher_id, "schedule_reminder", title, body, class_id=row["class_id"])
        students = (
            supabase_admin.table("profiles").select("user_id").eq("role", "student")
            .eq("class_id", row["class_id"]).execute()
        ).data
        for s in students:
            _create_notification(s["user_id"], "schedule_reminder", title, body, class_id=row["class_id"])


def schedule_reminder_loop():
    while True:
        try:
            if supabase_admin is not None:
                _check_schedule_reminders_once()
        except Exception:
            pass
        socketio.sleep(60)


def _check_expired_subscriptions_once():
    """يفحص الحسابات الفردية (role فاضي) اللي انتهت صلاحية اشتراكها المدفوع
    فعليًا - يرجّعها للباقة المجانية بقاعدة البيانات نفسها (مو بس بالعرض
    اللحظي اللي يسويه _resolve_subscription وقت الطلب) ويرسل تنبيه وحد
    يوضّح السبب. إعادة الضبط لـ subscription_tier='free' نفسها تمنع تكرار
    نفس التنبيه بالمرات الجاية (الاستعلام ما يعيد التقاطه بعدها)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = (
        supabase_admin.table("profiles")
        .select("user_id, subscription_tier")
        .is_("role", "null")
        .not_.in_("subscription_tier", ["free", "owner"])
        .lt("subscription_expires_at", now_iso)
        .execute()
    ).data
    for row in rows:
        plan_name = SUBSCRIPTION_PLANS.get(row.get("subscription_tier"), {}).get("name_ar", "المدفوعة")
        supabase_admin.table("profiles").update(
            {"subscription_tier": "free", "subscription_period": None, "subscription_expires_at": None}
        ).eq("user_id", row["user_id"]).execute()
        _create_notification(
            row["user_id"], "subscription_expired", "⌛ انتهت صلاحية اشتراكك",
            f"انتهت باقة {plan_name} ورجع حسابك للباقة المجانية - جدّد اشتراكك من الإعدادات عشان تكمل بنفس المميزات",
        )


def subscription_expiry_loop():
    while True:
        try:
            if supabase_admin is not None:
                _check_expired_subscriptions_once()
        except Exception:
            pass
        socketio.sleep(1800)  # كل نص ساعة يكفي - انتهاء الاشتراك حدث يومي مو دقيق بالثانية


# نطلق الحلقة مرة وحدة بس عند إقلاع التطبيق الفعلي. بوضع debug المحلي، Flask
# يشغّل السكربت مرتين: العملية الأصلية (بدون WERKZEUG_RUN_MAIN - ما تخدم أي
# طلب فعليًا، بس تراقب وتعيد تشغيل عملية فرعية) والعملية الفرعية (اللي فيها
# WERKZEUG_RUN_MAIN="true" وهي اللي فعليًا تشغّل السيرفر). نبدأ الحلقة في كل
# حالة إلا العملية الأصلية بالذات (القيمة موجودة لكنها مو "true")
_werkzeug_run_main = os.environ.get("WERKZEUG_RUN_MAIN")
if supabase_admin is not None and _werkzeug_run_main in (None, "true"):
    socketio.start_background_task(schedule_reminder_loop)
    socketio.start_background_task(subscription_expiry_loop)


if __name__ == "__main__":
    # allow_unsafe_werkzeug مطلوب محليًا لأن Flask-SocketIO يرفض تشغيل سيرفر Werkzeug
    # الافتراضي بدون تفعيل صريح؛ مناسب هنا لأن المشروع للتطوير المحلي فقط
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
