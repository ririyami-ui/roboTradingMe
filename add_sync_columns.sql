-- Add synchronization columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_bot_active boolean DEFAULT true;
