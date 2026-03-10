import { useState, useEffect, useRef } from 'react';
import { useIndodaxAuth } from './useIndodaxAuth';
import { fetchTicker, getUserInfo, tradeOrder, cancelOrder, fetchSummaries, fetchOrderBook } from '../utils/indodaxApi';
import { analyzeTechnicalIndicators } from '../utils/technicalIndicators';
import { useCoinList } from './useCoinList';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { addGlobalSignal } from './useMarketIntelligence';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';

// Environment-aware API base URLs
const isDev = import.meta.env.DEV;

export const useAutoScanner = (onCoinChange) => {
    // 1. External Hooks
    const { apiKey, secretKey, geminiKey, hasKeys } = useIndodaxAuth();
    const { allCoins } = useCoinList();
    const { user } = useAuth();
    const cloudSettings = useSettings(user);

    // 2. Refs
    const loopRef = useRef(null);
    const top20CoinsRef = useRef([]);
    const scanIndexRef = useRef(0);
    const activeTradesRef = useRef([]);
    const tradeAmountRef = useRef(50000);
    const isSimulationRef = useRef(true);
    const takeProfitPercentRef = useRef(2.5);
    const stopLossPercentRef = useRef(4.5);
    const isInitialSweepRef = useRef(false);
    const sweepIndexRef = useRef(0);

    // 3. States
    const [isScanning, setIsScanning] = useState(false);
    const [indodaxPairs, setIndodaxPairs] = useState(new Set());
    const [logs, setLogs] = useState([]);
    const [balance, setBalance] = useState({ idr: 0, coin: 0, assets: [] });
    const [tradeAmount, setTradeAmount] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerTradeAmount');
            return saved ? parseInt(saved) : (cloudSettings?.tradeAmount || 50000);
        } catch (e) {
            return 50000;
        }
    });
    const [takeProfitPercent, setTakeProfitPercent] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerTakeProfit');
            return saved ? parseFloat(saved) : (cloudSettings?.takeProfit || 2.5);
        } catch (e) {
            return 2.5;
        }
    });
    const [stopLossPercent, setStopLossPercent] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerStopLoss');
            return saved ? parseFloat(saved) : (cloudSettings?.stopLoss || 4.5);
        } catch (e) {
            return 4.5;
        }
    });
    const [isSimulation, setIsSimulation] = useState(true);
    const [simulatedBalance, setSimulatedBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerSimulatedBalance');
            return saved ? parseFloat(saved) : 10000000;
        } catch (e) {
            return 10000000;
        }
    });
    const [activeTrades, setActiveTrades] = useState([]);
    const [tradeHistory, setTradeHistory] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerTradeHistory');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });
    const [currentScanCoinDisplay, setCurrentScanCoinDisplay] = useState('...Waiting');
    const [scannerStatus, setScannerStatus] = useState({ message: 'Ready to start scanning', level: 'chill' }); // 'chill', 'interest', 'action'

    // 4. Sync Effects
    useEffect(() => {
        if (cloudSettings.isLoaded) {
            if (tradeAmount !== cloudSettings.tradeAmount) setTradeAmount(cloudSettings.tradeAmount);
            // TP and SL are local-only for now due to database column limitations
        }
    }, [cloudSettings.isLoaded, cloudSettings.tradeAmount]);

    useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);
    useEffect(() => { localStorage.setItem('scannerTradeHistory', JSON.stringify(tradeHistory)); }, [tradeHistory]);
    useEffect(() => { tradeAmountRef.current = tradeAmount; }, [tradeAmount]);
    useEffect(() => {
        localStorage.setItem('scannerTradeAmount', tradeAmount.toString());
        localStorage.setItem('scannerTakeProfit', takeProfitPercent.toString());
        localStorage.setItem('scannerStopLoss', stopLossPercent.toString());

        if (user && cloudSettings.isLoaded) {
            cloudSettings.saveSettings({
                ...cloudSettings,
                tradeAmount: tradeAmount
                // takeProfit and stopLoss sync disabled to avoid 400 error
            });
        }
    }, [tradeAmount, takeProfitPercent, stopLossPercent, user]);
    useEffect(() => {
        isSimulationRef.current = isSimulation;
    }, [isSimulation, user]);
    useEffect(() => { takeProfitPercentRef.current = takeProfitPercent; }, [takeProfitPercent]);
    useEffect(() => { stopLossPercentRef.current = stopLossPercent; }, [stopLossPercent]);
    useEffect(() => {
        localStorage.setItem('scannerSimulatedBalance', simulatedBalance.toString());
        // Temporarily disabled cloud sync for simulated_balance to avoid 400 error
        /*
        if (user) {
            supabase.from('profiles').update({ simulated_balance: simulatedBalance }).eq('id', user.id).then(null, () => {});
        }
        */
    }, [simulatedBalance, user]);

    // Initial fetch of Indodax markets
    useEffect(() => {
        const initIndodax = async () => {
            try {
                // Fetch active trades from Cloud if logged in
                if (user) {
                    const [{ data: cloudTrades }, { data: profile }, { data: cloudHistory }] = await Promise.all([
                        supabase.from('active_trades').select('*').eq('user_id', user.id).eq('is_simulation', isSimulation),
                        supabase.from('profiles').select('is_background_bot_enabled, last_is_simulation').eq('id', user.id).maybeSingle(),
                        supabase.from('trade_history').select('*').eq('user_id', user.id).eq('is_simulation', isSimulation).order('created_at', { ascending: false }).limit(20)
                    ]);

                    if (profile && profile.last_is_simulation !== undefined) {
                        setIsSimulation(profile.last_is_simulation);
                    }

                    if (cloudHistory && cloudHistory.length > 0) {
                        // Merge local history with cloud history to prevent duplicates and keep the newest 20
                        setTradeHistory(prev => {
                            const cloudMapped = cloudHistory.map(h => ({
                                id: h.id,
                                coin: h.coin,
                                type: h.trade_type,
                                buyPrice: parseFloat(h.buy_price),
                                sellPrice: parseFloat(h.sell_price),
                                profit: parseFloat(h.profit_percent).toFixed(2),
                                time: new Date(h.created_at).toLocaleTimeString()
                            }));

                            // Simple merge: prefer cloud, add locals that aren't in cloud (based on time proximity or keep it simple by just using cloud if available)
                            return cloudMapped;
                        });
                    }

                    if (cloudTrades && cloudTrades.length > 0) {
                        const mappedTrades = cloudTrades.map(t => ({
                            coin: t.coin_id,
                            buyPrice: parseFloat(t.buy_price),
                            amount: parseFloat(t.quantity),
                            targetTP: parseFloat(t.target_tp),
                            targetSL: parseFloat(t.target_sl),
                            currentPrice: parseFloat(t.buy_price),
                            highestPrice: parseFloat(t.highest_price || t.buy_price),
                            isSimulation: t.is_simulation,
                            id: t.id
                        }));
                        setActiveTrades(mappedTrades);
                        // FIXED: Only auto-resume if the background bot is actually ENABLED in profile
                        if (profile?.is_background_bot_enabled) {
                            setIsScanning(true);
                        }
                    } else if (profile?.is_background_bot_enabled) {
                        setIsScanning(true);
                    }
                }

                const summaries = await fetchSummaries();
                if (summaries?.tickers) {
                    setIndodaxPairs(new Set(Object.keys(summaries.tickers)));
                }
            } catch (err) {
                console.error("Initial Indodax/Cloud fetch failed:", err);
            }
        };
        initIndodax();
    }, [user, isSimulation]);

    const getPair = (coinId) => {
        const coinObj = top20CoinsRef.current.find(c => c.id === coinId) || allCoins.find(c => c.id === coinId);
        const symbol = (coinObj?.symbol || coinId).toLowerCase();

        // Check IDR pair first
        const idrPair = `${symbol}_idr`;
        return idrPair;

        // Check USDT pair second
        const usdtPair = `${symbol}_usdt`;
        if (indodaxPairs.has(usdtPair)) return usdtPair;

        // Pengecualian manual (Legacy)
        const overrides = {
            'polygon-ecosystem-token': 'pol_idr',
            'avalanche-2': 'avax_idr',
            'shiba-inu': 'shib_idr',
            'indodax-token': 'idt_idr'
        };
        if (overrides[coinId]) return overrides[coinId];

        // Default fallback (though we should avoid using this if not in indodaxPairs)
        return `${symbol}_idr`;
    };

    const addLog = (message, type = 'info') => {
        // Menggunakan Date.now() digabung dengan Math.random() agar ID unik 100% dan React tidak komplain duplikasi Key
        const newLog = { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, time: new Date().toLocaleTimeString(), message, type };
        setLogs(prev => [...prev.slice(-99), newLog]); // Simpan 100 log, terbaru di bawah
    };

    const speak = (text) => {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    // Fungsi Fetch Saldo Riil dari Indodax
    const fetchBalance = async () => {
        if (!hasKeys) return;
        try {
            const info = await getUserInfo(apiKey, secretKey);
            if (info && info.balance) {
                // Ambil semua aset yang saldo > 0
                const assets = [];
                Object.keys(info.balance).forEach(key => {
                    const val = parseFloat(info.balance[key] || 0);
                    const hold = parseFloat(info.balance_hold?.[key] || 0);
                    const total = val + hold;
                    if (total > 0 && key !== 'idr') {
                        assets.push({
                            symbol: key.toUpperCase(),
                            balance: val,
                            hold: hold,
                            total: total
                        });
                    }
                });

                // Fetch semua harga untuk estimasi total aset (Real Account)
                let totalIdrValue = parseFloat(info.balance.idr || 0);
                try {
                    const summaries = await fetchSummaries();
                    if (summaries && summaries.tickers) {
                        assets.forEach(asset => {
                            const pair = `${asset.symbol.toLowerCase()}_idr`;
                            const ticker = summaries.tickers[pair];
                            if (ticker && ticker.last) {
                                asset.currentPrice = parseFloat(ticker.last);
                                totalIdrValue += (asset.total * asset.currentPrice);
                            }
                        });
                    }
                } catch (tickerErr) {
                    console.warn("Gagal fetch summaries untuk estimasi aset:", tickerErr);
                }

                setBalance({
                    idr: parseFloat(info.balance.idr || 0),
                    totalBalanceReal: totalIdrValue, // Total nilai seluruh aset dalam IDR
                    coin: 0,
                    assets: assets
                });
            }
        } catch (err) {
            console.error("Gagal fetch saldo Indodax:", err);
        }
    };

    // Auto-update saldo saat pertama kali atau saat status trade berubah
    useEffect(() => {
        fetchBalance();

        // Jika akun riil, update saldo setiap 30 detik untuk sinkronisasi total aset
        let interval;
        if (hasKeys && !isSimulation) {
            interval = setInterval(fetchBalance, 30000);
        }
        return () => clearInterval(interval);
    }, [hasKeys, activeTrades, isSimulation]);

    // Fungsi Lapis 2: Bertanya ke Gemini sebagai Konfirmasi Final (Deep Analysis)
    const askGeminiConfirmation = async (coinId, priceData) => {
        const gKey = geminiKey || import.meta.env.VITE_GEMINI_API_KEY;
        if (!gKey) return false;

        // Silent cooldown check: avoiding 503 spam in console
        if (window._lastGemini503 && Date.now() - window._lastGemini503 < 60000) {
            return false; // Skip without erroring
        }

        const genAI = new GoogleGenerativeAI(gKey);
        const indicatorData = analyzeTechnicalIndicators(priceData, true);
        const latestPrice = priceData[priceData.length - 1];

        const prompt = `
        Koin: ${coinId.toUpperCase()}. 
        Harga Terakhir: Rp ${latestPrice.toLocaleString('id-ID')}.
        Data Harga (14 kline): ${priceData.slice(-14).join(', ')}.
        
        Analisis Sistem:
        - RSI(14): ${indicatorData.rsi ? indicatorData.rsi.toFixed(2) : 'N/A'}
        - Trend: EMA12 (${indicatorData.ema12 ? indicatorData.ema12.toFixed(2) : 'N/A'}) vs EMA26 (${indicatorData.ema26 ? indicatorData.ema26.toFixed(2) : 'N/A'})
        
        Tugas: Analisis potensi 'Scalping' agresif. Fokus pada peluang kenaikan jangka pendek (menit). Jika ada indikasi rebound atau momentum positif sedikitpun, berikan lampu hijau.
        PENTING: Jawab diawali dengan satu kata 'BELI' atau 'ABAIKAN', lalu berikan alasan singkat maksimal 10 kata.
        Contoh: 'BELI. Ada momentum kecil, cocok untuk scalping.'
        `;

        const tryModel = async (modelName, isFallback = false) => {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const responseText = (await result.response.text()).trim();
                console.log(`[GEMINI ${isFallback ? 'FALLBACK' : 'PRIMARY'} RESPONSE] ${coinId}:`, responseText);

                const isApproved = responseText.toUpperCase().startsWith('BELI');
                if (!isApproved) {
                    console.warn(`[GEMINI REJECTION] ${coinId} ditolak oleh ${modelName}: ${responseText}`);
                }
                return isApproved;
            } catch (error) {
                const errorMsg = error.message || "";

                // Jika error adalah 503 (High Demand), 404, atau generic fetch error pada model utama, coba fallback
                if (!isFallback && (errorMsg.includes('503') || errorMsg.includes('404') || errorMsg.includes('high demand') || errorMsg.includes('fetch'))) {
                    console.warn(`[GEMINI PRIMARY FAIL] ${modelName} sibuk/gagal. Mencoba Fallback ke 2.0 Flash...`);
                    if (errorMsg.includes('503')) window._lastGemini503 = Date.now();
                    return await tryModel("gemini-2.0-flash", true);
                }

                if (errorMsg.includes('429') || errorMsg.includes('quota')) {
                    addLog(`⚠️ [GEMINI QUOTA] Limit AI tercapai! Mohon tunggu reset kuota harian.`, 'error');
                } else if (isFallback) {
                    console.error("Gemini Fallback Error:", error);
                }
                return false;
            }
        };

        return await tryModel("gemini-3.1-flash-lite-preview");
    };

    // Eksekusi Beli dan Siapkan Order Jual (Scalping)
    const executeScalpTrade = async (coin, price) => {
        const currentTradeAmount = tradeAmountRef.current;
        const currentIsSimulation = isSimulationRef.current;
        const currentTP = takeProfitPercentRef.current;
        const currentSL = stopLossPercentRef.current;

        addLog(`⚡ [SCALPER] Memulai eksekusi beli ${coin} di harga Rp ${price.toLocaleString('id-ID')}...`, 'info');

        let buyPrice = price;
        let amountCoinBought = currentIsSimulation ? (currentTradeAmount / price) : 0;

        // EKSEKUSI PEMBELIAN
        if (!currentIsSimulation) {
            try {
                const pair = getPair(coin);
                const ticker = await fetchTicker(pair);
                if (!ticker) {
                    addLog(`🔴 REAL TRADE GAGAL: Pair ${pair} tidak tersedia di pasar IDR Indodax.`, 'error');
                    return;
                }
                const actualPrice = parseFloat(ticker.last);
                buyPrice = actualPrice;

                // Instant Buy: Pasang harga 0.2% lebih tinggi agar langsung match (Instant Execution)
                const instantPrice = Math.ceil(actualPrice * 1.002);
                const order = await tradeOrder(apiKey, secretKey, pair, 'buy', instantPrice, currentTradeAmount);
                addLog(`🟢 REAL TRADE: Beli ${coin} Sukses (INSTANT)! Order ID: ${order.order_id}`, 'buy');

                // Deteksi jumlah koin yang dibeli (Taker fee Indodax ~0.51%)
                if (order.receive) {
                    amountCoinBought = parseFloat(order.receive);
                } else {
                    // Fallback: Hitung estimasi jika API tidak mengembalikan 'receive' seketika
                    // (Lebih baik ada estimasi daripada 0 yang bikin radar tidak muncul)
                    amountCoinBought = (currentTradeAmount / actualPrice) * 0.994;

                    // Coba sinkronisasi ulang dengan saldo rill (optional check)
                    const info = await getUserInfo(apiKey, secretKey).catch(() => null);
                    if (info) {
                        const coinToken = pair.split('_')[0];
                        const realBalance = parseFloat(info.balance[coinToken] || 0);
                        if (realBalance > 0) amountCoinBought = realBalance;
                    }
                }
            } catch (err) {
                addLog(`🔴 REAL TRADE GAGAL Beli: ${err.message}`, 'error');
                return; // Keluar jika beli gagal
            }
        } else {
            // Simulasi: Kita juga ambil harga Indodax agar P/L Radar tidak melonjak (USD vs IDR)
            // Simulasi: Pastikan koin ada di Indodax sebelum memulai simulasi
            try {
                const pair = getPair(coin);
                const ticker = await fetchTicker(pair);
                if (!ticker || !ticker.last) {
                    addLog(`🟠 SIMULASI BATAL: Koin ${coin.toUpperCase()} tidak terdaftar di pasar IDR Indodax.`, 'error');
                    return;
                }
                buyPrice = parseFloat(ticker.last);
            } catch (e) {
                addLog(`🟠 SIMULASI BATAL: Gagal verifikasi harga Indodax untuk ${coin.toUpperCase()}.`, 'error');
                return;
            }

            addLog(`🟢 SIMULASI: [BELI] ${coin} sejumlah Rp ${currentTradeAmount.toLocaleString('id-ID')} pada harga Rp ${buyPrice.toLocaleString('id-ID')}`, 'buy');
            setSimulatedBalance(prev => prev - currentTradeAmount);
            amountCoinBought = currentTradeAmount / buyPrice;
        }

        // PERSIAPAN TAKE PROFIT & STOP LOSS (Pending Order Maker)
        if (amountCoinBought > 0) {
            const targetTP = buyPrice + (buyPrice * (currentTP / 100));
            const targetSL = buyPrice - (buyPrice * (currentSL / 100));

            addLog(`🎯 Target Scalping: TP @Rp ${targetTP.toLocaleString('id-ID')} (+${currentTP}%), SL @Rp ${targetSL.toLocaleString('id-ID')} (-${currentSL}%)`, 'success');

            if (!currentIsSimulation) {
                try {
                    const pair = getPair(coin);
                    // Pasang Hard Stop Loss (Stop-Limit) di Indodax sebagai pengaman "Offline"
                    const slPrice = Math.floor(buyPrice * (1 - (currentSL + 0.5) / 100)); // Limit 0.5% di bawah stop
                    const stopPrice = Math.floor(targetSL);

                    const slOrder = await tradeOrder(apiKey, secretKey, pair, 'sell', slPrice, amountCoinBought, {
                        order_type: 'stoplimit',
                        stop_price: stopPrice
                    });

                    addLog(`🛡️ SAFETY: Hard Stop Loss terpasang di Indodax! Trigger: Rp ${stopPrice.toLocaleString()}`, 'success');

                    // Simpan ID order SL agar bisa dibatalkan jika TP tercapai
                    setActiveTrade(prev => ({ ...prev, hardStopOrderId: slOrder.order_id }));
                } catch (err) {
                    addLog(`🔴 SAFETY WARNING: Gagal pasang Hard Stop Loss: ${err.message}`, 'error');
                }
            } else {
                addLog(`✅ SIMULASI: Hard Stop Loss dipasang virtual.`, 'info');
            }

            // Tambahkan ke daftar trades aktif (max 4)
            const initialHighestPrice = typeof buyPrice === 'number' ? buyPrice : parseFloat(buyPrice);
            const newTrade = {
                coin,
                buyPrice: initialHighestPrice,
                amount: amountCoinBought,
                targetTP, // Keep for initial ref/UI
                targetSL,
                highestPrice: initialHighestPrice,
                currentPrice: initialHighestPrice,
                isSimulation: currentIsSimulation,
                id: `${coin}-${Date.now()}` // Temporary ID, will be replaced by DB ID
            };

            // PERSIST TO CLOUD for Backend Safeguard (Now supports Simulation!)
            if (user) {
                try {
                    const { data: dbTrade } = await supabase
                        .from('active_trades')
                        .upsert({
                            user_id: user.id,
                            coin_id: coin,
                            buy_price: initialHighestPrice,
                            target_tp: targetTP,
                            target_sl: targetSL,
                            highest_price: initialHighestPrice,
                            quantity: amountCoinBought,
                            is_simulation: currentIsSimulation,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id,coin_id' })
                        .select()
                        .maybeSingle();

                    if (dbTrade) {
                        newTrade.id = dbTrade.id; // Switch to cloud UUID
                    }
                } catch (dbErr) {
                    console.error("Gagal sinkron trade ke Cloud:", dbErr);
                }
            }

            setActiveTrades(prev => [...prev.slice(-(3)), newTrade]); // max 4
            addLog(`⏳ Trade aktif: ${coin.toUpperCase()} (${activeTradesRef.current.length + 1} posisi terbuka). Scanner tetap berjalan...`, 'info');
            setScannerStatus({ message: `Monitoring ${coin.toUpperCase()} + scanning...`, level: 'action' });
        }
    };

    // Fungsi Utama: Scanner Loop
    const scanNextCoin = async () => {
        if (!isScanning) {
            setScannerStatus({ message: 'Bot Idle. Select a mode to start.', level: 'chill' });
            return;
        }

        const currentActiveTrades = activeTradesRef.current;

        // MONITOR semua posisi aktif secara paralel
        if (currentActiveTrades.length > 0) {
            setScannerStatus({ message: `Monitoring ${currentActiveTrades.length} Trade(s)...`, level: 'action' });

            await Promise.all(currentActiveTrades.map(async (trade) => {
                const { coin, buyPrice, targetSL, amount, id, highestPrice } = trade;

                try {
                    const pair = getPair(coin);
                    const ticker = await fetchTicker(pair).catch(() => null);
                    if (!ticker || !ticker.last) {
                        setActiveTrades(prev => prev.filter(t => t.id !== id));
                        return;
                    }
                    const currentPrice = parseFloat(ticker.last);

                    // Trailing Stop Logic Updates
                    let newHighestPrice = highestPrice || buyPrice;
                    let shouldUpdateCloudPrice = false;

                    if (currentPrice > newHighestPrice) {
                        // Koin Terbang! Ikuti harganya ke atas
                        newHighestPrice = currentPrice;
                        shouldUpdateCloudPrice = true;
                    }

                    // Dynamic Stop Loss (Trailing distance). Misal: 3% (menggunakan toleransi dari config jika ada)
                    const trailingDistancePercent = stopLossPercentRef.current; // Menggunakan setting jarak SL dr UI
                    const dynamicSL = newHighestPrice * (1 - (trailingDistancePercent / 100));

                    // Update state memori lokal (harga terkini & highest price)
                    setActiveTrades(prev => prev.map(t => t.id === id ? { ...t, currentPrice, highestPrice: newHighestPrice } : t));

                    // Sync rekor harga tertinggi ke Cloud secara berkala jika naik signifikan (menghemat load)
                    if (shouldUpdateCloudPrice && user) {
                        // Mengurangi beban debounce: Hanya simpan jika beda harganya lumayan 
                        if (newHighestPrice > (highestPrice * 1.005)) {
                            supabase.from('active_trades').update({ highest_price: newHighestPrice }).eq('id', id).then(null, () => { });
                        }
                    }

                    // EKSEKUSI JUAL: Jika harga jatuh melewati trailing SL ATAU terjun bebas di bawah Hard SL (buyPrice * SL%)
                    const isTrailingHit = currentPrice <= dynamicSL && newHighestPrice > (buyPrice * 1.01); // Hit if trailing drop AND we are in profit zone
                    const isHardSlHit = currentPrice <= targetSL; // Terjun bebas sejak beli (rugi absolut)

                    if (isTrailingHit || isHardSlHit) {
                        const rawProfit = ((currentPrice - buyPrice) / buyPrice * 100);
                        const netProfit = (rawProfit - 0.5).toFixed(2); // Estimasi potong fee + pajak (roundtrip)
                        const profitPercent = netProfit;
                        const isSim = trade.isSimulation;

                        if (isSim) {
                            // Update simulated balance: return principal + profit/loss
                            const profitValue = amount * currentPrice;
                            setSimulatedBalance(prev => prev + profitValue);
                        }

                        const actionType = parseFloat(netProfit) >= 0 ? '[Trailing TP]' : '[Hard SL]';
                        const logCat = parseFloat(netProfit) >= 0 ? 'success' : 'error';
                        const speakText = parseFloat(netProfit) >= 0 ? `Take profit ${coin.toUpperCase()}` : `Stop loss ${coin.toUpperCase()}`;

                        addLog(`🚀 ${actionType} ${coin.toUpperCase()} ${profitPercent}% @ Rp ${currentPrice.toLocaleString('id-ID')}`, logCat);
                        speak(speakText);

                        // Persist to Cloud for learning & history syncing
                        if (user) {
                            supabase.from('bot_logs').insert({
                                user_id: user.id,
                                message: `[${isSim ? 'VIRTUAL' : 'REAL'} ${actionType.replace('[', '').replace(']', '')}] ${coin.toUpperCase()} ditutup @Rp ${currentPrice.toLocaleString()}. P/L: ${profitPercent}%`,
                                type: parseFloat(netProfit) >= 0 ? 'profit' : 'loss'
                            }).then(null, () => { });

                            supabase.from('trade_history').insert({
                                user_id: user.id,
                                coin: coin.toUpperCase(),
                                trade_type: parseFloat(netProfit) >= 0 ? 'PROFIT' : 'LOSS',
                                buy_price: buyPrice,
                                sell_price: currentPrice,
                                profit_percent: parseFloat(profitPercent),
                                is_simulation: isSim
                            }).then(null, () => { });

                            supabase.from('active_trades').delete().eq('id', id).then(null, () => { });
                        }

                        setTradeHistory(prev => [{ id: Date.now(), coin: coin.toUpperCase(), type: parseFloat(netProfit) >= 0 ? 'PROFIT' : 'LOSS', buyPrice, sellPrice: currentPrice, profit: profitPercent, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
                        if (!isSim) { try { await tradeOrder(apiKey, secretKey, pair, 'sell', Math.floor(currentPrice * 0.998), amount); } catch (sErr) { addLog(`🔴 Gagal Jual Sinyal: ${sErr.message}`, 'error'); } }

                        setActiveTrades(prev => prev.filter(t => t.id !== id));
                    }

                } catch (err) {
                    console.error(`Gagal monitor ${coin}:`, err);
                }
            }));
        }

        // Tetap scan koin baru jika slot masih tersedia (< 4)
        if (currentActiveTrades.length >= 4) {
            return; // Slot penuh, tunggu ada yang tutup
        }

        // Logic Scan normal...
        setScannerStatus({ message: 'Scanning for opportunities... You can take a rest.', level: 'chill' });

        // --- Logika SCANNER: MENENTUKAN KOIN YANG AKAN DI-SCAN ---
        let targetCoin = '';
        let targetSymbol = '';
        let isPortfolioAsset = false;

        // Ambil daftar aset yang saat ini dimiliki (kecuali IDR dan saldo debu)
        const heldAssets = balance.assets?.filter(a => a.balance > 0.00001 && a.symbol.toLowerCase() !== 'idr') || [];

        // MODE 1: INITIAL SWEEP (Prioritas saat startup - scan semua aset satu per satu)
        if (isInitialSweepRef.current && heldAssets.length > 0) {
            const asset = heldAssets[sweepIndexRef.current];
            if (asset && asset.symbol) {
                targetSymbol = asset.symbol;
                const coinInfo = allCoins.find(c => c?.symbol && c.symbol.toLowerCase() === targetSymbol.toLowerCase());
                targetCoin = coinInfo ? coinInfo.id : targetSymbol;
                isPortfolioAsset = true;

                addLog(`🌐 [INITIAL SWEEP] Memeriksa koin portofolio: ${targetSymbol.toUpperCase()} (${sweepIndexRef.current + 1}/${heldAssets.length})`, 'info');

                sweepIndexRef.current += 1;
                if (sweepIndexRef.current >= heldAssets.length) {
                    isInitialSweepRef.current = false; // Selesai sweep
                    addLog(`✅ [SWEEP SELESAI] Semua aset portofolio telah diperiksa. Kembali ke mode scan reguler.`, 'success');
                }
            }
        }

        // MODE 2: SMART SCAN REGULER (Setiap 3 iterasi cek portfolio koin secara acak/urut)
        if (!targetCoin && heldAssets.length > 0 && scanIndexRef.current % 3 === 0) {
            const assetIndex = Math.floor((scanIndexRef.current / 3) % heldAssets.length);
            const asset = heldAssets[assetIndex];

            if (asset && asset.symbol) {
                targetSymbol = asset.symbol;
                // Mapping symbol ke ID koin dengan pencegahan undefined
                const coinInfo = allCoins.find(c => c?.symbol && c.symbol.toLowerCase() === targetSymbol.toLowerCase());
                targetCoin = coinInfo ? coinInfo.id : targetSymbol;
                isPortfolioAsset = true;
            }
        }

        // --- VALIDASI: CEK APAKAH PAIR ADA DI INDODAX (ANTI GHOST-TRADE) ---
        if (targetCoin && !isPortfolioAsset) {
            const pair = getPair(targetCoin);
            const isListed = indodaxPairs.has(pair);

            if (!isListed) {
                // Jangan spam log, cukup skip di background
                console.warn(`[SCANNER] Skip ${targetSymbol}: Koin tidak ditemukan di Indodax (${pair}).`);
                scanIndexRef.current += 1;
                return;
            }

            try {
                const ticker = await fetchTicker(pair);
                if (!ticker || !ticker.last) {
                    console.warn(`[SCANNER] Skip ${targetSymbol}: Ticker kosong untuk ${pair}.`);
                    scanIndexRef.current += 1;
                    return;
                }
            } catch (e) {
                scanIndexRef.current += 1;
                return;
            }
        }

        // MODE 3: TOP VOLATILITY SCAN (Default)
        if (!targetCoin) {
            if (top20CoinsRef.current.length === 0) {
                if (allCoins.length > 0) {
                    // Ambil koin dengan pergerakan tercepat (Volatilitas tertinggi +/-)
                    const sortedByVolatility = [...allCoins].sort((a, b) =>
                        Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0)
                    );
                    top20CoinsRef.current = sortedByVolatility.slice(0, 25);
                    addLog(`🎯 [SCANNER] Fokus pada 25 koin dengan pergerakan tercepat hari ini.`, 'info');
                } else {
                    return; // Tunggu data coinList siap
                }
            }
            const coinList = top20CoinsRef.current;
            const targetCoinObj = coinList[scanIndexRef.current % coinList.length];
            targetCoin = targetCoinObj.id;
            targetSymbol = targetCoinObj.symbol;
        }

        // Jalankan callback jika koin berubah (untuk sinkronisasi chart global)
        if (targetCoin && onCoinChange) {
            onCoinChange(targetCoin);
        }

        setCurrentScanCoinDisplay(isPortfolioAsset ? `📌 Aset: ${targetSymbol.toUpperCase()}` : `🔍 Scan: ${targetSymbol.toUpperCase()}`);
        setScannerStatus({ message: `Scanning ${targetSymbol.toUpperCase()}...`, level: 'info' });


        try {
            let prices = [];
            const pair = getPair(targetCoin);
            const formattedPair = pair.toUpperCase().replace('_', ''); // e.g. BTCIDR

            // Step 1: Fetch Minute data from Indodax TradingView API (1m TF for Scalping)
            try {
                const to = Math.floor(Date.now() / 1000);
                const from = to - (2 * 60 * 60); // Increase to 2 hours back for more data points

                const historyRes = await fetch(`https://indodax.com/tradingview/history_v2?symbol=${formattedPair}&tf=1&from=${from}&to=${to}`);
                if (historyRes.ok) {
                    const historyData = await historyRes.json();
                    if (Array.isArray(historyData) && historyData.length > 5) {
                        prices = historyData.map(d => typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close);
                    } else if (historyData.s === 'no_data') {
                        // console.log(`[INDODAX] No 1m data for ${targetSymbol}, skipping TA.`);
                    }
                }
            } catch (err) {
                // Silently fail history
            }

            // Fallback: If history TA is not available, at least get current price for monitoring/display
            if (prices.length === 0) {
                try {
                    const ticker = await fetchTicker(pair);
                    if (ticker && ticker.last) {
                        const currentPrice = parseFloat(ticker.last);
                        setCurrentScanCoinDisplay(`📌 Monitoring: ${targetSymbol.toUpperCase()} @Rp ${currentPrice.toLocaleString('id-ID')}`);
                        setScannerStatus({ message: `Monitoring ${targetSymbol.toUpperCase()} (Price Only).`, level: 'info' });

                        // Continue to next coin without TA
                        scanIndexRef.current = scanIndexRef.current + 1;
                        return;
                    }
                } catch (tErr) {
                    // console.warn("Fallback ticker failed:", tErr.message);
                }
            }

            if (prices.length > 0) {
                // Lapis 1: Analisa Teknikal (RSI / EMA)
                const signal = analyzeTechnicalIndicators(prices);

                // Hitung Momentum Score (Perubahan dalam 5 menit terakhir vs 60 menit)
                const latestPrice = prices[prices.length - 1];
                const fiveMinAgo = prices[prices.length - 6];
                const hourAgo = prices[0];
                const momentumScore = fiveMinAgo ? ((latestPrice - fiveMinAgo) / fiveMinAgo * 100).toFixed(2) : 0;
                const hourlyChange = hourAgo ? ((latestPrice - hourAgo) / hourAgo * 100).toFixed(2) : 0;

                // JIKA SINYAL JUAL (Untuk koin yang sudah dimiliki)
                if (isPortfolioAsset && (signal === 'POTENTIAL_SELL' || signal === 'STRONG_SELL')) {
                    addLog(`⚖️ [PORTFOLIO] Sinyal Jual terdeteksi untuk ${targetSymbol.toUpperCase()} (Kondisi Overbought).`, 'info');
                    setScannerStatus({ message: `Sell signal for ${targetSymbol.toUpperCase()} (Overbought).`, level: 'warning' });

                    if (!isSimulationRef.current) {
                        try {
                            addLog(`🔴 REAL TRADE: Eksekusi Jual Otomatis untuk mengamankan profit ${targetSymbol.toUpperCase()}...`, 'sell');
                            const ticker = await fetchTicker(getPair(targetCoin));
                            const assetData = heldAssets.find(a => a?.symbol && a.symbol.toLowerCase() === (targetSymbol || '').toLowerCase());
                            await tradeOrder(apiKey, secretKey, getPair(targetCoin), 'sell', parseFloat(ticker.last), assetData.total);
                            addLog(`✅ REAL TRADE: Jual ${targetSymbol.toUpperCase()} Sukses!`, 'success');
                            setScannerStatus({ message: `Sold ${targetSymbol.toUpperCase()}!`, level: 'success' });
                        } catch (err) {
                            addLog(`❌ Gagal Jual Portfolio: ${err.message}`, 'error');
                            setScannerStatus({ message: `Failed to sell ${targetSymbol.toUpperCase()}.`, level: 'error' });
                        }
                    } else {
                        addLog(`🟢 SIMULASI: Aset ${targetSymbol.toUpperCase()} layak jual (Target tercapai/Overbought).`, 'success');
                        setScannerStatus({ message: `Simulated sell for ${targetSymbol.toUpperCase()}.`, level: 'success' });
                    }
                }

                if ((signal === 'STRONG_BUY' || signal === 'POTENTIAL_BUY') && !isPortfolioAsset) {
                    // --- KRITERIA PRO-TRADER: FILTER LIKUIDITAS & SPREAD ---
                    const coinData = allCoins.find(c => c.id === targetCoin);
                    const volumeIDR = coinData?.volumeIdr24h || 0;

                    // 1. Filter Volume (Minimal 1 Miliar IDR agar aman dari koin "mati")
                    if (volumeIDR < 1000000000) {
                        addLog(`🚫 [FILTER] ${targetSymbol.toUpperCase()} diabaikan. Volume terlalu rendah (Rp ${volumeIDR.toLocaleString()}).`, 'info');
                        return;
                    }

                    // 2. Filter Spread (Cek selisih harga beli-jual di Order Book)
                    try {
                        const depth = await fetchOrderBook(getPair(targetCoin));
                        if (depth && depth.buy && depth.sell && depth.buy.length > 0 && depth.sell.length > 0) {
                            const bestBid = parseFloat(depth.buy[0][0]);
                            const bestAsk = parseFloat(depth.sell[0][0]);
                            const spreadPercent = ((bestAsk - bestBid) / bestBid * 100);

                            if (spreadPercent > 0.8) {
                                addLog(`🚫 [FILTER] ${targetSymbol.toUpperCase()} diabaikan. Spread terlalu lebar (${spreadPercent.toFixed(2)}%). Berisiko "rugi di ongkos".`, 'info');
                                return;
                            }
                        }
                    } catch (spreadErr) {
                        console.warn("Gagal cek spread:", spreadErr);
                    }

                    const currentIdrBalance = isSimulationRef.current ? simulatedBalance : balance.idr;

                    if (currentIdrBalance < tradeAmountRef.current) {
                        addLog(`⚠️ [SALDO KURANG] Gagal eksekusi ${targetSymbol.toUpperCase()}. Saldo: Rp ${currentIdrBalance.toLocaleString('id-ID')} | Butuh: Rp ${tradeAmountRef.current.toLocaleString('id-ID')}`, 'error');
                        setScannerStatus({ message: `Insufficient balance for ${targetSymbol.toUpperCase()}.`, level: 'error' });
                        return;
                    }

                    if (signal === 'STRONG_BUY') {
                        addLog(`🔥 [AKURASI TINGGI] Sinyal Teknis SANGAT KUAT (RSI+MACD+BB)! Melewati konfirmasi AI untuk hemat API.`, 'success');
                        setScannerStatus({ message: `Strong BUY signal for ${targetCoin.toUpperCase()}!`, level: 'success' });
                        speak(`Peluang ditemukan pada koin ${targetSymbol.toUpperCase()}. Memulai eksekusi.`);
                        const currentPrice = prices[prices.length - 1];

                        // Emit global signal for Market Intelligence
                        addGlobalSignal({
                            coin: targetCoin,
                            symbol: targetSymbol,
                            type: 'STRONG_BUY',
                            price: currentPrice,
                            strength: 'High (Technical Triple Confirmation)',
                            potentialProfit: takeProfitPercentRef.current,
                            momentum: momentumScore,
                            hourlyChange: hourlyChange
                        });

                        await executeScalpTrade(targetCoin, currentPrice);
                    } else if (signal === 'POTENTIAL_BUY') {
                        addLog(`🔍 [Lapis 1] ${targetCoin.toUpperCase()} menunjukkan sinyal oversold. Mengirim ke Gemini untuk 'Deep Analysis'...`, 'info');

                        // Lapis 2: Konfirmasi Gemini
                        setScannerStatus({ message: `Analyzing ${targetCoin.toUpperCase()}... Stay tuned!`, level: 'interest' });
                        const isApproved = await askGeminiConfirmation(targetCoin, prices);

                        if (isApproved) {
                            addLog(`🤖 [Lapis 2] GEMINI MENYETUJUI: Sinyal dikonfirmasi AI!`, 'success');
                            setScannerStatus({ message: `Gemini approved BUY for ${targetCoin.toUpperCase()}!`, level: 'success' });
                            speak(`Peluang ditemukan pada koin ${targetSymbol.toUpperCase()}. Memulai eksekusi.`);
                            const currentPrice = prices[prices.length - 1];

                            // Emit global signal for Market Intelligence
                            addGlobalSignal({
                                coin: targetCoin,
                                symbol: targetSymbol,
                                type: 'GEMINI_BUY',
                                price: currentPrice,
                                strength: 'Medium (AI Confirmed)',
                                potentialProfit: takeProfitPercentRef.current,
                                momentum: momentumScore,
                                hourlyChange: hourlyChange
                            });

                            await executeScalpTrade(targetCoin, currentPrice);
                        } else {
                            addLog(`🤖 [Lapis 2] Gemini MENOLAK sinyal ${targetCoin.toUpperCase()}. Dianggap berisiko.`, 'error');
                            setScannerStatus({ message: `Gemini rejected ${targetCoin.toUpperCase()}.`, level: 'warning' });
                        }
                    }
                }
            } else if (isPortfolioAsset) {
                // FALLBACK: Untuk aset di dompet yang tidak punya data histori (misal IDT)
                // Kita tetap pantau harga terkininya saja
                try {
                    const ticker = await fetchTicker(getPair(targetCoin));
                    if (ticker) {
                        setCurrentScanCoinDisplay(`📌 Monitoring: ${targetSymbol.toUpperCase()} @Rp ${parseFloat(ticker.last).toLocaleString('id-ID')}`);
                        setScannerStatus({ message: `Monitoring ${targetSymbol.toUpperCase()} (Portfolio).`, level: 'info' });
                    }
                } catch (e) {
                    // Ignore fail
                }
            } else {
                console.warn("Gagal fetch data harga scanner untuk koin", targetCoin);
            }

        } catch (error) {
            console.error("Scanner Loop Error:", error);
        }

        // Lanjut ke koin berikutnya
        scanIndexRef.current = scanIndexRef.current + 1;
    };

    // Effect Scanner Loop
    useEffect(() => {
        let isAlive = true;

        const scanLockRef = { current: false };

        const runScanner = async () => {
            if (!isScanning || !isAlive || scanLockRef.current) return;

            scanLockRef.current = true;
            try {
                await scanNextCoin();
            } finally {
                scanLockRef.current = false;
            }

            // Jadwalkan scan berikutnya hanya SETELAH yang sekarang benar-benar selesai.
            if (isScanning && isAlive) {
                loopRef.current = setTimeout(runScanner, 7000);
            }
        };

        if (isScanning) {
            addLog(`🚀 [SCANNER MULAI] Mode SMART RESUME aktif. Sinkronisasi saldo...`, 'success');
            fetchBalance(); // Immediate balance sync
            scanIndexRef.current = 0;
            sweepIndexRef.current = 0;
            isInitialSweepRef.current = true; // Trigger initial sweep
            runScanner(); // Mulai loop pertama
        } else {
            if (loopRef.current) {
                clearTimeout(loopRef.current);
                loopRef.current = null;
                if (logs.length > 0) addLog('⏹️ Scanner dihentikan.', 'info');
            }
        }

        return () => {
            isAlive = false;
            if (loopRef.current) clearTimeout(loopRef.current);

            // Cleanup Hard Stop Loss orders for all active trades if scanner is stopped manually
            if (!isSimulationRef.current) {
                activeTradesRef.current.forEach(t => {
                    if (t.hardStopOrderId) {
                        const pair = getPair(t.coin);
                        cancelOrder(apiKey, secretKey, pair, t.hardStopOrderId, 'sell')
                            .then(() => console.log(`Scanner Cleanup: Hard SL Canceled for ${t.coin}`))
                            .catch(err => console.warn(`Scanner Cleanup: Hard SL Cancel failed for ${t.coin}`, err.message));
                    }
                });
            }
        };
    }, [isScanning]);
    // HAPUS currentScanIndex & allCoins dari array agar interval tidak kereset terus menerus!!!

    // TODO: Untuk mode 'single', logika auto trader lama masih bisa dipakai atau digabung di sini.
    const toggleScanner = () => setIsScanning(!isScanning);
    const clearLogs = () => setLogs([]);
    const clearHistory = () => setTradeHistory([]);

    // Kalkulasi Total Estimasi (IDR + Nilai Koin Aktif)
    const currentIdr = isSimulation ? simulatedBalance : balance.idr;
    let totalValue = currentIdr;

    if (isSimulation) {
        // Mode Simulasi: Hanya koin aktif bot
        activeTrades.forEach(t => {
            const assetPrice = t.currentPrice || t.buyPrice;
            totalValue += (t.amount * assetPrice);
        });
    } else {
        // Mode Real: Gunakan totalBalanceReal yang sudah dihitung di fetchBalance
        totalValue = balance.totalBalanceReal || currentIdr;
    }

    const totalBalance = totalValue;

    // Buat daftar aset virtual untuk simulasi agar UI tidak terlihat kosong
    const simulatedAssets = activeTrades.map(t => ({
        symbol: t.coin.split('-')[0].toUpperCase(),
        balance: t.amount,
        hold: 0,
        total: t.amount,
        currentPrice: t.currentPrice || t.buyPrice
    }));

    const forceSell = async (tradeId) => {
        const trade = activeTrades.find(t => t.id === tradeId);
        if (!trade) return;

        const isSim = trade.isSimulation;
        const coin = trade.coin;
        const pair = getPair(coin);

        try {
            addLog(`⚠️ [FORCE SELL] Memproses penghentian manual untuk ${coin.toUpperCase()}...`, 'warning');

            let currentPrice = trade.currentPrice;
            if (!isSim) {
                const ticker = await fetchTicker(pair).catch(() => null);
                if (ticker) currentPrice = parseFloat(ticker.last);

                // Exec Real Sell if possible
                const info = await getUserInfo(apiKey, secretKey).catch(() => null);
                const coinBalanceCount = info?.balance[coin.split('-')[0].toLowerCase()] || 0;

                if (coinBalanceCount > 0) {
                    await tradeOrder(apiKey, secretKey, pair, 'sell', currentPrice, coinBalanceCount);
                    addLog(`🔴 [FORCE SELL] Real Trade: Sah terjual @Rp ${currentPrice.toLocaleString()}`, 'sell');
                }
            }

            const rawProfit = ((currentPrice - trade.buyPrice) / trade.buyPrice * 100);
            const profitPercent = (rawProfit - 0.5).toFixed(2);

            if (isSim) {
                const profitValue = trade.amount * currentPrice;
                setSimulatedBalance(prev => prev + profitValue);
            }

            // Log activities
            if (user) {
                // Detailed insert with error logging
                const logData = {
                    user_id: user.id,
                    message: `[FORCE SELL] ${coin.toUpperCase()} ditutup manual @Rp ${currentPrice.toLocaleString()}. P/L: ${profitPercent}%`,
                    type: parseFloat(profitPercent) >= 0 ? 'profit' : 'loss'
                };

                supabase.from('bot_logs').insert(logData)
                    .then(({ error }) => {
                        if (error) console.error("Supabase bot_logs error:", error);
                    });

                supabase.from('trade_history').insert({
                    user_id: user.id,
                    coin: coin.toUpperCase(),
                    trade_type: parseFloat(profitPercent) >= 0 ? 'PROFIT' : 'LOSS',
                    buy_price: trade.buyPrice,
                    sell_price: currentPrice,
                    profit_percent: parseFloat(profitPercent),
                    is_simulation: isSim
                }).then(({ error }) => {
                    if (error) console.error("Supabase trade_history error:", error);
                });

                supabase.from('active_trades').delete().eq('id', tradeId).then();
            }

            // Update Local State
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            addLog(`✅ [FORCE SELL] ${coin.toUpperCase()} berhasil dibersihkan dari Radar.`, 'success');

        } catch (error) {
            console.error("Force Sell Error:", error);
            addLog(`❌ Gagal Force Sell ${coin}: ${error.message}`, 'error');
        }
    };

    return {
        isRunning: isScanning,
        toggleBot: toggleScanner,
        forceSell,
        logs,
        clearLogs,
        balance: isSimulation ? { idr: simulatedBalance, coin: 0, assets: simulatedAssets } : balance,
        totalBalance, // Ekspos total estimasi
        tradeAmount,
        setTradeAmount,
        takeProfitPercent,
        setTakeProfitPercent,
        stopLossPercent,
        setStopLossPercent,
        isSimulation,
        setIsSimulation,
        activeTrades,
        tradeHistory,
        clearHistory,
        currentScanCoin: currentScanCoinDisplay,
        scannerStatus
    };
};
