import { useState, useEffect, useRef } from 'react';
import { useIndodaxAuth } from './useIndodaxAuth';
import { fetchTicker, getUserInfo, tradeOrder, cancelOrder, fetchSummaries, fetchOrderBook, fetchOpenOrders, fetchBitcoin24hChange } from '../utils/indodaxApi';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { analyzeTechnicalIndicators } from '../utils/technicalIndicators';
import { analyzeOrderBook, findMarketWalls } from '../utils/orderBookAnalysis';
import { checkBuyOrderIntelligence, checkSellOrderIntelligence } from '../utils/orderIntelligence';
import { useCoinList } from './useCoinList';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';

export const useAutoTrader = (coinId, currentSignal, initialIsSimulation) => {
    // 1. External Hooks
    const { apiKey, secretKey, geminiKey, hasKeys } = useIndodaxAuth();
    const { allCoins } = useCoinList();
    const { user } = useAuth();
    const cloudSettings = useSettings(user);

    // 2. Refs (Top level for stability)
    const loopRef = useRef(null);
    const lastSignalRef = useRef(null);
    const buyPriceRef = useRef(null);
    const tradeAmountRef = useRef(50000);
    const hardStopOrderIdRef = useRef(null);
    const isSimulationRef = useRef(true);
    const lastBalanceFetchRef = useRef(0);
    const lastOrderCheckRef = useRef(0);

    // [UPGRADE] BITCOIN GUARD
    const lastBtcCheckRef = useRef(0);
    const btcCooldownTimestampRef = useRef(0);
    const BTC_COOLDOWN_MS = 2 * 60 * 60 * 1000;

    // 3. States
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const [isCloudLoaded, setIsCloudLoaded] = useState(false);
    const [balance, setBalance] = useState({ idr: 0, coin: 0, assets: [] });
    const [tradeAmount, setTradeAmount] = useState(() => {
        try {
            const saved = localStorage.getItem('traderTradeAmount');
            return saved ? parseInt(saved) : (cloudSettings?.tradeAmount || 50000);
        } catch (e) {
            return 50000;
        }
    });
    const [isSimulation, setIsSimulation] = useState(initialIsSimulation ?? true);

    useEffect(() => {
        if (initialIsSimulation !== undefined && initialIsSimulation !== isSimulation) {
            setIsSimulation(initialIsSimulation);
        }
    }, [initialIsSimulation]);
    const [simulatedBalance, setSimulatedBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('traderSimulatedBalance');
            return saved ? parseFloat(saved) : 10000000;
        } catch (e) {
            return 10000000;
        }
    });
    const [activeTrade, setActiveTrade] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);

    // 4. Synchronization Effects
    useEffect(() => {
        if (cloudSettings.isLoaded && tradeAmount !== cloudSettings.tradeAmount) {
            setTradeAmount(cloudSettings.tradeAmount);
        }
    }, [cloudSettings.isLoaded, cloudSettings.tradeAmount]);

    useEffect(() => { tradeAmountRef.current = tradeAmount; }, [tradeAmount]);
    useEffect(() => {
        localStorage.setItem('traderTradeAmount', tradeAmount.toString());
        if (user && cloudSettings.isLoaded) {
            cloudSettings.saveSettings({
                ...cloudSettings,
                tradeAmount: tradeAmount
            });
        }
    }, [tradeAmount, user]);
    useEffect(() => {
        isSimulationRef.current = isSimulation;
    }, [isSimulation, user]);

    useEffect(() => {
        localStorage.setItem('traderSimulatedBalance', simulatedBalance.toString());
        // Temporarily disabled cloud sync for simulated_balance to avoid 400 error
        /*
        if (user) {
            supabase.from('profiles').update({ simulated_balance: simulatedBalance }).eq('id', user.id).then(null, () => {});
        }
        */
    }, [simulatedBalance, user]);

    const isInitialMountRef = useRef(false);

    // Removal of dangerous clear
    // useEffect(() => { setTradeHistory([]); }, [isSimulation]);

    useEffect(() => {
        if (isInitialMountRef.current) return;
        isInitialMountRef.current = true;
        const historyKey = isSimulation ? 'singleTradeHistory_sim' : 'singleTradeHistory_live';
        localStorage.setItem(historyKey, JSON.stringify(tradeHistory));
    }, [tradeHistory, isSimulation]);

    // Initial fetch of cloud trades
    useEffect(() => {
        const initCloud = async () => {
            if (user) {
                setIsCloudLoaded(false);
                try {
                    console.log("SaktiBot: Menginisialisasi data cloud (Single)...");
                    const [{ data: cloudTrades }, { data: cloudHistory }] = await Promise.all([
                        supabase.from('active_trades').select('*').eq('user_id', user.id).eq('coin_id', coinId).eq('is_simulation', isSimulation),
                        supabase.from('trade_history').select('*').eq('user_id', user.id).eq('coin', coinId).eq('is_simulation', isSimulation).order('created_at', { ascending: false }).limit(20)
                    ]);

                    console.log(`SaktiBot: Penarikan data Cloud selesai (Single). Ditemukan ${cloudTrades?.length || 0} trade dalam mode ${isSimulation ? 'SIMULASI' : 'RIIL'}.`);

                    // Mode initialization is handled in App.jsx and passed via props

                    // Load history for current mode
                    const historyKey = isSimulation ? 'singleTradeHistory_sim' : 'singleTradeHistory_live';
                    const savedHistory = localStorage.getItem(historyKey);

                    if (cloudHistory && cloudHistory.length > 0) {
                        setTradeHistory(prev => {
                            const cloudMapped = cloudHistory.map(h => ({
                                id: h.id,
                                coin: h.coin,
                                type: (h.trade_type || 'PROFIT').toUpperCase(),
                                buyPrice: parseFloat(h.buy_price) || 0,
                                sellPrice: parseFloat(h.sell_price) || 0,
                                profit: (parseFloat(h.profit_percent) || 0).toFixed(2),
                                time: new Date(h.created_at).toLocaleTimeString()
                            }));
                            return cloudMapped;
                        });
                    } else if (savedHistory) {
                        try {
                            setTradeHistory(JSON.parse(savedHistory));
                        } catch (e) {
                            setTradeHistory([]);
                        }
                    } else {
                        setTradeHistory([]);
                    }

                    if (cloudTrades && cloudTrades.length > 0) {
                        const t = cloudTrades[0];
                        setActiveTrade({
                            coin: t.coin_id,
                            buyPrice: parseFloat(t.buy_price),
                            amount: parseFloat(t.quantity),
                            targetTP: parseFloat(t.target_tp),
                            targetSL: parseFloat(t.target_sl),
                            currentPrice: parseFloat(t.buy_price),
                            highestPrice: parseFloat(t.highest_price || t.buy_price),
                            isSimulation: t.is_simulation,
                            id: t.id
                        });
                        buyPriceRef.current = parseFloat(t.buy_price);
                        setIsRunning(true);
                    } else {
                        setActiveTrade(null);
                        setIsRunning(false);
                    }
                } catch (err) {
                    console.error("Initial Cloud pull (Single) failed:", err);
                } finally {
                    setIsCloudLoaded(true);
                }
            } else {
                setActiveTrade(null);
                setIsRunning(false);
            }
        };
        initCloud();
    }, [user?.id, coinId, isSimulation]);

    // REALTIME MONITOR: Sync activeTrade directly from Supabase events
    // This ensures Radar is always a "Monitor from Backend" as requested.
    useEffect(() => {
        if (!user || !coinId) return;

        const channel = supabase
            .channel('trader_active_trade_realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'active_trades', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    const { eventType, new: newRow, old: oldRow } = payload;

                    const coinMatch = (newRow && newRow.coin_id === coinId) || (oldRow && oldRow.coin_id === coinId);
                    const simMatch = (newRow && newRow.is_simulation === isSimulation) || (oldRow && oldRow.is_simulation === isSimulation);

                    if (!coinMatch || !simMatch) return;

                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        setActiveTrade({
                            id: newRow.id,
                            coin: newRow.coin_id,
                            buyPrice: parseFloat(newRow.buy_price),
                            amount: parseFloat(newRow.quantity),
                            targetTP: parseFloat(newRow.target_tp),
                            targetSL: parseFloat(newRow.target_sl),
                            highestPrice: parseFloat(newRow.highest_price),
                            currentPrice: parseFloat(newRow.highest_price),
                            isSimulation: newRow.is_simulation
                        });
                        setIsRunning(true);
                    } else if (eventType === 'DELETE') {
                        setActiveTrade(prev => (prev && prev.id === oldRow.id) ? null : prev);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, coinId, isSimulation]);

    // Format pair untuk Indodax (misal bitcoin -> btc_idr)
    const getPair = (coinId) => {
        // Cari simbol dari list koin jika tersedia (dinamis)
        const coinObj = allCoins.find(c => c.id === coinId);
        if (coinObj && coinObj.symbol) {
            const overrides = { 'polygon-ecosystem-token': 'pol_idr', 'avalanche-2': 'avax_idr', 'shiba-inu': 'shib_idr' };
            if (overrides[coinId]) return overrides[coinId];
            return `${coinObj.symbol.toLowerCase()}_idr`;
        }

        const symbolMap = {
            bitcoin: 'btc_idr', ethereum: 'eth_idr', tether: 'usdt_idr',
            binancecoin: 'bnb_idr', solana: 'sol_idr', ripple: 'xrp_idr',
            cardano: 'ada_idr', dogecoin: 'doge_idr', polkadot: 'dot_idr',
            polygon: 'matic_idr', 'avalanche-2': 'avax_idr', tron: 'trx_idr',
            chainlink: 'link_idr', 'shiba-inu': 'shib_idr'
        };
        return symbolMap[coinId] || `${coinId}_idr`; // Fallback jika tidak ada di map
    };

    const addLog = (message, type = 'info') => {
        const newLog = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            time: new Date().toLocaleTimeString(),
            message,
            type // 'info', 'success', 'error', 'buy', 'sell'
        };
        setLogs(prev => [...prev.slice(-49), newLog]); // Simpan 50 log terakhir, terbaru di bawah
    };

    const addToHistory = (coin, type, buyPrice, sellPrice) => {
        const rawProfit = ((sellPrice - buyPrice) / buyPrice) * 100;
        const netProfit = rawProfit - 0.5; // Estimasi biaya Maker/Taker + Pajak (0.5%)
        const profit = netProfit.toFixed(2);

        const newHistory = {
            id: Date.now(),
            coin: coin.toUpperCase(),
            time: new Date().toLocaleTimeString(),
            type: netProfit >= 0 ? 'PROFIT' : 'LOSS',
            profit: profit,
            buyPrice,
            sellPrice
        };
        setTradeHistory(prev => [newHistory, ...prev].slice(0, 20));

        // Update Simulated Balance
        if (isSimulation) {
            const profitValue = tradeAmount * (netProfit / 100);
            setSimulatedBalance(prev => prev + profitValue);
        }

        // Persist to Supabase trade_history
        if (user) {
            supabase.from('trade_history').insert({
                user_id: user.id,
                coin: coin.toUpperCase(),
                trade_type: netProfit >= 0 ? 'PROFIT' : 'LOSS',
                buy_price: buyPrice,
                sell_price: sellPrice,
                profit_percent: parseFloat(profit),
                is_simulation: isSimulation
            }).then(null, () => { });
        }
    };

    // [UPGRADE] Audit Logging: Simpan alasan kenapa bot batal beli koin tertentu
    const logRejection = async (reason, type = 'rejection') => {
        if (!user) return;
        const mode = isSimulationRef.current ? 'VIRTUAL' : 'REAL';
        supabase.from('bot_logs').insert({
            user_id: user.id,
            message: `[${mode} ABORTED] ${coinId.toUpperCase()}: ${reason}`,
            type: type
        }).then(({ error }) => {
            if (error) console.error("Supabase logRejection error:", error);
        });
    };

    // [UPGRADE] AI Pattern Recognition: Tanya Gemini sebagai konfirmasi final
    const askGeminiConfirmation = async (coinId, priceData) => {
        const gKey = geminiKey || import.meta.env.VITE_GEMINI_API_KEY;
        if (!gKey) return { approved: true, reason: 'No API Key' }; // Bypass if no key

        const tryModel = async (modelName, isFallback = false) => {
            try {
                const genAI = new GoogleGenerativeAI(gKey);
                // We need technical indicators for context
                const indicatorData = analyzeTechnicalIndicators(priceData, true);
                const latestPrice = priceData[priceData.length - 1];
                
                // AI PATTERN RECOGNITION: Ambil 20 data harga terakhir
                const priceSequence = priceData.slice(-20).map(p => Math.round(p)).join(', ');

                const prompt = `
                ANALISIS PROFESIONAL: ${coinId.toUpperCase()}.
                Harga Terkini: Rp ${latestPrice.toLocaleString('id-ID')}.
                Sequence (20m): [${priceSequence}].
                Trend (1m): EMA12 (${indicatorData.ema12?.toFixed(2)}) vs EMA26 (${indicatorData.ema26?.toFixed(2)}).
                RSI(14): ${indicatorData.rsi?.toFixed(2)}.
                Volatilitas (BB): Harga @${latestPrice} vs LowerBound (${indicatorData.lowerBB?.toFixed(2)}).

                Tugas: Analisis High-Probability Scalping. 
                SYARAT BELI: 
                1. Ada pola pembalikan (reversal) seperti Double Bottom atau Rejection ekor panjang di sequence harga.
                2. RSI tidak boleh Overbought (>65).
                3. Momentum MACD harus positif atau mulai memotong ke atas.
                
                Sikap: KONSERVATIF. Jawab 'BELI' jika 90% yakin naik >1% dlm 15 menit. Jika ragu, 'ABAIKAN'.
                Format: 'BELI/ABAIKAN. [Alasan singkat max 10 kata]'.
                `;

                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const responseText = (await result.response.text()).trim();
                
                const isApproved = responseText.toUpperCase().includes('BELI');
                return { approved: isApproved, reason: responseText };
            } catch (error) {
                const errorMsg = error.message || "";
                if (!isFallback && (errorMsg.includes('503') || errorMsg.includes('404'))) {
                    return await tryModel("gemini-2.0-flash", true);
                }
                return { approved: false, reason: `AI Error: ${errorMsg}` };
            }
        };

        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve({ approved: false, reason: 'AI Timeout' }), 6500);
        });

        return await Promise.race([
            tryModel("gemini-3.1-flash-lite-preview"),
            timeoutPromise
        ]);
    };

    // Update saldo (hanya info, tidak butuh signature unless it's real API)
    const updateBalance = async () => {
        if (!hasKeys) return;
        try {
            if (isSimulation) return; // Dalam mode simulasi, kita tidak selalu cek saldo real API

            const info = await getUserInfo(apiKey, secretKey);
            const pairTokens = getPair(coinId).split('_'); // ['btc', 'idr']
            const coinToken = pairTokens[0];

            // Ambil semua aset yang saldo > 0
            const assets = [];
            if (info.balance) {
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
            }

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
                totalBalanceReal: totalIdrValue,
                coin: parseFloat(info.balance[coinToken] || 0),
                assets: assets
            });
        } catch (error) {
            addLog(`Gagal mengambil saldo: ${error.message}`, 'error');
        }
    };

    // Fungsi utama trading loop
    const checkSignalAndTrade = async () => {
        if (!isRunning) return;

        try {
            const pair = getPair(coinId);
            const currentTradeAmount = tradeAmountRef.current;
            const now = Date.now();

            // [UPGRADE] BITCOIN GUARD: Cek kesehatan market global (BTC/IDR) setiap 15 menit
            if (now - lastBtcCheckRef.current > 15 * 60 * 1000) {
                lastBtcCheckRef.current = now;
                const btcChange = await fetchBitcoin24hChange();
                if (btcChange < -5.0) {
                    btcCooldownTimestampRef.current = now;
                    addLog(`⚠️ [BITCOIN GUARD] BTC sedang crash (${btcChange.toFixed(2)}%). Mengaktifkan jeda pengaman 2 jam.`, 'error');
                }
            }

            // Cek apakah sedang dalam masa jeda Bitcoin Guard
            if (now - btcCooldownTimestampRef.current < BTC_COOLDOWN_MS) {
                const hoursLeft = ((BTC_COOLDOWN_MS - (now - btcCooldownTimestampRef.current)) / 3600000).toFixed(1);
                addLog(`🛡️ [BITCOIN GUARD] Jeda aktif (${hoursLeft} jam lagi). Bot berhenti membeli koin apa pun.`, 'warning');
                return;
            }

            // Perbarui saldo riil secara berkala (minimal 60 detik)
            if (!isSimulation && hasKeys) {
                // [ORDER INTELLIGENCE] Cek dan kelola open orders setiap 30 detik
                if (now - lastOrderCheckRef.current > 30000 && apiKey && secretKey) {
                    lastOrderCheckRef.current = now;
                    try {
                        const openData = await fetchOpenOrders(apiKey, secretKey, pair);
                        if (openData && openData.orders && typeof openData.orders === 'object' && !Array.isArray(openData.orders)) {
                            const pairOrders = openData.orders[pair] || [];
                            if (Array.isArray(pairOrders)) {
                                for (const order of pairOrders) {
                                if (order.type === 'buy') {
                                    const ticker = await fetchTicker(pair).catch(() => null);
                                    if (ticker) {
                                        const intel = checkBuyOrderIntelligence(order, parseFloat(ticker.last));
                                        if (intel.shouldCancel) {
                                            addLog(`🤖 [INTEL] Membatalkan Order BELI: ${intel.reason}`, 'warning');
                                            await cancelOrder(apiKey, secretKey, pair, order.order_id, 'buy');
                                        }
                                    }
                                } else if (order.type === 'sell') {
                                    const depth = await fetchOrderBook(pair).catch(() => null);
                                    if (depth) {
                                        const intel = checkSellOrderIntelligence(order, depth);
                                        if (intel.shouldAdjust) {
                                            addLog(`🤖 [INTEL] Menyesuaikan Target JUAL: ${intel.reason}`, 'action');
                                            await cancelOrder(apiKey, secretKey, pair, order.order_id, 'sell');
                                            await new Promise(res => setTimeout(res, 1500));
                                            await tradeOrder(apiKey, secretKey, pair, 'sell', intel.newPrice, order.remain_btc || order.total_btc);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                        console.warn("[INTEL] Gagal cek open orders:", err.message);
                    }
                }

                // [PROFIT PROTECTION] Balance update
                if (now - lastBalanceFetchRef.current > 60000) {
                    updateBalance();
                    lastBalanceFetchRef.current = now;
                }
            }

            // 1. Dapatkan harga terbaru dari Indodax
            const ticker = await fetchTicker(pair);
            const currentPrice = parseFloat(ticker.last);

            // Update currentPrice di activeTrade untuk kalkulasi total aset
            setActiveTrade(prev => {
                if (!prev) return null;
                const rawPnl = ((currentPrice - prev.buyPrice) / prev.buyPrice * 100);
                const pnl = (rawPnl - 0.5).toFixed(2); // Estimasi potong fee + pajak Indodax

                // Trailing Stop Logic Update
                let newHighestPrice = prev.highestPrice || prev.buyPrice;
                let shouldUpdateCloud = false;

                if (currentPrice > newHighestPrice) {
                    newHighestPrice = currentPrice;
                    shouldUpdateCloud = true;
                }

                // [PROFIT PROTECTION] Break-Even Strategy
                const currentRawProfit = ((currentPrice - prev.buyPrice) / prev.buyPrice * 100);
                const isBreakEvenTriggered = currentRawProfit >= 0.7;
                const targetSL = prev.targetSL || (prev.buyPrice * 0.95);
                const protectedSL = isBreakEvenTriggered ? (prev.buyPrice * 1.001) : targetSL;

                // Dynamic Stop Loss (Trailing distance)
                const trailingSLPercent = 3.0; 
                const dynamicSL = newHighestPrice * (1 - (trailingSLPercent / 100));

                const isTrailingHit = currentPrice <= dynamicSL && newHighestPrice > (prev.buyPrice * 1.015);
                const isHardSlHit = currentPrice <= protectedSL;

                // Sync ke Cloud if peak is significant (debounced by margin to save API calls)
                if (shouldUpdateCloud && user && prev.id && newHighestPrice > (prev.highestPrice * 1.005)) {
                    supabase.from('active_trades').update({ highest_price: newHighestPrice }).eq('id', prev.id).then(null, () => { });
                }

                // Cek eksekusi Trailing SL (Ini terpisah dari currentSignal, meng-override)
                // const trailingSLPercent = 3.0; // Fixed 3% for single trader, you can make this configurable later
                // const dynamicSL = newHighestPrice * (1 - (trailingSLPercent / 100));
                // const hardSL = prev.buyPrice * 0.95; // Absolute 5% loss limit

                // const isTrailingHit = currentPrice <= dynamicSL && newHighestPrice > (prev.buyPrice * 1.01);
                // const isHardSlHit = currentPrice <= hardSL;

                if (isTrailingHit || isHardSlHit) {
                    // Inject a fake 'SELL' signal to force closure below
                    currentSignal = { type: 'SELL', trailing: true };
                }

                return { ...prev, currentPrice, highestPrice: newHighestPrice };
            });

            addLog(`Harga ${coinId} saat ini: Rp ${currentPrice.toLocaleString('id-ID')}`, 'info');

            // 2. Cek apakah ada sinyal baru dari analisis chart (currentSignal) yang beda dari sebelumnya
            if (currentSignal && currentSignal.type !== 'HOLD' && currentSignal.type !== lastSignalRef.current) {

                lastSignalRef.current = currentSignal.type;

                if (currentSignal.type === 'BUY') {
                    addLog(`[Sinyal Beli] Menganalisis kedalaman pasar (Order Book)...`, 'info');
                    
                    // KRITERIA PRO-TRADER: Analisis Order Book sebelum Beli
                    try {
                        const depthData = await fetchOrderBook(pair);
                        if (depthData) {
                            const analysis = analyzeOrderBook(depthData);
                            addLog(`📡 Depth Analysis: ${analysis.buyPressure.toFixed(1)}% Buy | Spread ${analysis.spread.toFixed(2)}%`, 'info');

                            // Filter 1: Spread
                            if (analysis.spread > 1.0) {
                                const reason = `Spread terlalu lebar (${analysis.spread.toFixed(2)}%)`;
                                addLog(`🚫 [DEPTH] Gagal Beli: ${reason}`, 'warning');
                                logRejection(reason);
                                lastSignalRef.current = 'HOLD';
                                return;
                            }

                            // Filter 2: Imbalance
                            if (analysis.imbalance < -30) {
                                const reason = `Tekanan jual terlalu tinggi (Imbalance: ${analysis.imbalance.toFixed(1)}%)`;
                                addLog(`🚫 [DEPTH] Gagal Beli: ${reason}`, 'warning');
                                logRejection(reason);
                                lastSignalRef.current = 'HOLD';
                                return;
                            }

                            // Filter 3: Sell Walls
                            const sellWalls = findMarketWalls(depthData.sell);
                            const nearbySellWalls = sellWalls.filter(wall => wall.price < currentPrice * 1.02);
                            if (nearbySellWalls.length > 0) {
                                const reason = `Ada tembok jual besar menghalangi dalam rentang 2%`;
                                addLog(`🚫 [DEPTH] Gagal Beli: ${reason}`, 'warning');
                                logRejection(reason);
                                lastSignalRef.current = 'HOLD';
                                return;
                            }
                        }
                    } catch (depthErr) {
                        console.warn("Gagal analisis depth:", depthErr);
                    }

                    // [UPGRADE] AI Confirmation: Fetch data histori dan minta pendapat Gemini
                    let prices = [];
                    try {
                        const formattedPairHistory = pair.toUpperCase().replace('_', '');
                        const to = Math.floor(Date.now() / 1000);
                        const from = to - (2 * 60 * 60);
                        const historyRes = await fetch(`https://indodax.com/tradingview/history_v2?symbol=${formattedPairHistory}&tf=1&from=${from}&to=${to}`);
                        if (historyRes.ok) {
                            const historyData = await historyRes.json();
                            if (Array.isArray(historyData) && historyData.length > 5) {
                                prices = historyData.map(d => typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close);
                            }
                        }
                    } catch (err) {
                        console.warn("Gagal fetch histori untuk AI:", err.message);
                    }

                    if (prices.length > 10) {
                        addLog(`🤖 [AI] Menganalisis pola 20 candle terakhir...`, 'info');
                        const aiDecision = await askGeminiConfirmation(coinId, prices);
                        if (!aiDecision.approved) {
                            const reason = `Ditolak AI: ${aiDecision.reason}`;
                            addLog(`🚫 [AI] ${reason}`, 'warning');
                            logRejection(reason);
                            lastSignalRef.current = 'HOLD';
                            return;
                        }
                        addLog(`🤖 [AI] Gemini MENYETUJUI: Sinyal dikonfirmasi!`, 'success');
                    }

                    addLog(`[Sinyal Beli] Kondisi Pasar Ideal. Menyiapkan order...`, 'info');
                    buyPriceRef.current = currentPrice;

                    if (isSimulation) {
                        addLog(`🟢 SIMULASI: Membeli ${coinId} senilai Rp ${currentTradeAmount.toLocaleString('id-ID')} pada harga Rp ${currentPrice.toLocaleString('id-ID')}`, 'buy');

                        // --- RADAR SYNC: Hanya aktifkan trade jika simulasi sukses ---
                        const simTrade = {
                            coin: coinId,
                            buyPrice: currentPrice,
                            amount: currentTradeAmount / currentPrice,
                            currentPrice: currentPrice,
                            highestPrice: currentPrice,
                            targetTP: currentPrice * 1.025,
                            targetSL: currentPrice * 0.955,
                            id: `${coinId}-${Date.now()}`,
                            isSimulation: true
                        };

                        // Persist to cloud
                        if (user) {
                            try {
                                const { data: dbTrade } = await supabase
                                    .from('active_trades')
                                    .upsert({
                                        user_id: user.id,
                                        coin_id: coinId,
                                        buy_price: currentPrice,
                                        target_tp: currentPrice * 1.025,
                                        target_sl: currentPrice * 0.955,
                                        highest_price: currentPrice,
                                        quantity: currentTradeAmount / currentPrice,
                                        is_simulation: true
                                    }, { onConflict: 'user_id,coin_id,is_simulation' })
                                    .select().maybeSingle();
                                if (dbTrade) simTrade.id = dbTrade.id;
                            } catch (dbErr) {
                                console.error("Gagal sinkron sim trade ke Cloud:", dbErr);
                            }
                        }

                        setActiveTrade(simTrade);
                        setSimulatedBalance(prev => prev - currentTradeAmount);

                    } else {
                        try {
                            // [FIX] Slippage 0.5% agar order langsung match & tidak nyangkut di Open Orders
                            const instantPrice = Math.ceil(currentPrice * 1.005);
                            addLog(`[Beli] Memasang Limit Buy @Rp ${instantPrice.toLocaleString('id-ID')} (0.5% slippage)...`, 'info');
                            const result = await tradeOrder(apiKey, secretKey, pair, 'buy', instantPrice, currentTradeAmount);
                            addLog(`🟢 REAL TRADE: Beli Eksekusi! Order ID: ${result.order_id}`, 'buy');

                            // --- RADAR SYNC: Hanya aktifkan trade jika order berhasil ---
                            const newTrade = {
                                coin: coinId,
                                buyPrice: currentPrice,
                                amount: currentTradeAmount / currentPrice,
                                currentPrice: currentPrice,
                                highestPrice: currentPrice,
                                targetTP: currentPrice * 1.025,
                                targetSL: currentPrice * 0.955,
                                id: `${coinId}-${Date.now()}`,
                                isSimulation: false
                            };

                            // Persist to cloud
                            if (user) {
                                try {
                                    const { data: dbTrade, error: upsertError } = await supabase
                                        .from('active_trades')
                                        .upsert({
                                            user_id: user.id,
                                            coin_id: coinId,
                                            buy_price: currentPrice,
                                            target_tp: currentPrice * 1.025,
                                            target_sl: currentPrice * 0.955,
                                            highest_price: currentPrice,
                                            quantity: currentTradeAmount / currentPrice,
                                            is_simulation: false
                                        }, { onConflict: 'user_id,coin_id,is_simulation' })
                                        .select().maybeSingle();
                                    if (upsertError) throw upsertError;
                                    if (dbTrade) newTrade.id = dbTrade.id;
                                } catch (dbErr) {
                                    console.error("Gagal sinkron real trade ke Cloud:", dbErr);
                                }
                            }

                            // Pasang Hard Stop Loss di Indodax sebagai pengaman
                            try {
                                const slPrice = Math.floor(currentPrice * 0.95);
                                const amountToSell = result.receive ? parseFloat(result.receive) : (currentTradeAmount / currentPrice) * 0.994;

                                const slResult = await tradeOrder(apiKey, secretKey, pair, 'sell', slPrice, amountToSell, {
                                    order_type: 'stoplimit',
                                    stop_price: Math.floor(currentPrice * 0.955)
                                });
                                hardStopOrderIdRef.current = slResult.order_id;
                                addLog(`🛡️ SAFETY: Hard Stop Loss terpasang (Trigger: Rp ${Math.floor(currentPrice * 0.955).toLocaleString()})`, 'success');
                            } catch (slErr) {
                                addLog(`⚠️ SAFETY WARNING: Gagal memasang Hard Stop Loss: ${slErr.message}`, 'error');
                            }

                            // Aktifkan di Radar hanya jika order berhasil
                            setActiveTrade(newTrade);
                            updateBalance();

                        } catch (err) {
                            addLog(`🔴 REAL TRADE GAGAL: ${err.message}`, 'error');
                            // PENTING: Jangan setActiveTrade jika order gagal
                            buyPriceRef.current = null;
                        }
                    }

                } else if (currentSignal.type === 'SELL') {
                    const isTrailing = currentSignal.trailing === true;
                    addLog(`[Sinyal Jual] ${isTrailing ? 'Trailing Stop Tersentuh!' : 'Sinyal Algoritma Turun'} Menyiapkan order...`, isTrailing ? 'success' : 'info');

                    if (buyPriceRef.current) {
                        addToHistory(coinId, 'SELL', buyPriceRef.current, currentPrice);
                        buyPriceRef.current = null;
                    }

                    if (isSimulation) {
                        const rawProfit = ((currentPrice - buyPriceRef.current) / buyPriceRef.current * 100);
                        const profit = (rawProfit - 0.5).toFixed(2);
                        addLog(`🔴 SIMULASI: Menjual semua ${coinId} pada harga ${currentPrice}. Nett P/L: ${profit}%`, 'sell');

                        // Update simulated balance: return principal + profit/loss
                        const profitValue = activeTrade.amount * currentPrice;
                        setSimulatedBalance(prev => prev + profitValue);

                        // Persist simulation log to Cloud for learning
                        if (user) {
                            supabase.from('bot_logs').insert({
                                user_id: user.id,
                                message: `[VIRTUAL SELL] ${coinId.toUpperCase()} ditutup melalui sinyal @Rp ${currentPrice.toLocaleString()}. Profit: ${profit}%`,
                                type: parseFloat(profit) >= 0 ? 'profit' : 'loss'
                            }).then(null, () => { });
                        }

                        setActiveTrade(null);
                    } else {
                        try {
                            const info = await getUserInfo(apiKey, secretKey);
                            const coinToken = pair.split('_')[0];
                            const coinBalance = parseFloat(info.balance[coinToken] || 0);

                            if (coinBalance > 0) {
                                const rawProfit = ((currentPrice - buyPriceRef.current) / buyPriceRef.current * 100);
                                const profit = (rawProfit - 0.5).toFixed(2);
                                // 1. Batalkan Hard Stop Loss jika ada
                                if (hardStopOrderIdRef.current) {
                                    try {
                                        await cancelOrder(apiKey, secretKey, pair, hardStopOrderIdRef.current, 'sell');
                                        addLog(`🛡️ SAFETY: Hard Stop Loss dibatalkan sebelum Jual.`, 'info');
                                        // Tunggu saldo direfund (1.5 detik)
                                        await new Promise(res => setTimeout(res, 1500));
                                        hardStopOrderIdRef.current = null;
                                    } catch (cErr) {
                                        console.warn("Gagal cancel Hard SL (Mungkin sudah tereksekusi):", cErr.message);
                                    }
                                }

                                // [FIX SINKRONISASI] Jual Indodax -> Berhasil -> Hapus Supabase
                                addLog(`🔴 REAL TRADE: Menjual ${coinBalance} ${coinToken.toUpperCase()} @Rp ${currentPrice.toLocaleString()}...`, 'sell');
                                // [FIX] Slippage 0.5% ke bawah agar Jual langsung match
                                await tradeOrder(apiKey, secretKey, pair, 'sell', Math.floor(currentPrice * 0.995), coinBalance);
                                addLog(`✅ REAL TRADE: Jual Sukses! Sinkronisasi data ke Cloud...`, 'success');
                                updateBalance();

                                // Only delete from DB if we have a valid DB ID
                                if (user && activeTrade?.id && activeTrade.id.length > 20 && activeTrade.id.includes('-') && !activeTrade.id.startsWith(coinId)) {
                                    await supabase.from('active_trades').delete().eq('id', activeTrade.id);
                                }

                                setActiveTrade(null);
                            } else {
                                addLog(`🔴 REAL TRADE GAGAL: Saldo koin tidak cukup untuk dijual`, 'error');
                                // Sync removal if we think we have it but we don't
                                if (user && activeTrade?.id) {
                                    await supabase.from('active_trades').delete().eq('id', activeTrade.id);
                                    setActiveTrade(null);
                                }
                            }
                        } catch (err) {
                            addLog(`🔴 REAL TRADE GAGAL EKSEKUSI: ${err.message}. Data tetap disimpan di Radar.`, 'error');
                        }
                    }
                }
            }

        } catch (error) {
            console.error("AutoTrader Loop Error:", error);
            addLog(`System Error: ${error.message}`, 'error');
        }
    };

    // Start / Stop Loop
    useEffect(() => {
        if (isRunning) {
            if (!hasKeys && !isSimulation) {
                addLog('API Keys belum diatur! Menjalankan dalam mode Simulasi.', 'error');
                setIsSimulation(true);
            }
            addLog(`🚀 Bot dimulai untuk ${coinId}. Mode: ${isSimulation ? 'Simulasi' : 'REAL TRADE'}`, 'success');

            if (user && coinId) {
                supabase.from('active_trades')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('coin_id', coinId)
                    .maybeSingle()
                    .then(({ data }) => {
                        if (data) {
                            setActiveTrade({
                                coin: data.coin_id,
                                buyPrice: parseFloat(data.buy_price),
                                amount: parseFloat(data.quantity),
                                targetTP: parseFloat(data.target_tp),
                                targetSL: parseFloat(data.target_sl),
                                currentPrice: parseFloat(data.buy_price),
                                isSimulation: data.is_simulation,
                                id: data.id
                            });
                        }
                    });
            }

            updateBalance(); // Initial balance check

            // Jalankan pertama kali segera
            checkSignalAndTrade();

            // Set interval tiap 15 detik untuk cek harga & sinyal (Lebih responsif untuk Radar)
            loopRef.current = setInterval(checkSignalAndTrade, 15000);

        } else {
            if (loopRef.current) {
                clearInterval(loopRef.current);
                loopRef.current = null;
                if (logs.length > 0) addLog('⏹️ Bot dihentikan.', 'info');
            }
        }

        return () => {
            if (loopRef.current) clearInterval(loopRef.current);
            loopRef.current = null;

            // Cleanup Hard Stop Loss if bot is stopped manually
            if (hardStopOrderIdRef.current && !isSimulation) {
                const pair = getPair(coinId);
                cancelOrder(apiKey, secretKey, pair, hardStopOrderIdRef.current, 'sell')
                    .then(() => console.log("Cleanup: Hard SL Canceled"))
                    .catch(err => console.warn("Cleanup: Hard SL Cancel failed", err.message));
                hardStopOrderIdRef.current = null;
            }
        };
    }, [isRunning, coinId, isSimulation, hasKeys, tradeAmount]); // Note: currentSignal ditiadakan agar interval tidak reset setiap harga berubah

    // Effect terpisah untuk bereaksi langsung jika ada sinyal mendadak (di luar jadwal interval)
    useEffect(() => {
        if (isRunning && currentSignal) {
            // checkSignalAndTrade() // Opsional: eksekusi langsung saat sinyal berubah
        }
    }, [currentSignal, isRunning]);

    const toggleBot = (forceVal) => {
        if (typeof forceVal === 'boolean') {
            setIsRunning(forceVal);
        } else {
            setIsRunning(!isRunning);
        }
    };
    const clearLogs = () => setLogs([]);
    const clearHistory = () => setTradeHistory([]);

    // Kalkulasi Total Estimasi
    const currentIdr = isSimulation ? simulatedBalance : balance.idr;
    let totalValue = currentIdr;

    if (isSimulation) {
        if (activeTrade) {
            const assetPrice = activeTrade.currentPrice || activeTrade.buyPrice;
            totalValue += (activeTrade.amount * assetPrice);
        }
    } else {
        totalValue = balance.totalBalanceReal || currentIdr;
    }

    const totalBalance = totalValue;

    // Aset virtual untuk simulasi
    const simulatedAssets = [];
    if (activeTrade) {
        simulatedAssets.push({
            symbol: coinId.toUpperCase(),
            balance: activeTrade.amount,
            hold: 0,
            total: activeTrade.amount
        });
    }

    const forceSell = async () => {
        if (!activeTrade) return;

        const isSim = isSimulation;
        const coin = activeTrade.coin;
        const pair = getPair(activeTrade.coin);

        try {
            addLog(`⚠️ [FORCE SELL] Memproses jual cepat manual untuk ${coinId.toUpperCase()}...`, 'warning');

            let currentPrice = activeTrade.currentPrice;

            if (!isSim && apiKey && secretKey) {
                const ticker = await fetchTicker(pair).catch(() => null);
                if (ticker) currentPrice = parseFloat(ticker.last);

                const info = await getUserInfo(apiKey, secretKey).catch(() => null);
                const baseSymbol = coinId.split('-')[0].toLowerCase();
                const coinBalanceCount = info?.balance[baseSymbol] || 0;

                // Cancel any pending hard stop loss order
                if (hardStopOrderIdRef.current) {
                    try {
                        await cancelOrder(apiKey, secretKey, pair, hardStopOrderIdRef.current, 'sell');
                        addLog(`🛡️ SAFETY: Hard Stop Loss dibatalkan sebelum Force Sell.`, 'info');
                        // Tunggu saldo direfund (1.5 detik)
                        await new Promise(res => setTimeout(res, 1500));
                        hardStopOrderIdRef.current = null;
                    } catch (cErr) {
                        console.warn("Gagal cancel Hard SL during Force Sell (Mungkin sudah tereksekusi):", cErr.message);
                    }
                }

                if (coinBalanceCount > 0) {
                    await tradeOrder(apiKey, secretKey, pair, 'sell', currentPrice, coinBalanceCount);
                    addLog(`🔴 [FORCE SELL] Real Trade: Eksekusi jual berhasil @Rp ${currentPrice.toLocaleString()}`, 'sell');
                }
            }

            const rawProfit = ((currentPrice - activeTrade.buyPrice) / activeTrade.buyPrice * 100);
            const profit = (rawProfit - 0.5).toFixed(2);

            if (isSim) {
                const profitValue = activeTrade.amount * currentPrice;
                setSimulatedBalance(prev => prev + profitValue);
            }

            // Log and Cleanup
            if (user) {
                const logData = {
                    user_id: user.id,
                    message: `[FORCE SELL] ${coinId.toUpperCase()} ditutup manual @Rp ${currentPrice.toLocaleString()}. P/L: ${profit}%`,
                    type: parseFloat(profit) >= 0 ? 'profit' : 'loss'
                };

                supabase.from('bot_logs').insert(logData)
                    .then(({ error }) => {
                        if (error) console.error("Supabase bot_logs error (Trader):", error);
                    });

                supabase.from('trade_history').insert({
                    user_id: user.id,
                    coin: coinId.toUpperCase(),
                    trade_type: parseFloat(profit) >= 0 ? 'PROFIT' : 'LOSS',
                    buy_price: activeTrade.buyPrice,
                    sell_price: currentPrice,
                    profit_percent: parseFloat(profit),
                    is_simulation: isSim
                }).then(({ error }) => {
                    if (error) console.error("Supabase trade_history error (Trader):", error);
                });

                if (activeTrade.id) {
                    supabase.from('active_trades').delete().eq('id', activeTrade.id).then();
                }
            }

            setActiveTrade(null);
            addLog(`✅ [FORCE SELL] Selesai. Posisi ${coinId.toUpperCase()} telah dibersihkan.`, 'success');

        } catch (error) {
            console.error("Force Sell Error:", error);
            addLog(`❌ Gagal Jual Cepat: ${error.message}`, 'error');
        }
    };

    return {
        isRunning,
        toggleBot,
        forceSell,
        logs,
        clearLogs,
        balance: isSimulation ? { idr: simulatedBalance, coin: 0, assets: simulatedAssets } : balance,
        totalBalance,
        activeTrade, // Ekspos agar Radar bisa muncul di mode single koin juga
        tradeAmount,
        setTradeAmount,
        isSimulation,
        setIsSimulation,
        tradeHistory,
        clearHistory,
        isCloudLoaded,
    };
};
