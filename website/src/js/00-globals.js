const API_BASE = "https://zakiy-platform.onrender.com";
const socket = io(API_BASE);

const SUPABASE_URL = "https://qwlbufcailgpxxatgyez.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bGJ1ZmNhaWxncHh4YXRneWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MTY1NTgsImV4cCI6MjEwMTA5MjU1OH0.ApKmMBSdZNIbSNFF0prm_cUUc2flIuVdtaGE97gonyQ";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentAccessToken = null;
let currentUserEmail = null;
let currentUsername = null;
let currentUserId = null;
let currentUserPhone = null;
// نظام إدارة حسابات المدارس - role فاضي (null) = حساب فردي عادي (نفس التجربة
// الحالية بدون أي تغيير)، وإلا حساب مؤسسي يوجّه للوحته الخاصة بعد الدخول
let currentUserRole = null;
let currentUserSchoolId = null;
let currentUserClassId = null;

let appMode = null; // 'solo' | 'room-host' | 'room-join'
let uploadedFilename = null;
let extractedText = "";
let quizData = [];
let quizFinished = false;

let currentRoomCode = null;
let isHost = false;
// الهوست الأصلي أو أي منضم منحه الهوست صلاحية الرفع/التوليد/بدء الاختبار
let canManageContent = false;
// حالة شات الغرفة (مفتوح/مقفول) - المدرس/الهوست يتحكم فيها بزر chatToggleBtn
let chatEnabled = true;
let myName = "";
// معرّف ثابت لهذا التبويب طول عمر الجلسة، يستخدم عشان لو النت انقطع لحظيًا
// و socket.io سوى إعادة اتصال تلقائي بـ sid جديد، نقدر نطابق نفس المشارك
// ونحافظ على درجته وصفة الهوست بدل ما يفقدهم بصمت
const clientId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
let roomCreatedAt = null;
let quizHasStarted = false;
let quizDeadline = null;
let quizStartTime = null; // بالثواني (Unix)، يُستخدم لحساب وقت الحل
let joinErrorTarget = 'roomJoinError';
let roomElapsedIntervalId = null;
let quizCountdownIntervalId = null;

let chatInteractionId = null;

