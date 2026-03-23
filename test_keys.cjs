const https = require('https');
https.get('https://indodax.com/api/summaries', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        const tickers = json.tickers;
        console.log("Keys btc_idr:", Object.keys(tickers.btc_idr));
        console.log("Sample btc_idr:", tickers.btc_idr);
    });
});
