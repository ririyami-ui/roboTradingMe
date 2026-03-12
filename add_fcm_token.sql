-- Add FCM Token column to profiles explicitly
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token text;
