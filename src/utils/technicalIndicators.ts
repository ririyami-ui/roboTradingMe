/**
 * Utility functions untuk menghitung indikator teknikal secara matematis 
 * tanpa perlu library charting visual (headless).
 * Sangat berguna untuk scanner background.
 */

export interface OHLC {
    o?: number;
    h?: number;
    l?: number;
    c?: number;
    v?: number;
    Open?: number;
    High?: number;
    Low?: number;
    Close?: number;
    volume?: number;
}

export type PriceData = number | OHLC;

// Menghitung Simple Moving Average (SMA)
export const calculateSMA = (data: number[], windowSize: number): (number | null)[] => {
    let sma: (number | null)[] = [];
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
export const calculateEMA = (data: (number | null)[], windowSize: number): (number | null)[] => {
    let ema: (number | null)[] = [];
    let k = 2 / (windowSize + 1);

    // Filter valid data points for initial SMA
    const validData = data.filter((v): v is number => v !== null);
    if (validData.length < windowSize) return new Array(data.length).fill(null);

    // EMA hari pertama = SMA
    let firstSmaSum = 0;
    let validCount = 0;
    let startIndex = -1;

    for (let i = 0; i < data.length; i++) {
        if (data[i] !== null) {
            firstSmaSum += data[i] as number;
            validCount++;
            if (validCount === windowSize) {
                startIndex = i;
                break;
            }
        }
    }

    if (startIndex === -1) return new Array(data.length).fill(null);
    let prevEma = firstSmaSum / windowSize;

    for (let i = 0; i < data.length; i++) {
        if (i < startIndex) {
            ema.push(null);
        } else if (i === startIndex) {
            ema.push(prevEma);
        } else {
            const currentVal = data[i];
            if (currentVal === null) {
                ema.push(null);
            } else {
                let currentEma = (currentVal * k) + (prevEma * (1 - k));
                ema.push(currentEma);
                prevEma = currentEma;
            }
        }
    }
    return ema;
};

// Menghitung Relative Strength Index (RSI)
export const calculateRSI = (data: number[], windowSize = 14): (number | null)[] => {
    let rsi: (number | null)[] = [];
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
            // Save initial averages
            gains = avgGain * windowSize;
            losses = avgLoss * windowSize;
        } else {
            let change = data[i] - data[i - 1];
            let gain = change > 0 ? change : 0;
            let loss = change < 0 ? -change : 0;

            let prevAvgGain = ((gains / windowSize) * (windowSize - 1) + gain) / windowSize;
            let prevAvgLoss = ((losses / windowSize) * (windowSize - 1) + loss) / windowSize;

            gains = prevAvgGain * windowSize;
            losses = prevAvgLoss * windowSize;

            let rs = prevAvgLoss === 0 ? 100 : prevAvgGain / prevAvgLoss;
            let currentRsi = 100 - (100 / (1 + rs));
            rsi.push(currentRsi);
        }
    }
    return rsi;
};

// Menghitung Stochastic RSI
export const calculateStochasticRSI = (data: (number | null)[], stochPeriod = 14, kPeriod = 3, dPeriod = 3): { k: (number | null)[], d: (number | null)[] } => {
    const validRsi = data.filter((v): v is number => v !== null);
    if (validRsi.length < stochPeriod) {
        return { 
            k: new Array(data.length).fill(null), 
            d: new Array(data.length).fill(null) 
        };
    }

    // 1. Calculate raw StochRSI
    let stochRsiValues: (number | null)[] = new Array(data.length).fill(null);
    
    // Find where RSI starts being valid
    let firstValidRsiIdx = data.findIndex(v => v !== null);
    if (firstValidRsiIdx === -1) return { k: new Array(data.length).fill(null), d: new Array(data.length).fill(null) };

    for (let i = firstValidRsiIdx + stochPeriod - 1; i < data.length; i++) {
        const window = data.slice(i - stochPeriod + 1, i + 1);
        const windowVals = window.filter((v): v is number => v !== null);
        
        if (windowVals.length < stochPeriod) continue;

        const minRsi = Math.min(...windowVals);
        const maxRsi = Math.max(...windowVals);
        const denom = maxRsi - minRsi;
        const currentRsi = data[i] as number;
        
        const val = denom === 0 ? 0 : (currentRsi - minRsi) / denom;
        stochRsiValues[i] = val * 100;
    }

    // 2. Calculate %K (SMA of StochRSI)
    // calculateSMA expects number[], so we pass the whole array and it handles nulls (if updated)
    // Wait, calculateSMA expects number[]. I should update calculateSMA to handle (number | null)[] or filter.
    // Let's create a local SMA helper that handles nulls.
    const smaHelper = (vals: (number | null)[], period: number) => {
        let res: (number | null)[] = [];
        for (let i = 0; i < vals.length; i++) {
            const window = vals.slice(Math.max(0, i - period + 1), i + 1);
            const validWindow = window.filter((v): v is number => v !== null);
            if (validWindow.length < period) {
                res.push(null);
            } else {
                res.push(validWindow.reduce((a, b) => a + b, 0) / period);
            }
        }
        return res;
    };

    const k = smaHelper(stochRsiValues, kPeriod);
    const d = smaHelper(k, dPeriod);

    return { k, d };
};

