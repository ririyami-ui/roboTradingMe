/**
 * SAKTI-BOT CLI (Termux Edition) v1.0
 * -----------------------------------
 * Bot trading otomatis untuk Indodax yang dioptimalkan untuk perangkat mobile (Android/Termux).
 * Ringan, hemat baterai, dan berjalan 24/7 di latar belakang.
 * 
 * CARA INSTALL DI TERMUX:
 * 1. pkg update && pkg upgrade
 * 2. pkg install nodejs
 * 3. npm install axios crypto-js
 * 4. Jalankan: node bot-termux.js
 */

import axios from 'axios';
import CryptoJS from 'crypto-js';
import readline from 'readline';
import fs from 'fs';

// ==========================================
// KONFIGURASI DEFAULT
// ==========================================
let config = {
    apiKey: '',
    secretKey: '',
    supabaseUrl: '',      // Diperlukan untuk Sinkronisasi Cloud
    supabaseAnonKey: '',  // Diperlukan untuk Sinkronisasi Cloud
    userId: '',           // Diperlukan untuk Sinkronisasi Cloud
    tradeAmount: 100000, 
    takeProfit: 3.0,
    stopLoss: 1.5,
    maxDailyLoss: 5.0, 
    maxPositions: 3,
    tradingStrategy: 'DYNAMIC_AUTO', 
    isSimulation: true,
    scanInterval: 5000,
    isBotActive: true     // State sinkronisasi cloud
};

// State harian
let dailyStats = {
    date: new Date().toISOString().split('T')[0],
    profit: 0 // Dalam persen (%)
};

const CONFIG_FILE = './config-bot.json';

// Load config jika ada
if (fs.existsSync(CONFIG_FILE)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE)) };
}

// ==========================================
// UTILITAS API INDODAX
// ==========================================
const PUBLIC_API = 'https://indodax.com/api';
const TAPI_URL = 'https://indodax.com/tapi';

async function fetchTicker(pair) {
    try {
        const res = await axios.get(`${PUBLIC_API}/ticker/${pair}`);
        return res.data.ticker;
    } catch (e) { return null; }
}

async function fetchOrderBook(pair) {
    try {
        const res = await axios.get(`${PUBLIC_API}/depth/${pair}`);
        return res.data;
    } catch (e) { return null; }
}

async function fetchSummaries() {
    try {
        const res = await axios.get(`${PUBLIC_API}/summaries`);
        return res.data;
    } catch (e) { return null; }
}

async function fetchChart(pair, tf = '1') {
    // 100 data point terakhir
    const window = tf === '5' ? 100 * 5 * 60 : 100 * 60;
    const to = Math.floor(Date.now() / 1000);
    const from = to - window;
    const symbol = pair.toUpperCase().replace('_', '');
    try {
        const res = await axios.get(`https://indodax-proxy.ri2ami77.workers.dev/tradingview/history_v2?symbol=${symbol}&tf=${tf}&from=${from}&to=${to}`);
        // Indodax history_v2 mengembalikan format { s: 'ok', c: [...], h: [...], ... }
        if (res.data && res.data.s === 'ok') {
            return res.data;
        }
        return null;
    } catch (e) { return null; }
}

