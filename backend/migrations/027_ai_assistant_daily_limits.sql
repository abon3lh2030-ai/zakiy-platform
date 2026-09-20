-- إضافة رسائل المساعد الذكي المنفصل إلى عدّاد الاستخدام اليومي.
-- حدود كل باقة معرفة مركزيًا في SUBSCRIPTION_PLANS داخل الباك إند.
alter table usage_events
  drop constraint if exists usage_events_action_check;

alter table usage_events
  add constraint usage_events_action_check
  check (action in ('solo_session', 'group_room', 'live_lesson', 'ai_assistant_message'));
