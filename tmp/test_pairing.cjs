
const allCoins = [
    { id: 'bitcoin', symbol: 'BTC' },
    { id: 'ethereum', symbol: 'ETH' },
    { id: 'tether', symbol: 'USDT' },
    { id: 'polygon-ecosystem-token', symbol: 'POL' },
    { id: 'shiba-inu', symbol: 'SHIB' }
];

const indodaxPairs = new Set(['btc_idr', 'eth_idr', 'usdt_idr', 'pol_idr', 'shib_idr', 'btc_usdt']);

const getPair = (coinId) => {
    if (!coinId) return 'btc_idr';

    // Sanitasi input
    let cleanId = coinId.toLowerCase();
    if (cleanId.includes('-')) cleanId = cleanId.split('-')[0];
    if (cleanId.includes('_')) cleanId = cleanId.split('_')[0];

    // 1. Pengecualian manual
    const overrides = {
        'polygon-ecosystem-token': 'pol_idr',
        'avalanche-2': 'avax_idr',
        'shiba-inu': 'shib_idr',
        'indodax-token': 'idt_idr',
        'polygon': 'pol_idr'
    };
    if (overrides[coinId]) return overrides[coinId];

    // 2. Cari simbol
    const coinObj = allCoins.find(c => c.id === coinId) || 
                    allCoins.find(c => c.symbol?.toLowerCase() === cleanId);
    
    const symbol = (coinObj?.symbol || cleanId).toLowerCase();

    // 2. Cek IDR pair
    const idrPair = `${symbol}_idr`;
    if (indodaxPairs.has(idrPair)) return idrPair;

    // 3. Cek USDT pair
    const usdtPair = `${symbol}_usdt`;
    if (indodaxPairs.has(usdtPair)) return usdtPair;

    return idrPair;
};

const testCases = [
    'bitcoin',
    'ethereum',
    'BTC',
    'btc-idr',
    'polygon-ecosystem-token',
    'SHIB',
    'shiba-inu',
    'polygon'
];

testCases.forEach(tc => {
    console.log(`Input: ${tc} -> Result: ${getPair(tc)}`);
});