// Menghitung Moving Average Convergence Divergence (MACD)
export const calculateMACD = (data: number[], p1 = 12, p2 = 26, p3 = 9) => {
    const ema12 = calculateEMA(data, p1);
    const ema26 = calculateEMA(data, p2);

    let macdLine: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        const e12 = ema12[i];
        const e26 = ema26[i];
        if (e12 === null || e26 === null) macdLine.push(null);
        else macdLine.push(e12 - e26);
    }

    const validMacd = macdLine.filter((v): v is number => v !== null);
    const signalLineRaw = calculateEMA(macdLine, p3);
    
    let histogram: (number | null)[] = [];
    for (let i = 0; i < macdLine.length; i++) {
        const mArr = macdLine[i];
        const sArr = signalLineRaw[i];
        if (mArr === null || sArr === null) histogram.push(null);
        else histogram.push(mArr - sArr);
    }

    return { macd: macdLine, signal: signalLineRaw, hist: histogram };
};

// Menghitung Bollinger Bands (BB)
export const calculateBollingerBands = (data: number[], windowSize = 20, multiplier = 2) => {
    const sma = calculateSMA(data, windowSize);
    let upper: (number | null)[] = [], lower: (number | null)[] = [];

    for (let i = 0; i < data.length; i++) {
        const avg = sma[i];
        if (i < windowSize - 1 || avg === null) {
            upper.push(null);
            lower.push(null);
        } else {
            const slice = data.slice(i - windowSize + 1, i + 1);
            const stdDev = Math.sqrt(slice.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / windowSize);
            upper.push(avg + (multiplier * stdDev));
            lower.push(avg - (multiplier * stdDev));
        }
    }

    return { middle: sma, upper, lower };
};

// Menghitung Average True Range (ATR)
export const calculateATR = (ohlcData: OHLC[], windowSize = 14): (number | null)[] => {
    if (!ohlcData || ohlcData.length < 2) return new Array(ohlcData.length).fill(null);

    let trs: number[] = [];
    for (let i = 0; i < ohlcData.length; i++) {
        const current = ohlcData[i];
        const prev = i > 0 ? ohlcData[i - 1] : null;

        if (!prev) {
            trs.push((current.High || current.h || 0) - (current.Low || current.l || 0));
            continue;
        }

        const high = current.High || current.h || 0;
        const low = current.Low || current.l || 0;
        const prevClose = prev.Close || prev.c || 0;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trs.push(tr);
    }

    return calculateSMA(trs, windowSize);
};

// Deteksi Pola Candlestick Sederhana
export const detectCandlestickPattern = (candle: OHLC | null | undefined, prevCandle: OHLC | null | undefined = null): string | null => {
    if (!candle) return null;

    const open = candle.Open ?? candle.o ?? 0;
    const high = candle.High ?? candle.h ?? 0;
    const low = candle.Low ?? candle.l ?? 0;
    const close = candle.Close ?? candle.c ?? 0;

    if (open === 0 || high === 0 || low === 0 || close === 0) return null;

    const body = Math.abs(close - open);
    const candleRange = high - low;
    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;

    // 1. Doji
    if (body <= candleRange * 0.1) return 'DOJI';

    // 2. Hammer (Potential Reversal)
    if (lowerShadow > body * 2 && upperShadow < body * 0.5 && close > open) return 'HAMMER';

    // 3. Shooting Star (Potential Reversal)
    if (upperShadow > body * 2 && lowerShadow < body * 0.5 && close < open) return 'SHOOTING_STAR';

    // 4. Bullish Engulfing
    if (prevCandle) {
        const pOpen = prevCandle.Open ?? prevCandle.o ?? 0;
        const pClose = prevCandle.Close ?? prevCandle.c ?? 0;
        if (pClose < pOpen && close > open && close > pOpen && open < pClose) return 'BULLISH_ENGULFING';
    }

    // 5. Bearish Engulfing
    if (prevCandle) {
        const pOpen = prevCandle.Open ?? prevCandle.o ?? 0;
        const pClose = prevCandle.Close ?? prevCandle.c ?? 0;
        if (pClose > pOpen && close < open && close < pOpen && open > pClose) return 'BEARISH_ENGULFING';
    }

    return null;
};

