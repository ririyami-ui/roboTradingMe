# 🧠 Logika & Cara Kerja SaktiBot

Dokumen ini menjelaskan alur kerja, strategi teknis, dan sistem perlindungan risiko yang digunakan oleh SaktiBot untuk melakukan trading otomatis secara aman dan menguntungkan.

---

## 🚀 1. Alur Kerja Utama (Lifecycle)

Setiap siklus pemindaian (*scan loop*) mengikuti urutan prioritas berikut:

1.  **Safety Guard (Pencegahan Rugi)**:
    *   **Bitcoin Guard**: Mengecek persentase perubahan BTC 24 jam. Jika BTC turun > 4%, bot berhenti membeli untuk menghindari "Altcoin Bloodbath".
    *   **Daily Loss Limit**: Mengecek total P/L hari ini. Jika kerugian mencapai batas (misal -5%), bot istirahat selama 1 jam.
2.  **Pemilihan Koin**: 
    *   Bot memindai koin-koin unggulan (Top Volume/Volatility) dari Indodax secara bergiliran.
3.  **Analisis Teknikal**:
    *   Mengambil data riwayat harga (candlestick 1 menit).
    *   Menghitung indikator **EMA 9**, **EMA 21**, dan **RSI 14**.
4.  **Analisis Order Book (Kedalaman Pasar)**:
    *   Mengecek **Spread**: Selisih harga jual/beli harus < 2%.
    *   Mengecek **Liquidity**: Memastikan koin tersebut memiliki volume yang cukup untuk dijual kembali dengan cepat.
5.  **Eksekusi (Execution)**:
    *   Jika semua syarat terpenuhi (Sinyal Buy-Cross), bot melakukan pembelian (Real atau Simulasi).
    *   Mengatur jaring pengaman **Hard Stop Loss** langsung di server bursa (Indodax).

---

## 📈 2. Strategi Trading (Entry Rules)

SaktiBot Menggunakan kombinasi **EMA Scalping** yang dioptimalkan:

*   **Bullish Crossover**: Sinyal utama muncul saat **EMA 9** (garis cepat) memotong ke atas **EMA 21** (garis lambat).
*   **RSI Filter**: 
    *   Bot akan membeli jika **RSI < 65** (belum terlalu jenuh beli/overbought).
    *   Mendukung deteksi **Oversold** (RSI < 30) untuk menangkap momen pantulan (*rebound*).
*   **Trend Confirmation**: Bot lebih agresif saat Bitcoin sedang hijau (Bullish) dan lebih hati-hati saat Bitcoin merah (Bearish).

### B. OVERSOLD REBOUND (Bearish Hunter) 🎯
*   **Logika**: Strategi khusus untuk pasar yang sedang jatuh atau merah pekat.
*   **Kriteria Beli**: Bot hanya akan membeli jika **RSI < 25** (Kondisi Jenuh Jual Ekstrim).
*   **Tujuan**: Menangkap pantulan harga (*rebound*) sesaat setelah harga terjun bebas.
*   **Target**: Profit cepat **1.5%** dengan perlindungan modal yang ketat.

---

## 🛡️ 3. Manajemen Risiko & Profit (Exit Rules)

Sistem keluar dirancang untuk memaksimalkan keuntungan dan meminimalkan kerugian secara otomatis:

### A. Trailing Take Profit (TTP) - "Let the Profits Run"
*   Saat target profit awal (misal 2.5%) tercapai, bot **TIDAK** langsung menjual.
*   Bot masuk ke mode **TTP Active (Riding Trend)**. Bot akan terus mengikuti harga selama masih naik.
*   Bot baru akan menjual jika harga turun sedikit (sekitar 0.5% - 0.8%) dari titik **Tertinggi Baru**-nya.
*   *Tujuannya: Menangkap profit 5%, 10%, atau lebih saat terjadi "pump" mendadak.*

### B. Intelligent Stop Loss (SL)
*   **Hard SL**: Terpasang di server exchange sebagai "asuransi" terakhir jika harga terjun bebas saat aplikasi ditutup.
*   **Soft SL**: Bot memantau pergerakan secara real-time untuk keluar lebih awal jika tren terlihat berbalik arah sebelum menyentuh Hard SL.

---

## ☁️ 4. Infrastruktur Hybrid (Lokal & Cloud)

SaktiBot menggabungkan kelebihan kecepatan browser dan keamanan cloud:

*   **Local Processing**: Analisis teknikal dan logika "Otak" bot berjalan di browser Anda (lebih cepat dan API Key tidak bocor ke server luar).
*   **Cloud Fallback (Supabase)**: Semua pengaturan dan riwayat tersimpan di backend.
*   **Data Protection**: Jika Anda menutup browser atau data server terhapus, bot memiliki salinan pengaturan di **LocalStorage** browser agar konfigurasi tetap aman.

---

## 📊 5. Log Aktivitas Informatif
Bot selalu memberikan laporan jujur di layar:
*   `🔍 Memindai...`: Bot sedang bekerja menyisir pasar.
*   `🎯 Sinyal beli terdeteksi`: Bot menemukan peluang teknis.
*   `ℹ️ [Info] ... dilewati`: Menjelaskan kenapa bot tidak membeli koin tertentu (misal: RSI terlalu tinggi).
*   `📈 TTP Active`: Bot sedang membiarkan profit Anda bertambah.

---
*Gunakan bot ini dengan bijak. Selalu perhatikan batas risiko (Stop Loss) yang Anda tetapkan di pengaturan.*
