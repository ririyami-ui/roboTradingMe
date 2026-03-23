const https = require('https');
https.get('https://indodax.com/api/summaries', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        const tickers = json.tickers;
        const vols = [];
        for (const pair in tickers) {
            if (pair.endsWith('_idr')) {
                vols.push({ pair, vol: parseFloat(tickers[pair].vol_idr) });
            }
        }
        vols.sort((a,b) => b.vol - a.vol);
        console.log("TOP 10 VOLUMES:");
        const top10 = vols.slice(0, 10);
        for (const t of top10) console.log(Math.round(t.vol));
        
        console.log("3 Miliar = 3000000000");
    });
});
