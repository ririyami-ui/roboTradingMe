const axios = require('axios');

async function analyzeMarket() {
    console.log("SaktiBot: Menganalisis kondisi pasar Indodax...");
    try {
        const response = await axios.get('https://indodax.com/api/summaries');
        const data = response.data;
        
        if (!data || !data.tickers) {
            console.log("Gagal mengambil data pasar.");
            return;
        }

        const tickers = data.tickers;
        const prices24h = data.prices_24h;
        
        let upCount = 0;
        let downCount = 0;
        let stableCount = 0;
        let totalCoins = 0;
        let totalVol = 0;
        
        // Analyze BTC specifically
        const btc_current = parseFloat(tickers.btc_idr.last);
        const btc_24h = parseFloat(prices24h.btcidr);
        const btc_change = ((btc_current - btc_24h) / btc_24h) * 100;

        const results = [];

        for (const pair in tickers) {
            if (pair.endsWith('_idr')) {
                const current = parseFloat(tickers[pair].last);
                const key24 = pair.replace('_', '');
                const old = parseFloat(prices24h[key24]);
                const vol = parseFloat(tickers[pair].vol_idr || 0);

                if (old > 0) {
                    const change = ((current - old) / old) * 100;
                    if (change > 1) upCount++;
                    else if (change < -1) downCount++;
                    else stableCount++;
                    
                    totalCoins++;
                    totalVol += vol;
                    
                    results.push({ pair, change, vol });
                }
            }
        }

        // Sort by change to see top movers
        results.sort((a, b) => b.change - a.change);

        console.log("\n--- HASIL ANALISIS PASAR ---");
        console.log(`Bitcoin (BTC/IDR): ${btc_change.toFixed(2)}% dalam 24 jam`);
        console.log(`Statistik Koin IDR:`);
        console.log(`- Naik (>1%): ${upCount}`);
        console.log(`- Turun (<-1%): ${downCount}`);
        console.log(`- Sideways/Stabil: ${stableCount}`);
        console.log(`- Total Pair Aktif: ${totalCoins}`);
        
        console.log(`\nTop 5 Movers:`);
        results.slice(0, 5).forEach(r => console.log(`- ${r.pair.toUpperCase()}: ${r.change.toFixed(2)}%`));

        let sentiment = "";
        if (btc_change < -2.5) sentiment = "BEARISH / PANIC (Bahaya!)";
        else if (btc_change > 2.5) sentiment = "BULLISH / FOMO (Optimis!)";
        else if (stableCount > (upCount + downCount)) sentiment = "JENUH / SIDEWAYS (Momentum Tipis)";
        else if (downCount > upCount * 1.5) sentiment = "WEAK / COOLING DOWN";
        else sentiment = "NEUTRAL / MIXED";

        console.log(`\nKESIMPULAN SENTIMEN: ${sentiment}`);
        
        if (sentiment === "JENUH / SIDEWAYS (Momentum Tipis)") {
            console.log("\nInsight: Pasar benar-benar sedang JENUH (sideways parah).");
            console.log("- Mayoritas koin bergerak kurang dari 1% dalam 24 jam.");
            console.log("- Tidak ada dorongan beli (volume) yang cukup kuat untuk menembus resistensi.");
            console.log("- Momentum sulit didapat karena harga hanya bolak-balik di area kecil.");
        } else if (sentiment === "WEAK / COOLING DOWN") {
            console.log("\nInsight: Pasar sedikit melemah (cooling down). Momentum sulit karena tekanan jual lebih dominan dibanding minat beli.");
        } else {
            console.log("\nInsight: Pasar sedang mencari arah. Momentum mungkin hanya ada di koin-koin 'gorengan' tertentu saja.");
        }

    } catch (error) {
        console.error("Error Analisis:", error.message);
    }
}

analyzeMarket();
