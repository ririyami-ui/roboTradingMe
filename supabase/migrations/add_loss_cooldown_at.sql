-- Menambahkan kolom loss_cooldown_at untuk sinkronisasi jeda bot antar perangkat
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS loss_cooldown_at TIMESTAMPTZ;
