const https = require('https');

// Change this to your deployed worker URL for final verification
const PROXY_URL = 'https://indodax-proxy.ri2ami77.workers.dev/tradingview/history_v2?symbol=BTCIDR&tf=15&from=1773062456&to=1773512456';

function fetchProxy(label) {
    console.log(`[${label}] Fetching from proxy...`);
    const start = Date.now();
    https.get(PROXY_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const duration = Date.now() - start;
            console.log(`[${label}] Status: ${res.status}`);
            console.log(`[${label}] Duration: ${duration}ms`);
            console.log(`[${label}] Cache Status: ${res.headers['x-proxy-cache']}`);
            console.log(`[${label}] CORS Header: ${res.headers['access-control-allow-origin']}`);
            try {
                const json = JSON.parse(data);
                console.log(`[${label}] Data Length: ${json.length || 'N/A'}`);
            } catch (e) {
                console.error(`[${label}] Parse error:`, e.message);
            }
            console.log('---');
        });
    }).on('error', (err) => {
        console.error(`[${label}] Request error:`, err.message);
    });
}

console.log("Starting Proxy Verification...");
// Test MISS (first request)
fetchProxy('Initial Request');

// Test HIT (second request after a short delay)
setTimeout(() => {
    fetchProxy('Cached Request');
}, 2000);
