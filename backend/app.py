from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import random
import time
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import pdfplumber
from google import genai
from google.genai import errors as genai_errors

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
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
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
  {{"question": "نص السؤال", "options": ["أ", "ب", "ج", "د"], "correct_answer": "أ"}}
]

المحتوى:
{text}"""

        interaction = create_interaction(
            model=GEMINI_MODEL,
            input=prompt,
            # نفس السبب: thinking_level منخفض عشان ما ياكل من حد max_output_tokens
            # ويقطع الـ JSON قبل ما يكمل (صار يصير هذا بالضبط مع 5 أسئلة قبل التعديل)
            generation_config={"max_output_tokens": 3000, "thinking_level": "minimal"},
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
#   "chat_enabled_during_quiz": bool,
#   "participants": {sid: {"name", "score", "total", "finished"}},
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
    participants.sort(key=lambda p: (-p["score"] if p["finished"] else 1, p["name"]))
    return participants


@app.route("/api/room/create", methods=["POST"])
def create_room():
    room_code = generate_room_code()
    rooms[room_code] = {
        "host_sid": None,
        "created_at": time.time(),
        "quiz": None,
        "quiz_started_at": None,
        "duration_minutes": None,
        "chat_enabled_during_quiz": True,
        "participants": {},
    }
    return jsonify({"room_code": room_code}), 200


@socketio.on("join_room")
def handle_join_room(data):
    room_code = (data.get("room_code") or "").strip().upper()
    name = (data.get("name") or "").strip()

    if room_code not in rooms:
        emit("join_error", {"error": "الغرفة غير موجودة، تأكد من الكود"})
        return
    if not name:
        emit("join_error", {"error": "لازم تكتب اسمك"})
        return

    room = rooms[room_code]

    # أول من ينضم للغرفة (بعد إنشائها) يصير الهوست
    if room["host_sid"] is None:
        room["host_sid"] = request.sid

    join_room(room_code)
    room["participants"][request.sid] = {
        "name": name,
        "score": 0,
        "total": 0,
        "finished": False,
    }

    emit(
        "room_state",
        {
            "room_code": room_code,
            "created_at": room["created_at"],
            "is_host": room["host_sid"] == request.sid,
            "quiz": room["quiz"],
            "quiz_started_at": room["quiz_started_at"],
            "duration_minutes": room["duration_minutes"],
            "chat_enabled_during_quiz": room["chat_enabled_during_quiz"],
        },
    )
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


@socketio.on("start_quiz")
def handle_start_quiz(data):
    room_code = (data.get("room_code") or "").strip().upper()
    quiz = data.get("quiz")
    duration_minutes = data.get("duration_minutes")
    chat_enabled_during_quiz = bool(data.get("chat_enabled_during_quiz", True))

    if room_code not in rooms:
        return

    room = rooms[room_code]
    # الهوست بس يقدر يبدأ الاختبار للجميع
    if request.sid != room["host_sid"] or not quiz or not duration_minutes:
        return

    room["quiz"] = quiz
    room["quiz_started_at"] = time.time()
    room["duration_minutes"] = duration_minutes
    room["chat_enabled_during_quiz"] = chat_enabled_during_quiz

    emit(
        "quiz_started",
        {
            "quiz": quiz,
            "started_at": room["quiz_started_at"],
            "duration_minutes": duration_minutes,
            "chat_enabled_during_quiz": chat_enabled_during_quiz,
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

    # الهوست يقدر يوقف الشات أثناء الاختبار الفعلي
    if room["quiz_started_at"] and not room["chat_enabled_during_quiz"]:
        return

    name = room["participants"][request.sid]["name"]
    emit(
        "chat_message",
        {"name": name, "message": message, "ts": time.time()},
        to=room_code,
    )


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
            "finished": True,
        }
    )
    emit("leaderboard_update", {"leaderboard": get_leaderboard(room_code)}, to=room_code)


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
            del rooms[room_code]
        break


if __name__ == "__main__":
    # allow_unsafe_werkzeug مطلوب محليًا لأن Flask-SocketIO يرفض تشغيل سيرفر Werkzeug
    # الافتراضي بدون تفعيل صريح؛ مناسب هنا لأن المشروع للتطوير المحلي فقط
    socketio.run(app, debug=True, port=5001, allow_unsafe_werkzeug=True)
