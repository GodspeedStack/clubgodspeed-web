-- v10_01_welcome_queue_cascade.sql
-- Fix: welcome_email_queue.user_id FK lacked ON DELETE CASCADE.
-- When an auth.users row was deleted, orphaned welcome_email_queue rows
-- blocked re-signup for the same email (FK violation on INSERT).

ALTER TABLE public.welcome_email_queue
    DROP CONSTRAINT IF EXISTS welcome_email_queue_user_id_fkey;

ALTER TABLE public.welcome_email_queue
    ADD CONSTRAINT welcome_email_queue_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
