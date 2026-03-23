-- SQL Fix for profiles table schema
-- Run this in the Supabase SQL Editor to fix 400 Errors when saving settings

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_loss_limit numeric DEFAULT 5.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trading_strategy text DEFAULT 'SCALPING';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_is_simulation boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_background_bot_enabled boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trade_amount numeric DEFAULT 50000;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS take_profit numeric DEFAULT 1.5;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stop_loss numeric DEFAULT 1.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS secret_key text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gemini_key text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Ensure RLS is active and allows users to update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile" ON public.profiles
        FOR UPDATE USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
    ) THEN
        CREATE POLICY "Users can insert own profile" ON public.profiles
        FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
    ) THEN
        CREATE POLICY "Users can view own profile" ON public.profiles
        FOR SELECT USING (auth.uid() = id);
    END IF;
END $$;
