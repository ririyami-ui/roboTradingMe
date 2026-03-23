const https = require('https');

https.get('https://indodax.com/tradingview/history_v2?symbol=BTCIDR&tf=1&from=' + (Math.floor(Date.now() / 1000) - 3600) + '&to=' + Math.floor(Date.now() / 1000), (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("History V2 Length:", json.length);
            if(json.length > 0) {
                console.log("Sample History V2 Item:", json[0]);
                console.log("Volume field name check. Keys:", Object.keys(json[0]));
            }
        } catch(e) { console.error("History parse error:", e); }
    });
});

https.get('https://indodax.com/api/depth/btc_idr', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("Depth API Buy length:", json.buy ? json.buy.length : 0);
            if(json.buy && json.buy.length > 0) {
                console.log("Sample Depth Buy Item:", json.buy[0]);
            }
        } catch(e) { console.error("Depth parse error:", e); }
    });
});
