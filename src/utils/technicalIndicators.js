/**
 * Utility functions untuk menghitung indikator teknikal secara matematis 
 * tanpa perlu library charting visual (headless).
 * Sangat berguna untuk scanner background.
 */

// Menghitung Simple Moving Average (SMA)
export const calculateSMA = (data, windowSize) => {
    let sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
            sma.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) {
                sum += data[i - j];
            }
            sma.push(sum / windowSize);
        }
    }
    return sma;
};

// Menghitung Exponential Moving Average (EMA)
export const calculateEMA = (data, windowSize) => {
    let ema = [];
    let k = 2 / (windowSize + 1);

    // EMA hari pertama = SMA
    let firstSmaSum = 0;
    for (let i = 0; i < windowSize && i < data.length; i++) {
        firstSmaSum += data[i];
    }
    let prevEma = firstSmaSum / windowSize;

    for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
            ema.push(null);
        } else if (i === windowSize - 1) {
            ema.push(prevEma);
        } else {
            let currentEma = (data[i] * k) + (prevEma * (1 - k));
            ema.push(currentEma);
            prevEma = currentEma;
        }
    }
    return ema;
};

// Menghitung Relative Strength Index (RSI)
export const calculateRSI = (data, windowSize = 14) => {
    let rsi = [];
    let gains = 0;
    let losses = 0;

    for (let i = 0; i < data.length; i++) {
        if (i < windowSize) {
            rsi.push(null);
            if (i > 0) {
                let change = data[i] - data[i - 1];
                if (change > 0) gains += change;
                else losses -= change;
            }
        } else if (i === windowSize) {
            let avgGain = gains / windowSize;
            let avgLoss = losses / windowSize;
            let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            let currentRsi = 100 - (100 / (1 + rs));
            rsi.push(currentRsi);
        } else {
            let change = data[i] - data[i - 1];
            let gain = change > 0 ? change : 0;
            let loss = change < 0 ? -change : 0;

            // Smoothed Moving Average (SMMA) untuk RSI
            let prevAvgGain = ((gains / windowSize) * (windowSize - 1) + gain) / windowSize;
            let prevAvgLoss = ((losses / windowSize) * (windowSize - 1) + loss) / windowSize;

            // Simpan state untuk iterasi berikutnya (approximation sederhana)
            gains = prevAvgGain * windowSize;
            losses = prevAvgLoss * windowSize;

            let rs = prevAvgLoss === 0 ? 100 : prevAvgGain / prevAvgLoss;
            let currentRsi = 100 - (100 / (1 + rs));
            rsi.push(currentRsi);
        }
    }
    return rsi;
};

// Menghitung Moving Average Convergence Divergence (MACD)
export const calculateMACD = (data, p1 = 12, p2 = 26, p3 = 9) => {
    const ema12 = calculateEMA(data, p1);
    const ema26 = calculateEMA(data, p2);

    let macdLine = [];
    for (let i = 0; i < data.length; i++) {
        if (ema12[i] === null || ema26[i] === null) macdLine.push(null);
        else macdLine.push(ema12[i] - ema26[i]);
    }

    const signalLine = calculateEMA(macdLine.filter(v => v !== null), p3);
    const fullSignalLine = new Array(macdLine.length - signalLine.length).fill(null).concat(signalLine);

    let histogram = [];
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] === null || fullSignalLine[i] === null) histogram.push(null);
        else histogram.push(macdLine[i] - fullSignalLine[i]);
    }

    return { macd: macdLine, signal: fullSignalLine, hist: histogram };
};

// Menghitung Bollinger Bands (BB)
export const calculateBollingerBands = (data, windowSize = 20, multiplier = 2) => {
    const sma = calculateSMA(data, windowSize);
    let upper = [], lower = [];

    for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
            upper.push(null);
            lower.push(null);
        } else {
            const slice = data.slice(i - windowSize + 1, i + 1);
            const avg = sma[i];
            const stdDev = Math.sqrt(slice.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / windowSize);
            upper.push(avg + (multiplier * stdDev));
            lower.push(avg - (multiplier * stdDev));
        }
    }

    return { middle: sma, upper, lower };
};

/**
 * Menganalisis data harga mentah dan mengembalikan sinyal dasar (Lapis 1)
 * @param {Array<number>} prices Array history harga penutupan (close prices)
 * @param {boolean} returnFullData Jika true, kembalikan objek data indikator mentah
 * @returns {string|object} Sinyal teknikal atau objek data indikator
 */
