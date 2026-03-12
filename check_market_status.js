const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkMarket() {
    try {
        const response = await fetch('https://indodax.com/api/summaries');
        const data = await response.json();
        
        console.log("Prices 24h keys:", Object.keys(data.prices_24h || {}).slice(0, 10));
        console.log("BTC_IDR p24 raw:", data.prices_24h?.btc_idr);
        
        const btc24h = parseFloat(data.prices_24h?.btcidr || 0);
        const btcCurrent = parseFloat(data.tickers.btc_idr?.last || 0);
        const btcChange = ((btcCurrent - btc24h) / btc24h * 100).toFixed(2);
        
        console.log(`Bitcoin 24h Change: ${btcChange}%`);
        console.log(`Bitcoin Current: Rp ${btcCurrent.toLocaleString()}`);
        
        const indicators = [];
        if (btcChange < -5) indicators.push("BITCOIN_CRASH (>5%)");
        else if (btcChange < -2) indicators.push("MARKET_BEARISH (2-5%)");
        else if (btcChange > 2) indicators.push("MARKET_BULLISH (>2%)");
        else indicators.push("MARKET_SIDEWAYS");
        
        // Check general volume
        const totalVolume = Object.values(data.tickers).reduce((acc, t) => acc + (parseFloat(t.vol_idr) || 0), 0);
        console.log(`Total Volume (IDR): Rp ${totalVolume.toLocaleString()}`);
        
        // Check winners/losers
        const sortedCoins = Object.entries(data.tickers)
            .filter(([pair]) => pair.endsWith('_idr'))
            .map(([pair, t]) => {
                const p24 = parseFloat(data.prices_24h[pair]);
                const last = parseFloat(t.last);
                const change = ((last - p24) / p24 * 100).toFixed(2);
                return { pair, change: parseFloat(change) };
            })
            .sort((a, b) => b.change - a.change);
            
        console.log(`Top Winner: ${sortedCoins[0].pair} (${sortedCoins[0].change}%)`);
        console.log(`Top Loser: ${sortedCoins[sortedCoins.length - 1].pair} (${sortedCoins[sortedCoins.length - 1].change}%)`);
        
        console.log("\nSummary Status:", indicators.join(", "));
    } catch (err) {
        console.error("Error fetching market data:", err.message);
    }
}

checkMarket();
