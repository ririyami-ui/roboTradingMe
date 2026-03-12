/**
 * Utility untuk menganalisis Order Book (Depth) Indodax.
 * Membantu mendeteksi tekanan pasar, tembok beli/jual, dan likuiditas.
 */

/**
 * Menganalisis ketidakseimbangan (imbalance) volume di order book.
 * @param {Object} depthData - Data dari Indodax fetchOrderBook
 * @param {number} rangePercent - Range harga dari mid-price untuk dianalisis (default 2%)
 * @returns {Object} Hasil analisis
 */
export const analyzeOrderBook = (depthData, rangePercent = 2.0) => {
    if (!depthData || !depthData.buy || !depthData.sell) {
        return { imbalance: 0, buyPressure: 0, sellPressure: 0, spread: 0, status: 'NEUTRAL' };
    }

    const bestBid = parseFloat(depthData.buy[0][0]);
    const bestAsk = parseFloat(depthData.sell[0][0]);
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = ((bestAsk - bestBid) / midPrice) * 100;

    const buyCap = midPrice * (1 - rangePercent / 100);
    const sellCap = midPrice * (1 + rangePercent / 100);

    let totalBuyVolume = 0;
    let totalSellVolume = 0;

    // Hitung volume beli dalam range X%
    for (const [price, amount] of depthData.buy) {
        const p = parseFloat(price);
        if (p < buyCap) break; // Keluar jika sudah di luar range
        totalBuyVolume += parseFloat(amount) * p; // Volume dalam IDR
    }

    // Hitung volume jual dalam range X%
    for (const [price, amount] of depthData.sell) {
        const p = parseFloat(price);
        if (p > sellCap) break; // Keluar jika sudah di luar range
        totalSellVolume += parseFloat(amount) * p; // Volume dalam IDR
    }

    const totalVolume = totalBuyVolume + totalSellVolume;
    const buyPressure = totalVolume > 0 ? (totalBuyVolume / totalVolume) * 100 : 50;
    const sellPressure = totalVolume > 0 ? (totalSellVolume / totalVolume) * 100 : 50;

    // Imbalance positif berarti lebih banyak volume beli (Bullish)
    // Imbalance negatif berarti lebih banyak volume jual (Bearish)
    const imbalance = buyPressure - sellPressure;

    let status = 'NEUTRAL';
    if (imbalance > 25) status = 'BULLISH_PRESSURE';
    if (imbalance < -25) status = 'BEARISH_PRESSURE';
    if (spreadPercent > 1.0) status = 'LOW_LIQUIDITY';

    return {
        imbalance,
        buyPressure,
        sellPressure,
        spread: spreadPercent,
        status,
        totalBuyVolume,
        totalSellVolume
    };
};

/**
 * Mencari "Tembok" (Big Orders) yang bisa menahan harga.
 * @param {Array} orders - Array orders [[price, amount], ...]
 * @param {number} thresholdFactor - Faktor pengali dari rata-rata order (default 5x)
 */
export const findMarketWalls = (orders, thresholdFactor = 5.0) => {
    if (!orders || orders.length < 10) return [];

    const topOrders = orders.slice(0, 20);
    const volumes = topOrders.map(o => parseFloat(o[1]) * parseFloat(o[0]));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    return topOrders
        .map(o => ({
            price: parseFloat(o[0]),
            amount: parseFloat(o[1]),
            volume: parseFloat(o[1]) * parseFloat(o[0])
        }))
        .filter(o => o.volume > avgVolume * thresholdFactor);
};