export const analyzeTechnicalIndicators = (prices, returnFullData = false) => {
    if (!prices || prices.length < 20) return returnFullData ? { rsi: 50, ema12: 0, ema26: 0 } : 'HOLD';

    const rsi14 = calculateRSI(prices, 14);
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);

    const latestRsi = rsi14[rsi14.length - 1];
    const latestEma12 = ema12[ema12.length - 1];
    const latestEma26 = ema26[ema26.length - 1];
    const prevEma12 = ema12[ema12.length - 2];
    const prevEma26 = ema26[ema26.length - 2];

    // Indikator Tambahan Lapis 2 Mandiri (Tanpa API AI)
    const macdData = calculateMACD(prices);
    const bbData = calculateBollingerBands(prices);

    const latestHist = macdData.hist[macdData.hist.length - 1];
    const prevHist = macdData.hist[macdData.hist.length - 2];
    const latestPrice = prices[prices.length - 1];
    const lowerBB = bbData.lower[bbData.lower.length - 1];
    const upperBB = bbData.upper[bbData.upper.length - 1];

    if (returnFullData) {
        return {
            rsi: latestRsi,
            ema12: latestEma12,
            ema26: latestEma26,
            prevEma12,
            prevEma26,
            macdHist: latestHist,
            lowerBB,
            upperBB
        };
    }

    /**
     * STRATEGI KONSERVATIF v3 (ANTI STOP-LOSS - MAX STABILITY):
     * STRONG_BUY: 4 konfirmasi (RSI oversold + BB Bottom + MACD recovering + Trend Stability)
     * POTENTIAL_BUY: RSI < 32 + EMA cross + Not Overextended
     */

    // --- FILTER TREN JANGKA PANJANG (50 Candles) ---
    const sma50 = calculateSMA(prices, 50);
    const latestSma50 = sma50[sma50.length - 1];
    const prevSma50 = sma50[sma50.length - 10]; // Cek 10 bar lalu
    const isMajorTrendDown = latestSma50 && prevSma50 && latestPrice < latestSma50 && latestSma50 < prevSma50;
    
    // --- FILTER VOLATILITAS EKSTRIM ---
    const twentyCandlesAgo = prices[prices.length - 20];
    const volatility20 = Math.abs((latestPrice - twentyCandlesAgo) / twentyCandlesAgo * 100);
    const isStableEnough = volatility20 < 2.5; // [RELAXED] 1.8 -> 2.5 untuk menangkap momentum

    // --- STRONG BUY: Melonggarkan sedikit ---
    const isRsiBuy = latestRsi < 30; // [RELAXED] 28 -> 30
    const isPriceAtBottom = latestPrice <= lowerBB * 1.001; // [RELAXED] 0.05% -> 0.1%
    const isMacdRecovering = latestHist !== null && prevHist !== null && latestHist > prevHist && latestHist < 0; 

    if (isRsiBuy && isPriceAtBottom && isMacdRecovering && isStableEnough && !isMajorTrendDown) {
        return 'STRONG_BUY';
    }

    // --- POTENTIAL BUY: Melonggarkan sedikit ---
    const isRealGoldenCross = latestEma12 > latestEma26; 
    const isRsiOversold = latestRsi < 35; // [RELAXED] 32 -> 35
    const middleBB = bbData.middle[bbData.middle.length - 1];
    const isNotOverextended = latestPrice < middleBB * 0.995; // [RELAXED] 1.5% -> 0.5% dibawah middle BB

    if (isRsiOversold && isRealGoldenCross && isNotOverextended && isStableEnough && !isMajorTrendDown) {
        return 'POTENTIAL_BUY';
    }

    // --- MOMENTUM BREAKOUT: Khusus untuk menangkap lonjakan pasar (Breakout) ---
    // Di sini kita sengaja melepas filter Volatilitas dan Major Trend Down 
    // karena momentum seringkali datang dengan volatilitas tinggi dan berlawanan tren lama.
    const isHealthyMomentum = latestRsi > 45 && latestRsi < 68; // [RELAXED] 48-65 -> 45-68
    const isBullishCross = latestEma12 > latestEma26;
    const isMacdPushing = latestHist > 0 && latestHist > prevHist;
    const isAboveEma50 = latestSma50 && latestPrice > latestSma50 * 0.995; // Toleransi 0.5% di bawah EMA50

    if (isHealthyMomentum && isBullishCross && isMacdPushing && isAboveEma50) {
        return 'MOMENTUM_UP';
    }

    // --- SELL: RSI Overbought atau harga menembus Upper BB ---
    if (latestRsi > 65 || latestPrice >= upperBB * 0.998) { // [FIX] RSI Sell: 68 -> 65
        return 'POTENTIAL_SELL';
    }

    // --- SELL: Dead cross EMA (EMA12 memotong ke bawah EMA26) ---
    if (prevEma12 >= prevEma26 && latestEma12 < latestEma26) {
        return 'STRONG_SELL';
    }

    return 'HOLD';
};
