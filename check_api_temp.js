
const fetch = require('node-fetch');

async function checkApi() {
    const urls = [
        'https://cryptoanalyzer-2de3a.web.app/api/indodax/proxy/summaries',
        'https://api.indodax.com/api/summaries'
    ];
    
    for (const url of urls) {
        try {
            console.log(`Checking ${url}...`);
            const res = await fetch(url, { timeout: 5000 });
            console.log(`Status: ${res.status}`);
            const text = await res.text();
            console.log(`Length: ${text.length}`);
            if (text.length < 100) console.log(`Response: ${text}`);
        } catch (e) {
            console.error(`Error ${url}:`, e.message);
        }
    }
}

checkApi();