/**
 * Menganalisis data harga mentah dan mengembalikan sinyal dasar (Lapis 1)
 */
export const analyzeTechnicalIndicators = (prices: PriceData[], returnFullData = false, isBullishMarket = false): any => {
    // Memastikan helper return number array untuk Close prices
    const closePrices = prices.map(p => typeof p === 'object' ? (p?.Close ?? p?.c ?? 0) : p) as number[];
    
    if (!closePrices || closePrices.length < 20) {
        return returnFullData ? { rsi: 50, ema12: 0, ema26: 0 } : 'HOLD';
    }

    const rsi14 = calculateRSI(closePrices, 14);
    const ema12 = calculateEMA(closePrices, 12);
    const ema26 = calculateEMA(closePrices, 26);

    const latestRsi = rsi14[rsi14.length - 1] ?? 50;
    const latestEma12 = ema12[ema12.length - 1] ?? 0;
    const latestEma26 = ema26[ema26.length - 1] ?? 0;
    const prevEma12 = ema12[ema12.length - 2] ?? 0;
    const prevEma26 = ema26[ema26.length - 2] ?? 0;

    const macdData = calculateMACD(closePrices);
    const bbData = calculateBollingerBands(closePrices);

    const latestHist = macdData.hist[macdData.hist.length - 1] ?? 0;
    const prevHist = macdData.hist[macdData.hist.length - 2] ?? 0;
    const latestPrice = closePrices[closePrices.length - 1];
    const lowerBB = bbData.lower[bbData.lower.length - 1] ?? 0;
    const upperBB = bbData.upper[bbData.upper.length - 1] ?? 0;

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

    const RSI_STRONG_BUY    = isBullishMarket ? 40 : 30;
    const RSI_POTENTIAL_BUY = isBullishMarket ? 50 : 40;
    const RSI_SELL          = isBullishMarket ? 80 : 72;  
    const RSI_MOMENTUM_HIGH = isBullishMarket ? 85 : 75;  

    const sma50 = calculateSMA(closePrices, 50);
    const latestSma50 = sma50[sma50.length - 1] ?? latestPrice;
    
    const isMajorTrendDown = latestPrice < (latestSma50 * 0.985); 
    
    const twentyCandlesAgo = closePrices[closePrices.length - 20] ?? latestPrice;
    const volatility20 = Math.abs((latestPrice - twentyCandlesAgo) / twentyCandlesAgo * 100);
    const isStableEnough = isBullishMarket ? volatility20 < 8.0 : volatility20 < 5.0;

    let isVolumeHealthy = true;
    if (prices.length > 20 && typeof prices[0] === 'object') {
        const lastP = prices[prices.length - 1] as OHLC;
        const currentVol = lastP.volume ?? lastP.v ?? 0;
        const volAvg = (prices.slice(-20) as OHLC[]).reduce((acc, p) => acc + (p.volume ?? p.v ?? 0), 0) / 20;
        isVolumeHealthy = currentVol > (volAvg * 1.2);
    }

    const isRsiBuy = latestRsi < RSI_STRONG_BUY;
    const isPriceAtBottom = isBullishMarket
        ? latestPrice <= (bbData.middle[bbData.middle.length - 1] ?? 0)
        : latestPrice <= lowerBB * 1.001;
    const isMacdRecovering = latestHist > prevHist && latestHist < 0; 

    if (isRsiBuy && isPriceAtBottom && isMacdRecovering && isStableEnough && !isMajorTrendDown && isVolumeHealthy) {
        return 'STRONG_BUY';
    }

    const isRsiOversold = latestRsi < RSI_POTENTIAL_BUY;
    const middleBB = bbData.middle[bbData.middle.length - 1] ?? 0;
    const isMacdCurvingUp = latestHist > prevHist;
    
    let hasBullishWick = true; 
    const latestCandle = prices[prices.length - 1];
    if (typeof latestCandle === 'object' && latestCandle !== null) {
        const c = latestCandle as OHLC;
        const close = c.Close ?? c.c ?? 0;
        const low = c.Low ?? c.l ?? 0;
        const open = c.Open ?? c.o ?? 0;
        
        if (close > 0 && low > 0) {
            const bodySize = Math.abs(close - open);
            const lowerWick = Math.min(open, close) - low;
            hasBullishWick = lowerWick > (bodySize * 0.5) || bodySize < (close * 0.001);
        }
    }

    const isPriceInLowerHalf = latestPrice <= middleBB;
    const isPriceCandleGreen = typeof latestCandle === 'object' && latestCandle !== null 
        ? ((latestCandle as OHLC).Close ?? (latestCandle as OHLC).c ?? 0) > ((latestCandle as OHLC).Open ?? (latestCandle as OHLC).o ?? 0)
        : (closePrices[closePrices.length - 1] > closePrices[closePrices.length - 2]);

    if (isRsiOversold && isPriceInLowerHalf && isStableEnough && isMacdCurvingUp && isPriceCandleGreen && hasBullishWick && isVolumeHealthy) {
        return 'POTENTIAL_BUY';
    }

    const isHealthyMomentum = latestRsi > 55 && latestRsi < RSI_MOMENTUM_HIGH;
    const isBullishCross = latestEma12 > latestEma26;
    const isMacdPushing = latestHist > 0 && latestHist > prevHist;

    if (isHealthyMomentum && isBullishCross && isMacdPushing) {
        return 'MOMENTUM_UP';
    }

    if (latestRsi > RSI_SELL || latestPrice >= upperBB * 0.998) {
        return 'POTENTIAL_SELL';
    }

    if (prevEma12 >= prevEma26 && latestEma12 < latestEma26) {
        return 'STRONG_SELL';
    }

    return 'HOLD';
};

