-- 1. Aktifkan ekstensi pg_cron (untuk menjalankan tugas terjadwal)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Buat fungsi pembersih database komprehensif
CREATE OR REPLACE FUNCTION clean_up_bot_database()
RETURNS void AS $$
BEGIN
  -- A. Hapus log yang lebih tua dari 7 hari
  DELETE FROM public.bot_logs
  WHERE created_at < now() - interval '7 days';

  -- B. Hapus riwayat trading yang lebih tua dari 30 hari (bisa disesuaikan)
  DELETE FROM public.trade_history
  WHERE created_at < now() - interval '30 days';
  
  -- C. (Opsional) Hapus koin di active_trades yang berumur > 3 hari tanpa pergerakan (Orphaned)
  DELETE FROM public.active_trades
  WHERE created_at < now() - interval '3 days';
END;
$$ LANGUAGE plpgsql;

-- 3. Jadwalkan tugas pembersihan setiap hari pada jam 03:00 Subuh (Waktu sepi)
SELECT cron.schedule('Pembersihan Database SaktiBot', '0 3 * * *', 'SELECT clean_up_bot_database()');

-- NOTIFIKASI:
-- Jika bapak ingin mengganti jadwal ke misal 3 hari sekali: interval '3 days'
-- Jika bapak ingin mengecek daftar tugas cron yang aktif: SELECT * FROM cron.job;
