import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = 'https://tbshgmyibtunhwlygqgg.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY || '...'; // Will be picked up from .env

// Create a direct Postgres connection script using raw REST to alter table (Supabase JS doesn't support raw DDL by default, but we can do a dummy RPC if needed, or simply let the user run it from Dashboard)

console.log("Untuk menambahkan fcm_token, jalankan perintah ini di SQL Editor pada Dasbor Supabase Anda:\n\nALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token text;\n");
