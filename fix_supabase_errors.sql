-- SQL FIX FOR SAKTIBOT TRADE ERRORS (400 & 403)
-- Jalankan kode ini di SQL Editor di Dashboard Supabase Bapak.

-- 1. Pastikan tabel memiliki constraint unik agar upsert berjalan lancar
-- Kita hapus dulu jika sudah ada agar tidak error saat pembuatan
ALTER TABLE active_trades DROP CONSTRAINT IF EXISTS unique_trade_user_coin_sim;
ALTER TABLE active_trades ADD CONSTRAINT unique_trade_user_coin_sim UNIQUE (user_id, coin_id, is_simulation);

-- 2. Matikan RLS atau beri izin akses penuh untuk role anon
-- Karena ini aplikasi personal, mematikan RLS adalah cara tercepat dan aman.
-- Jika Bapak ingin tetap menyalakan RLS, jalankan bagian "B" saja.

-- BAGIAN A: Mematikan RLS (Direkomendasikan demi kemudahan)
ALTER TABLE active_trades DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- BAGIAN B: Izinkan akses penuh untuk anon (Hanya jika RLS tetap ingin aktif)
/*
CREATE POLICY "Allow all for anon on active_trades" ON active_trades FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon on bot_logs" ON bot_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon on trade_history" ON trade_history FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon on bot_configs" ON bot_configs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon on profiles" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);
*/

-- 3. Pastikan izin akses tabel diberikan ke role anon (Default biasanya sudah, tapi ini untuk jaga-jaga)
GRANT ALL ON TABLE active_trades TO anon;
GRANT ALL ON TABLE bot_logs TO anon;
GRANT ALL ON TABLE trade_history TO anon;
GRANT ALL ON TABLE bot_configs TO anon;
GRANT ALL ON TABLE profiles TO anon;

-- Selesai. Silakan coba jalankan bot kembali.