export const analyzeEMAScalping = (prices: PriceData[]): string => {
    if (!prices || prices.length < 30) return 'HOLD';

    const closePrices = prices.map(p => typeof p === 'object' ? ((p?.Close ?? p?.c ?? 0)) : p) as number[];
    
    const ema9 = calculateEMA(closePrices, 9);
    const ema21 = calculateEMA(closePrices, 21);

    const latestPrice = closePrices[closePrices.length - 1];
    const latestEma9 = ema9[ema9.length - 1];
    const latestEma21 = ema21[ema21.length - 1];
    const prevPrice = closePrices[closePrices.length - 2];
    const prevEma9 = ema9[ema9.length - 2];

    if (latestEma9 === null || latestEma21 === null || prevEma9 === null) return 'HOLD';

    const isAboveEmas = latestPrice > latestEma9 && latestPrice > latestEma21;
    const isEmaBullish = latestEma9 > latestEma21;

    const margin = latestEma9 * 0.001; 
    const isPullback = (prevPrice <= prevEma9 + margin && prevPrice >= prevEma9 - margin) || 
                       (latestPrice <= latestEma9 + margin && latestPrice >= latestEma9 - margin);

    const rsi = calculateRSI(closePrices, 14);
    const latestRsi = rsi[rsi.length - 1] ?? 50;
    const isRsiOk = latestRsi < 65;

    const lastCandle = prices[prices.length - 1];
    const prevCandle = prices[prices.length - 2];
    const pattern = detectCandlestickPattern(lastCandle as OHLC, prevCandle as OHLC);
    
    const isBullishConfirm = pattern === 'HAMMER' || pattern === 'BULLISH_ENGULFING' || 
                            (typeof lastCandle === 'object' && lastCandle !== null
                                ? (((lastCandle as OHLC).Close ?? (lastCandle as OHLC).c ?? 0) > ((lastCandle as OHLC).Open ?? (lastCandle as OHLC).o ?? 0))
                                : (latestPrice > prevPrice));

    if (isAboveEmas && isEmaBullish && isPullback && isBullishConfirm && isRsiOk) {
        return 'BUY';
    }

    const isBearishPattern = pattern === 'SHOOTING_STAR' || pattern === 'BEARISH_ENGULFING';
    if (latestPrice < latestEma9 || isBearishPattern) {
        return 'SELL';
    }

    return 'HOLD';
};
// Refresh 03/17/2026 00:21:40
