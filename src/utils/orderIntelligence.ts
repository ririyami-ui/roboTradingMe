import { analyzeOrderBook, findMarketWalls } from './orderBookAnalysis';

/**
 * Menganalisis apakah sebuah order beli (BUY) masih layak dipertahankan.
 * @param {any} order - Objek order dari Indodax (openOrders)
 * @param {number} currentPrice - Harga pasar saat ini
 * @returns {object} { shouldCancel: boolean, reason?: string }
 */
export const checkBuyOrderIntelligence = (order: any, currentPrice: number): { shouldCancel: boolean, reason?: string } => {
    const orderPrice = parseFloat(order.price);
    const timeOpen = Date.now() - (parseInt(order.submit_time || Date.now()));
    
    // 1. Jika harga sudah lari jauh ke atas (>1.5%) dan belum match, cancel karena sudah kemahalan/ketinggalan
    if (currentPrice > orderPrice * 1.015) {
        return { shouldCancel: true, reason: 'Harga sudah lari jauh (Missed Entry)' };
    }

    // 2. Jika order sudah menggantung > 10 menit dan belum match sama sekali
    if (timeOpen > 10 * 60 * 1000) {
        return { shouldCancel: true, reason: 'Order kadaluarsa (>10 menit)' };
    }

    return { shouldCancel: false };
};

/**
 * Menganalisis apakah sebuah order jual (SELL) perlu diturunkan harganya (Panic Sell/Take Profit early).
 * @param {any} order - Objek order dari Indodax
 * @param {any} depthData - Data order book terbaru
 * @returns {object} { shouldAdjust: boolean, newPrice?: number, reason?: string }
 */
export const checkSellOrderIntelligence = (order: any, depthData: any): { shouldAdjust: boolean, newPrice?: number, reason?: string } => {
    if (!depthData) return { shouldAdjust: false };

    const analysis = analyzeOrderBook(depthData);
    const orderPrice = parseFloat(order.price);
    const bestBid = parseFloat(depthData.buy?.[0]?.[0] || 0);

    // 1. Jika Buy Pressure anjlok (< 35%) dan harga mendekati target, perkecil target agar aman
    if (analysis.buyPressure < 35 && orderPrice > bestBid * 1.005 && bestBid > 0) {
        // Turunkan harga ke best bid + 0.1% agar cepat kejual (Front-running)
        const optimizedPrice = Math.floor(bestBid * 1.001);
        return { 
            shouldAdjust: true, 
            newPrice: optimizedPrice, 
            reason: `Tekanan beli lemah (${analysis.buyPressure.toFixed(1)}%). Menurunkan target untuk kunci profit.` 
        };
    }

    // 2. Jika ada Tembok Jual Besar (Wall) yang muncul tepat di bawah harga jual kita
    const sellWalls = findMarketWalls(depthData.sell || []);
    const wallBelowTarget = sellWalls.find(wall => wall.price < orderPrice && wall.price > bestBid);

    if (wallBelowTarget && bestBid > 0) {
        // Pasang harga tepat di bawah tembok tersebut (front running the wall)
        const optimizedPrice = Math.floor(wallBelowTarget.price - 1);
        return { 
            shouldAdjust: true, 
            newPrice: optimizedPrice, 
            reason: `Tembok jual besar terdeteksi di Rp ${wallBelowTarget.price}. Menyesuaikan target ke bawah tembok.` 
        };
    }

    return { shouldAdjust: false };
};
// Refresh 03/17/2026 00:21:40