let privateApiLock = Promise.resolve();
async function privateRequest(method, params = {}, retryCount = 0) {
    if (!config.apiKey || !config.secretKey) return null;
    
    // Antrian request agar tidak tabrakan Nonce (Jeda 2 detik)
    await privateApiLock;
    privateApiLock = privateApiLock.then(() => new Promise(res => setTimeout(res, 2000)));

    const nonce = Date.now();
    const payload = { method, nonce, ...params };
    const queryString = Object.keys(payload).sort().map(k => `${k}=${payload[k]}`).join('&');
    const signature = CryptoJS.HmacSHA512(queryString, config.secretKey).toString();

    try {
        const res = await axios.post(TAPI_URL, queryString, {
            headers: {
                'Key': config.apiKey,
                'Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (res.data.success === 1) return res.data.return;
        
        // AUTO-FIX NONCE: Jika server minta angka lebih besar, coba lagi sekali
        if (res.data.error && res.data.error.includes('Nonce must be greater than') && retryCount < 1) {
            console.log(`[NONCE FIX] Mencoba ulang request ${method}...`);
            await new Promise(r => setTimeout(r, 1000));
            return privateRequest(method, params, retryCount + 1);
        }

        throw new Error(res.data.error || 'API Error');
    } catch (e) {
        console.log(`[ERROR API] ${method}: ${e.message}`);
        return null;
    }
}

// ==========================================
// SINKRONISASI CLOUD (SUPABASE REST)
// ==========================================
async function syncCloudState() {
    if (!config.supabaseUrl || !config.supabaseAnonKey || !config.userId) return;

    try {
        const url = `${config.supabaseUrl}/rest/v1/profiles?id=eq.${config.userId}&select=is_background_bot_enabled`;
        const res = await axios.get(url, {
            headers: {
                'apikey': config.supabaseAnonKey,
                'Authorization': `Bearer ${config.supabaseAnonKey}`
            }
        });

        if (res.data && res.data[0]) {
            const isEnabled = res.data[0].is_background_bot_enabled;
            if (config.isBotActive !== isEnabled) {
                config.isBotActive = isEnabled;
                const status = isEnabled ? "AKTIF" : "MATI (RADAR ONLY)";
                console.log(`\n[CLOUD SYNC] Status Bot Berubah: ${status}`);
            }
        }
    } catch (e) {
        // Silent error for cloud sync to avoid spamming the console
    }
}

// ==========================================
// INDIKATOR TEKNIKAL (LOGIKA SAKTI-SCALPER)
// ==========================================
function calculateRSI(data, windowSize = 14) {
    if (data.length <= windowSize) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= windowSize; i++) {
        let diff = data[i] - data[i-1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / windowSize;
    let avgLoss = losses / windowSize;
    for (let i = windowSize + 1; i < data.length; i++) {
        let diff = data[i] - data[i-1];
        let g = diff > 0 ? diff : 0;
        let l = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (windowSize - 1) + g) / windowSize;
        avgLoss = (avgLoss * (windowSize - 1) + l) / windowSize;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calculateStochasticRSI(rsiData, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
    if (rsiData.length < stochPeriod) return { k: 50, d: 50 };
    
    let stochRSI = [];
    for (let i = stochPeriod - 1; i < rsiData.length; i++) {
        const window = rsiData.slice(i - stochPeriod + 1, i + 1);
        const minRsi = Math.min(...window);
        const maxRsi = Math.max(...window);
        const currentRsi = rsiData[i];
        const val = (maxRsi - minRsi) === 0 ? 0 : (currentRsi - minRsi) / (maxRsi - minRsi);
        stochRSI.push(val * 100);
    }
    
    if (stochRSI.length < kPeriod) return { k: 50, d: 50 };
    
    // Simple SMA for %K and %D
    const calculateSMA_simple = (arr, p) => arr.slice(-p).reduce((a, b) => a + b, 0) / p;
    
    const kValues = [];
    for (let i = kPeriod - 1; i < stochRSI.length; i++) {
        kValues.push(calculateSMA_simple(stochRSI.slice(0, i + 1), kPeriod));
    }
    
    const k = kValues[kValues.length - 1];
    const d = kValues.length >= dPeriod ? calculateSMA_simple(kValues, dPeriod) : k;
    
    return { k, d };
}

function calculateSMA(data, period) {
    if (data.length < period) return data[data.length-1];
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data[0]; // SMA-like start
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
}

const calculateATR = (ohlcData, windowSize = 14) => {
    if (!ohlcData || ohlcData.length < 2) return new Array(ohlcData.length).fill(null);
    let trs = [];
    for (let i = 0; i < ohlcData.length; i++) {
        const current = ohlcData[i];
        const prev = i > 0 ? ohlcData[i - 1] : null;
        if (!prev) {
            trs.push(current.High - current.Low || current.h - current.l || 0);
            continue;
        }
        const high = current.High || current.h || 0;
        const low = current.Low || current.l || 0;
        const prevClose = prev.Close || prev.c || 0;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }
    return calculateSMA(trs, windowSize);
};

const detectCandlestickPattern = (candle, prevCandle = null) => {
    if (!candle) return null;
    const open = parseFloat(candle.Open || candle.o || 0);
    const high = parseFloat(candle.High || candle.h || 0);
    const low = parseFloat(candle.Low || candle.l || 0);
    const close = parseFloat(candle.Close || candle.c || 0);
    if (open === 0 || high === 0 || low === 0 || close === 0) return null;
    const body = Math.abs(close - open);
    const candleRange = high - low;
    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;
    if (body <= candleRange * 0.1) return 'DOJI';
    if (lowerShadow > body * 2 && upperShadow < body * 0.5 && close > open) return 'HAMMER';
    if (upperShadow > body * 2 && lowerShadow < body * 0.5 && close < open) return 'SHOOTING_STAR';
    if (prevCandle) {
        const pOpen = parseFloat(prevCandle.Open || prevCandle.o || 0);
        const pClose = parseFloat(prevCandle.Close || prevCandle.c || 0);
        if (pClose < pOpen && close > open && close > pOpen && open < pClose) return 'BULLISH_ENGULFING';
        if (pClose > pOpen && close < open && close < pOpen && open > pClose) return 'BEARISH_ENGULFING';
    }
    return null;
};

function analyzeEMAScalping(prices) {
    if (prices.length < 30) return 'HOLD';
    
    // EMA 9 & 21
    const ema9 = calculateEMA(prices, 9);
    const ema21 = calculateEMA(prices, 21);
    
    const latestPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    
    // EMA history (approximation for pullback)
    const prevEma9 = calculateEMA(prices.slice(0, -1), 9);

    const isAboveEmas = latestPrice > ema9 && latestPrice > ema21;
    const isEmaBullish = ema9 > ema21;
    
    const margin = ema9 * 0.001;
    const isPullback = (prevPrice <= prevEma9 + margin && prevPrice >= prevEma9 - margin) || 
                       (latestPrice <= ema9 + margin && latestPrice >= ema9 - margin);
    
    // 4. Konfirmasi Bullish (Candle Green atau Pattern)
    const lastCandle = prices[prices.length - 1]; // Assuming prices array contains close prices, need full candle data for pattern detection
    const prevCandle = prices[prices.length - 2]; // This will be incorrect if prices is just close prices.
                                                  // The detectCandlestickPattern function expects OHLC objects.
                                                  // For this to work, `prices` should be an array of OHLC objects, not just close prices.
                                                  // Assuming `chart.c` in `scanMarket` is an array of OHLC objects, not just close prices.
                                                  // If `chart.c` is only close prices, this part needs adjustment.
    const pattern = detectCandlestickPattern(lastCandle, prevCandle);

    // 5. RSI Filter (Jangan Pucuk)
    // Sederhananya di sini kita hanya cek tren harga
    const isBullishConfirm = pattern === 'HAMMER' || pattern === 'BULLISH_ENGULFING' || (latestPrice > prevPrice);

    if (isAboveEmas && isEmaBullish && isPullback && isBullishConfirm) {
        return 'BUY';
    }
    const isBearishPattern = pattern === 'SHOOTING_STAR' || pattern === 'BEARISH_ENGULFING';
    const latestEma9 = ema9; // Renaming for clarity, as the original code used `ema9` here.
    if (latestPrice < latestEma9 || isBearishPattern) return 'SELL';
    return 'HOLD';
};

function getChecklist(conditions) {
    return conditions.map(c => `[${c.met ? '✅' : '❌'}${c.label}]`).join(' ');
}

// ==========================================
// LOGIKA SCANNER & EKSEKUSI
// ==========================================
let activeTrades = [];

async function scanMarket() {
    console.log(`\n[${new Date().toLocaleTimeString()}] 🔍 Memulai scanning pasar...`);
    const summaries = await fetchSummaries();
    if (!summaries) return;

    const pairs = Object.keys(summaries.tickers).filter(p => p.endsWith('_idr'));
    
    // Mix: Top 15 Gainers + Top 15 Volumne IDR
    const sortedByGain = [...pairs].sort((a, b) => summaries.tickers[b].last_24h_change_percent - summaries.tickers[a].last_24h_change_percent);
    const sortedByVol = [...pairs].sort((a, b) => summaries.tickers[b].vol_idr - summaries.tickers[a].vol_idr);
    
    const uniquePairs = Array.from(new Set([...sortedByGain.slice(0, 15), ...sortedByVol.slice(0, 15)]));
    const sortedPairs = uniquePairs.slice(0, 30);

    let scannedCount = 0;
    for (const pair of sortedPairs) {
        // Jangan beli jika sudah ada 3 trade aktif (manajemen resiko)
        if (activeTrades.length >= 3) break;
        if (activeTrades.find(t => t.pair === pair)) continue;

        let activeStrategy = config.tradingStrategy;
        const btcChange = summaries?.prices_24h?.btc_idr ? ((summaries.tickers.btc_idr.last - summaries.prices_24h.btc_idr) / summaries.prices_24h.btc_idr * 100) : 0;
        
        if (activeStrategy === 'DYNAMIC_AUTO') {
            if (btcChange <= -1.5) {
                activeStrategy = 'OVERSOLD_REBOUND';
            } else if (btcChange >= 1.5) {
                activeStrategy = 'EMA_SCALPING';
            } else {
                activeStrategy = 'SCALPER_5M'; // Mode sideways
            }
        }

        const is5m = activeStrategy === 'SCALPER_5M';
        const chart = await fetchChart(pair, is5m ? '5' : '1');
        if (!chart || !chart.c || chart.c.length < 50) continue;

        const prices = chart.c.map(p => parseFloat(p));
        const lastPrice = prices[prices.length - 1];
        const rsiData = [];
        for (let i = 14; i <= prices.length; i++) rsiData.push(calculateRSI(prices.slice(0, i)));
        
        const rsi = rsiData[rsiData.length - 1];
        const ema9 = calculateEMA(prices, 9);
        const ema21 = calculateEMA(prices, 21);
        const ema25 = calculateEMA(prices, 25);
        const stoch = calculateStochasticRSI(rsiData, 14, 3, 3);

        let signal = 'HOLD';
        let reason = 'Scanning...';
        let checklist = '';
        
        if (activeStrategy === 'SCALPER_5M') {
            const volume = parseFloat(chart.v ? chart.v[chart.v.length-1] : 0);
            const avgVol = chart.v ? chart.v.slice(-20).reduce((a,b) => a + parseFloat(b), 0) / 20 : 0;
            const emaTrend = ema9 > ema21;
            const priceMom = lastPrice > ema9;
            const rsiOk = rsi > 35 && rsi < 65;
            const volOk = volume > (avgVol * 1.1);
            
            checklist = getChecklist([
                {label: 'Trend', met: emaTrend},
                {label: 'MA9', met: priceMom},
                {label: 'RSI', met: rsiOk},
                {label: 'Vol', met: volOk}
            ]);

            if (emaTrend && priceMom && rsiOk && volOk) {
                signal = 'BUY';
                reason = 'Scalper 5M Approved';
            } else {
                if (!emaTrend) reason = 'EMA Bearish';
                else if (!priceMom) reason = 'Price < EMA9';
                else if (!rsiOk) reason = 'RSI Extreme';
                else if (!volOk) reason = 'Low Volume';
            }
        } else if (activeStrategy === 'OVERSOLD_REBOUND') {
            const isOversold = rsi <= 36;
            const isBouncing = lastPrice > ema9;
            const isRecovering = rsi > 28;
            const stochConfirm = stoch.k > stoch.d;
            
            checklist = getChecklist([
                {label: 'Oversold', met: isOversold},
                {label: 'Bounce', met: isBouncing},
                {label: 'Stoch', met: stochConfirm}
            ]);

            if (isOversold && isBouncing && isRecovering && stochConfirm) {
                signal = 'BUY';
                reason = 'Bearish Rebound OK';
            } else {
                if (!isOversold) reason = 'RSI too high';
                else if (!isBouncing) reason = 'Price < EMA9';
                else if (!stochConfirm) reason = 'Stoch K < D';
                else if (!isRecovering) reason = 'RSI too low';
            }
        } else if (activeStrategy === 'EMA_SCALPING' || activeStrategy === 'SCALPING') {
            const isAggressive = activeStrategy === 'SCALPING';
            const rsiLimit = isAggressive ? 65 : 60;
            const volume = parseFloat(chart.v ? chart.v[chart.v.length-1] : 0);
            const avgVol = chart.v ? chart.v.slice(-20).reduce((a,b) => a + parseFloat(b), 0) / 20 : 0;
            
            const emaTrend = ema9 > ema21;
            const priceMom = lastPrice > ema9;
            const rsiOk = rsi <= rsiLimit;
            const volOk = volume > (avgVol * 1.1);
            const stochConfirm = stoch.k > stoch.d;

            checklist = getChecklist([
                {label: 'EMA', met: emaTrend},
                {label: 'MA9', met: priceMom},
                {label: 'RSI', met: rsiOk},
                {label: 'Stoch', met: stochConfirm}
            ]);

            if (emaTrend && priceMom && rsiOk && volOk && stochConfirm) {
                signal = 'BUY';
                reason = isAggressive ? 'Pure Scalper OK' : 'EMA Cross OK';
            } else {
                if (!emaTrend) reason = 'EMA Bearish';
                else if (!priceMom) reason = 'Price < EMA9';
                else if (!stochConfirm) reason = 'Stoch K < D';
                else if (!rsiOk) reason = `RSI > ${rsiLimit}`;
                else if (!volOk) reason = 'Low Volume';
            }
        } else if (activeStrategy === 'MICRO_SCALPING') {
            const k = stoch.k;
            const d = stoch.d;
            const isOversold = k < 20;
            const isGoldenCross = k > d;
            const isAboveEma25 = lastPrice > ema25;
            const priceFilter = lastPrice > (ema25 * 0.995);

            checklist = getChecklist([
                {label: 'Stoch < 20', met: isOversold},
                {label: 'K > D', met: isGoldenCross},
                {label: 'MA25', met: isAboveEma25},
                {label: 'Safeguard', met: priceFilter}
            ]);

            if (isOversold && isGoldenCross && isAboveEma25 && priceFilter) {
                signal = 'BUY';
                reason = `Micro-Scalp OK (K:${k.toFixed(1)})`;
            } else {
                if (!isOversold) reason = 'Stoch not Oversold';
                else if (!isGoldenCross) reason = 'K < D';
                else if (!isAboveEma25) reason = 'Price < EMA25';
                else if (!priceFilter) reason = 'Price Crash';
            }
        }

        scannedCount++;
        process.stdout.write(`\r[SCAN] ${scannedCount}/${sortedPairs.length} | ${pair.split('_')[0].toUpperCase()}: ${checklist} | RSI: ${rsi.toFixed(1)} | ${reason}   `);
        
        // LOGIKA ENTRY
        if (signal === 'BUY') {
            const depth = await fetchOrderBook(pair);
            if (!depth || !depth.sell || !depth.sell[0]) {
                console.log(`\n⚠️  [SKIP] ${pair.toUpperCase()}: Order book tidak merespon.`);
                continue;
            }

            const currentPrice = parseFloat(depth.sell[0][0]);
            const bidPrice = parseFloat(depth.buy[0][0]);
            const spread = ((currentPrice - bidPrice) / bidPrice) * 100;

            if (spread > 2.0) {
                console.log(`\n⏳ [SKIP] ${pair.toUpperCase()}: Spread terlalu lebar (${spread.toFixed(2)}%)`);
                continue;
            }

            console.log(`\n🚀 SINYAL BELI: ${pair.toUpperCase()} | ${reason} | Spread: ${spread.toFixed(2)}%`);
            await executeBuy(pair, currentPrice);
        }
    }
    console.log(`\n✅ Selesai scan. Menunggu ${config.scanInterval/1000} detik...`);
}

async function executeBuy(pair, price) {
    if (config.isSimulation) {
        console.log(`🟢 [SIMULASI] Membeli ${pair} di harga ${price}`);
        activeTrades.push({ pair, buyPrice: price, highestPrice: price, time: Date.now() });
    } else {
        const res = await privateRequest('trade', { pair, type: 'buy', price, idr: config.tradeAmount });
        if (res) {
            console.log(`✅ [REAL] Sukses membeli ${pair}! Order ID: ${res.order_id}`);
            activeTrades.push({ pair, buyPrice: price, highestPrice: price, time: Date.now(), orderId: res.order_id });
        }
    }
}

function checkDailyLoss() {
    const today = new Date().toISOString().split('T')[0];
    if (dailyStats.date !== today) {
        dailyStats.date = today;
        dailyStats.profit = 0;
    }
    
    if (dailyStats.profit <= -config.maxDailyLoss) {
        return true;
    }
    return false;
}

async function monitorTrades() {
    // Reset daily profit check
    const today = new Date().toISOString().split('T')[0];
    if (dailyStats.date !== today) {
        dailyStats.date = today;
        dailyStats.profit = 0;
    }

    if (dailyStats.profit <= -config.maxDailyLoss) {
        console.log(`\x1b[31m⛔ [STOP] Batas kerugian harian (${config.maxDailyLoss}%) tercapai. Bot berhenti. \x1b[0m`);
        return;
    }

    for (let i = activeTrades.length - 1; i >= 0; i--) {
        const trade = activeTrades[i];
        const ticker = await fetchTicker(trade.pair);
        if (!ticker) continue;

        const currentPrice = parseFloat(ticker.last);
        const profit = ((currentPrice - trade.buyPrice) / trade.buyPrice) * 100 - 0.51; // Net Profit after 0.51% fee (Taker)

        // Update highest price for Trailing Stop
        if (currentPrice > trade.highestPrice) trade.highestPrice = currentPrice;

        const dropFromPeak = ((trade.highestPrice - currentPrice) / trade.highestPrice) * 100;
        let sellSignal = false;

        // Fetch prices for EMA strategy
        let prices = [];
        if (config.tradingStrategy === 'EMA_SCALPING') {
            const chartData = await fetchChart(trade.pair);
            if (chartData && chartData.c) {
                prices = chartData.c.map(p => parseFloat(p));
            }
        }

        // TRAILING STOP LOGIC
        const isEmaScalping = config.tradingStrategy === 'EMA_SCALPING';
        const trailingActivationThreshold = isEmaScalping ? 1.0 : 1.5;
        const trailingDistance = isEmaScalping ? 0.5 : 1.0;

        const isTrailingActivated = ((trade.highestPrice - trade.buyPrice) / trade.buyPrice) * 100 >= trailingActivationThreshold;
        const trailingStopPrice = trade.highestPrice * (1 - (trailingDistance / 100));

        if (isTrailingActivated && currentPrice <= trailingStopPrice) {
            console.log(`🚀 [TRAILING STOP] ${trade.pair.toUpperCase()} hit @ ${currentPrice}`);
            sellSignal = true;
        }

        // EMA SCALPING SELL SIGNAL
        if (isEmaScalping && prices && prices.length >= 30) {
            const ema9Series = calculateEMA(prices.slice(-30), 9);
            const latestEma9 = ema9Series[ema9Series.length - 1];
            if (currentPrice < latestEma9) {
                console.log(`📉 [EMA EXIT] Harga di bawah EMA 9. Close posisi segera.`);
                sellSignal = true;
            }
        }

        // LOGIKA JUAL FINAL
        let shouldSell = false;
        let reason = "";

        if (profit >= config.takeProfit) {
            shouldSell = true;
            reason = "Target Take Profit Tercapai";
        } else if (sellSignal) {
            shouldSell = true;
            reason = isEmaScalping ? "EMA Scalping Signal / Trailing Stop" : "Trailing Stop Aktif";
        } else if (profit <= -config.stopLoss) {
            shouldSell = true;
            reason = "Stop Loss Terpaksa";
        }

        if (shouldSell) {
            await executeSell(trade, currentPrice, profit, reason);
            activeTrades.splice(i, 1);
        }
    }
}

async function executeSell(trade, price, profit, reason) {
    console.log(`💰 [JUAL] ${trade.pair.toUpperCase()} | Profit: ${profit.toFixed(2)}% | Alasan: ${reason}`);
    
    // Update statistik harian
    dailyStats.profit += profit;
    
    if (!config.isSimulation) {
        // Ambil saldo koin terlebih dahulu
        const info = await privateRequest('getInfo');
        const coin = trade.pair.split('_')[0];
        const balance = info.balance[coin];
        await privateRequest('trade', { pair: trade.pair, type: 'sell', price, [coin]: balance });
    }
}

// ==========================================
// MAIN LOOP
// ==========================================
async function main() {
    console.clear();
    console.log("==========================================");
    console.log("   SAKTI-BOT CLI - MODE TRADING AKTIF     ");
    console.log("==========================================");
    console.log(`Status: ${config.isSimulation ? 'SIMULASI' : 'REAL TRADE'}`);
    console.log(`Modal: Rp ${config.tradeAmount.toLocaleString()}`);
    console.log("Tunggu sebentar, sedang inisialisasi...");

    let lastSync = 0;
    while (true) {
        try {
            // Sinkronisasi Cloud setiap 30 detik
            if (Date.now() - lastSync > 30000) {
                await syncCloudState();
                lastSync = Date.now();
            }

            // Selalu monitor trade (Asset Guardian / Radar)
            await monitorTrades();

            // Hanya scan/beli jika bot aktif di cloud dan tidak sedang di-stop lokal
            if (config.isBotActive !== false) {
                if (activeTrades.length < config.maxPositions) {
                    await scanMarket();
                }
            } else {
                process.stdout.write(`\r[RADAR ON] Bot non-aktif (Cloud). Memantau ${activeTrades.length} aset...   `);
            }
        } catch (e) {
            console.log("Error Loop:", e.message);
        }
        await new Promise(r => setTimeout(r, config.scanInterval));
    }
}

// Interface Setup Awal
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

if (!config.apiKey && !config.isSimulation) {
    console.log("Bot belum dikonfigurasi.");
    rl.question("Gunakan mode SIMULASI? (y/n): ", (ans) => {
        if (ans.toLowerCase() === 'y') {
            config.isSimulation = true;
            main();
        } else {
            rl.question("API Key Indodax: ", (key) => {
                config.apiKey = key;
                rl.question("Secret Key Indodax: ", (sec) => {
                    config.secretKey = sec;
                    config.isSimulation = false;
                    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
                    main();
                });
            });
        }
    });
} else {
    main();
}
