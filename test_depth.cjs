const https = require('https');
https.get('https://indodax.com/api/btc_idr/depth', (res) => { // NOTE: API format is usually /api/pair/ticker or /api/pair/depth! wait. 
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("api/btc_idr/depth Buy length:", json.buy ? json.buy.length : "undefined");
        } catch(e) { console.error("Parse error:", e); }
    });
});

https.get('https://indodax.com/api/depth/btc_idr', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("api/depth/btc_idr Buy length:", json.buy ? json.buy.length : "undefined");
        } catch(e) { console.error("Parse error:", e); }
    });
});
