-- The app now has a resident reader: an OpenAI model that handles
-- receipts the moment they arrive, with Claude as the auditor who can
-- override it. Its replies appear in the thread under their own name,
-- because knowing who said what is the whole basis of the audit.
alter table public.messages drop constraint if exists messages_sender_check;
alter table public.messages
  add constraint messages_sender_check
  check (sender in ('you', 'app', 'claude', 'ai'));
