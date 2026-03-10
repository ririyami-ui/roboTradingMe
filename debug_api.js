
import https from 'https';

https.get('https://indodax.com/api/summaries', (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Root Keys:', Object.keys(json));
            const firstPair = Object.keys(json.tickers)[0];
            console.log('First Ticker Pair:', firstPair);
            console.log('First Ticker Fields:', Object.keys(json.tickers[firstPair]));
            console.log('Values:', json.tickers[firstPair]);
            if (json.prices_24h) {
                console.log('Prices 24h Root:', Object.keys(json.prices_24h).slice(0, 5));
                console.log('Price 24h for', firstPair, ':', json.prices_24h[firstPair]);
            }
        } catch (e) {
            console.error('Parse error:', e.message);
            // console.log('Data sample:', data.substring(0, 100));
        }
    });
}).on("error", (err) => {
    console.log("Error: " + err.message);
});
