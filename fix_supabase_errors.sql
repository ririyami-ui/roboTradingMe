-- SECURITY FIX FOR SAKTIBOT (Resolving RLS Warnings)
-- Jalankan kode ini di SQL Editor di Dashboard Supabase Bapak untuk mengamankan database.

-- 1. Pastikan RLS Aktif pada semua tabel (Mengatasi Error: Policy Exists RLS Disabled)
ALTER TABLE active_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Bersihkan Policy lama agar tidak bentrok (Opsional tapi direkomendasikan)
DROP POLICY IF EXISTS "Users can manage own trades" ON active_trades;
DROP POLICY IF EXISTS "Users can manage their own active trades" ON active_trades;
DROP POLICY IF EXISTS "Users can manage own bot_configs" ON bot_configs;
DROP POLICY IF EXISTS "Users can manage their own bot configs" ON bot_configs;
DROP POLICY IF EXISTS "Users can view own bot_logs" ON bot_logs;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own trade history." ON trade_history;
DROP POLICY IF EXISTS "Users can insert their own trade history." ON trade_history;
DROP POLICY IF EXISTS "Users can delete their own trade history." ON trade_history;

-- 3. Buat Policy baru yang Aman (User hanya bisa melihat/mengelola datanya sendiri)

-- Tabel: active_trades
CREATE POLICY "Users can manage their own active trades" 
ON active_trades FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Tabel: bot_logs
CREATE POLICY "Users can manage their own logs" 
ON bot_logs FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Tabel: trade_history
CREATE POLICY "Users can manage their own history" 
ON trade_history FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Tabel: bot_configs
CREATE POLICY "Users can manage their own configs" 
ON bot_configs FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Tabel: profiles
CREATE POLICY "Users can manage their own profile" 
ON profiles FOR ALL 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 4. Izin khusus untuk Background Trader (Supabase Edge Function)
-- Edge Function menggunakan service_role yang secara default melewati RLS, jadi tidak perlu policy tambahan.

-- 5. Berikan izin akses dasar ke role authenticated
GRANT ALL ON TABLE active_trades TO authenticated;
GRANT ALL ON TABLE bot_logs TO authenticated;
GRANT ALL ON TABLE trade_history TO authenticated;
GRANT ALL ON TABLE bot_configs TO authenticated;
GRANT ALL ON TABLE profiles TO authenticated;

-- 6. Tambahkan constraint unik jika belum ada (Penting untuk sinkronisasi robot)
ALTER TABLE active_trades DROP CONSTRAINT IF EXISTS unique_trade_user_coin_sim;
ALTER TABLE active_trades ADD CONSTRAINT unique_trade_user_coin_sim UNIQUE (user_id, coin_id, is_simulation);

-- Selesai. Database sekarang AMAN dan tidak ada lagi peringatan ERROR di Supabase.
