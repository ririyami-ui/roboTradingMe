# 📖 Panduan Strategi Trading: SaktiBot v1.2 🚀

Dokumen ini menjelaskan detail logika untuk setiap jenis strategi yang tersedia di pengaturan SaktiBot. Gunakan panduan ini untuk memilih strategi yang paling sesuai dengan kondisi pasar saat ini.

---

## 1. 🤖 SaktiBot Auto (Recommended)
**Filosofi**: Strategi "Pintar" yang beradaptasi dengan kondisi Bitcoin.
- **Logika**: Bot mendeteksi pergerakan BTC dalam 24 jam terakhir.
    - jika **BTC turun > 1.5%**: Bot masuk ke mode **Oversold Hunter** (menunggu pantulan di bawah).
    - jika **BTC stabil/naik**: Bot masuk ke mode **EMA Scalping** (mengikuti tren naik).
- **Kelebihan**: Sangat aman untuk dijalankan 24/7 karena otomatis mematikan mode *trend-following* saat pasar sedang "berdarah".

## 2. 🐝 Sakti Scalper 5M (Stable Trend)
**Filosofi**: Mencari tren yang lebih stabil dengan mengabaikan "noise" di timeframe kecil.
- **Timeframe**: 5 Menit (TF 5m).
- **Syarat Beli**: 
    1. EMA 9 > EMA 21 (Tren naik).
    2. Harga sudah di atas EMA 9 (Momentum kuat).
    3. RSI antara 35 - 65 (Bukan di area jenuh).
    4. Volume > Rata-rata 20 candle terakhir.
- **Target**: TP 1.5% / SL 1.0%.
- **Kelebihan**: Jarang terkena *fake breakout* dibandingkan TF 1 menit.

## 3. 📈 EMA Scalping (Golden Cross)
**Filosofi**: Mengikuti momentum "Golden Cross" pada timeframe mikro.
- **Timeframe**: 1 Menit (TF 1m).
- **Syarat Beli**: EMA 9 memotong ke atas EMA 21, Harga di atas EMA 9, dan **RSI ≤ 45**.
- **Target**: TP 2.5% / SL 1.5%.
- **Kelebihan**: Profit per trade lebih besar, cocok saat market sedang sangat *bullish* atau *sideways* lebar.

## 4. ⚡ Pure Scalping (Aggressive)
**Filosofi**: Frekuensi tinggi, profit kecil, masuk dan keluar dengan cepat.
- **Timeframe**: 1 Menit (TF 1m).
- **Syarat Beli**: Mirip EMA Scalping tapi lebih longgar. **RSI boleh sampai 50**.
- **Target**: TP 1.5% / SL 1.0%.
- **Kelebihan**: Paling sering mendapatkan sinyal beli (paling sibuk).

## 5. 🎯 Oversold Hunter (Improved Bearish)
**Filosofi**: Menangkap "pisau jatuh" tapi menunggu sampai mulai memantul.
- **Timeframe**: 1 Menit (TF 1m).
- **Syarat Beli**: 
    1. RSI sudah sangat rendah (**RSI ≤ 32**).
    2. Harga sudah berhasil memotong ke atas **EMA 9** (Konfirmasi pantulan dimulai).
    3. RSI sudah merangkak naik (**RSI > 28**).
- **Target**: TP 1.5% / SL 1.0%.
- **Kelebihan**: Sangat efektif saat pasar sedang jatuh bebas (market crash).

## 6. 📅 Day Trading & 🌊 Swing Trading
**Filosofi**: Untuk Anda yang ingin menahan koin lebih lama dengan target profit besar.
- **Day Trading**: TP 5% / SL 2.5%. Membutuhkan volume 1.5x rata-rata.
- **Swing Trading**: TP 15% / SL 5%. Membutuhkan volume 2x rata-rata.
- **Syarat**: Tren EMA harus naik dan RSI tidak boleh terlalu tinggi.
- **Kelebihan**: Tidak perlu sering melihat layar, sekali profit terasa sangat besar.

---

## 🛡️ Sistem Manajemen Risiko (Berlaku untuk Semua Strategi)
Aplikasi ini dilengkapi dengan fitur pengaman otomatis:

1.  **Trailing Take Profit (TTP)**: Bot tidak langsung menjual saat menyentuh target profit. Jika harga terus naik, bot akan "mengejar" harga tersebut ke atas. Bot baru akan menjual jika harga turun **0.5%** dari titik tertinggi yang pernah dicapai.
2.  **Move SL to Breakeven**: Jika profit sudah mencapai **1%**, Stop Loss akan otomatis dipindahkan ke harga beli (plus sedikit buffer). Jadi jika harga tiba-tiba jatuh, Anda tidak akan rugi modal.
3.  **Bitcoin Guard (Hard Stop)**: Jika Bitcoin turun lebih dari **5%** dalam 24 jam, bot akan berhenti melakukan pembelian baru demi keamanan modal Anda.
4.  **Daily Loss Limit**: Bot akan berhenti total jika total kerugian dalam hari tersebut mencapai batas yang Anda tentukan di Settings (default 3-5%).

---
*Gunakan **Simulation Mode** terlebih dahulu selama 24-48 jam saat mencoba strategi baru untuk melihat performanya secara real-time.*
