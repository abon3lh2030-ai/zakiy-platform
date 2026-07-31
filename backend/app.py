import eventlet

# لازم يصير أول شي بالملف قبل أي استيراد ثاني - وإلا يصير تعارض بين
# مقابس SSL العادية ومقابس eventlet "الخضراء" وقت التشغيل بـ gunicorn+eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from functools import wraps
from collections import Counter
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


# ---------- تلخيص النص بالذكاء الاصطناعي ----------
@app.route("/api/summarize", methods=["POST"])
def summarize():
    data = request.get_json()
    text = data.get("text")

    if not text:
        return jsonify({"error": "لازم ترسل نص"}), 400

    try:
        interaction = create_interaction(
            model=GEMINI_MODEL,
            input=(
                "لخّص المحتوى التالي بشكل مرتب ونقاط واضحة باللغة العربية. "
                "اكتب نص عادي فقط بدون أي رموز Markdown مثل ** أو ### أو #:\n\n"
                f"{text}"
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

    if not message:
        return jsonify({"error": "لازم ترسل رسالة"}), 400

    try:
        if interaction_id:
            input_text = message
        else:
            input_text = (
                "هذا نص ملف دراسي رفعه الطالب:\n\n"
                f"{context}\n\n"
                "جاوب على أسئلة الطالب المتعلقة بهذا المحتوى فقط، بوضوح واختصار "
                "باللغة العربية، بدون رموز Markdown.\n\n"
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


# ---------- تسجيل نتائج الاختبار وتحليل نقاط الضعف (حسابات اختيارية) ----------
@app.route("/api/quiz-attempt", methods=["POST"])
@require_auth
def record_quiz_attempt():
    data = request.get_json()
    try:
        supabase_admin.table("quiz_attempts").insert(
            {
                "user_id": request.user_id,
                "mode": data.get("mode", "solo"),
                "score": data.get("score", 0),
                "total": data.get("total", 0),
                "time_taken": data.get("time_taken", 0),
                "wrong_topics": data.get("wrong_topics", []),
            }
        ).execute()
        return jsonify({"ok": True}), 200
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
        attempts = res.data

        topic_counter = Counter()
        for attempt in attempts:
            for topic in attempt.get("wrong_topics") or []:
                topic_counter[topic] += 1
        weak_topics = [
            {"topic": topic, "count": count}
            for topic, count in topic_counter.most_common(10)
        ]

        return jsonify({"attempts": attempts, "weak_topics": weak_topics}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- غرفة المذاكرة الجماعية (Real-time) ----------
# تخزين الغرف بالذاكرة، كافي لمشروع تخرج بدون قاعدة بيانات.
# الغرفة تُبنى فاضية أول شي (بدون اختبار)، أول من ينضم يصير الهوست، وهو اللي
# يرفع الملف ويولّد الاختبار ويبدأه لاحقًا بضغطة start_quiz.
rooms = {}
# room_code -> {
#   "host_sid": str | None,
#   "created_at": float,
#   "quiz": list | None,
#   "quiz_started_at": float | None,
#   "duration_minutes": float | None,
#   "participants": {sid: {"name", "score", "total", "finished", "time_taken"}},
# }

ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # بدون أحرف/أرقام تتشابه بالشكل
CHAT_MESSAGE_MAX_LEN = 300


def generate_room_code():
    while True:
        code = "".join(random.choices(ROOM_CODE_CHARS, k=5))
        if code not in rooms:
            return code


def get_leaderboard(room_code):
    participants = [
        {**data, "sid": sid}
        for sid, data in rooms[room_code]["participants"].items()
    ]
    # الدرجة أولاً (الأعلى فوق)، والوقت يفصل بين المتساوين بالدرجة (الأسرع فوق)
    participants.sort(
        key=lambda p: (-p["score"], p["time_taken"]) if p["finished"] else (1, p["name"])
    )
    return participants


@app.route("/api/room/create", methods=["POST"])
def create_room():
    room_code = generate_room_code()
    rooms[room_code] = {
        "host_sid": None,
        "host_client_id": None,
        "created_at": time.time(),
        "quiz": None,
        "quiz_started_at": None,
        "duration_minutes": None,
        "shared_summary": None,
        "participants": {},
    }
    return jsonify({"room_code": room_code}), 200


@socketio.on("join_room")
def handle_join_room(data):
    room_code = (data.get("room_code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    client_id = (data.get("client_id") or "").strip()

    if room_code not in rooms:
        emit("join_error", {"error": "الغرفة غير موجودة، تأكد من الكود"})
        return
    if not name:
        emit("join_error", {"error": "لازم تكتب اسمك"})
        return

    room = rooms[room_code]

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
    join_room(room_code)
    room["participants"][request.sid] = participant

    # صفة الهوست مربوطة بـ client_id ثابت مو بالـ sid المتغيّر، عشان الهوست ما
    # يفقد صلاحياته لو النت انقطع عنده لحظيًا (الـ disconnect ينحذف قبل ما
    # يرجع ينضم، فمطابقة sid وحدها ما تكفي لاسترجاع صفة الهوست)
    if room["host_client_id"] is None:
        room["host_client_id"] = client_id
        room["host_sid"] = request.sid
    elif client_id and client_id == room["host_client_id"]:
        room["host_sid"] = request.sid

    emit(
        "room_state",
        {
            "room_code": room_code,
            "created_at": room["created_at"],
            "is_host": room["host_sid"] == request.sid,
            "quiz": room["quiz"],
            "quiz_started_at": room["quiz_started_at"],
            "duration_minutes": room["duration_minutes"],
            "shared_summary": room["shared_summary"],
        },
    )
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("share_summary")
def handle_share_summary(data):
    room_code = (data.get("room_code") or "").strip().upper()
    summary = (data.get("summary") or "").strip()

    if room_code not in rooms:
        return

    room = rooms[room_code]
    # الهوست بس يقدر يشارك الملخص مع باقي المنضمين
    if request.sid != room["host_sid"] or not summary:
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
    # الهوست بس يقدر يبدأ الاختبار للجميع
    if request.sid != room["host_sid"] or not quiz or not duration_minutes:
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

    emit("kicked", {}, to=target_sid)
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("submit_score")
def handle_submit_score(data):
    room_code = (data.get("room_code") or "").strip().upper()

    if room_code not in rooms or request.sid not in rooms[room_code]["participants"]:
        return

    rooms[room_code]["participants"][request.sid].update(
        {
            "score": data.get("score", 0),
            "total": data.get("total", 0),
            "time_taken": data.get("time_taken", 0),
            "finished": True,
        }
    )
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


ROOM_EMPTY_GRACE_SECONDS = 30  # مهلة قبل حذف الغرفة الفاضية، عشان انقطاع نت مؤقت ما يمسحها قبل ما الكل يرجع يتصل


def _delete_room_if_still_empty(room_code):
    socketio.sleep(ROOM_EMPTY_GRACE_SECONDS)
    room = rooms.get(room_code)
    if room and not room["participants"]:
        del rooms[room_code]


@socketio.on("disconnect")
def handle_disconnect():
    for room_code, room in list(rooms.items()):
        if request.sid not in room["participants"]:
            continue

        del room["participants"][request.sid]
        leave_room(room_code)

        if room["participants"]:
            emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)
        else:
            socketio.start_background_task(_delete_room_if_still_empty, room_code)
        break


if __name__ == "__main__":
    # allow_unsafe_werkzeug مطلوب محليًا لأن Flask-SocketIO يرفض تشغيل سيرفر Werkzeug
    # الافتراضي بدون تفعيل صريح؛ مناسب هنا لأن المشروع للتطوير المحلي فقط
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
