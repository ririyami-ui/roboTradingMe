import { useState, useEffect, useRef } from 'react';
import { useIndodaxAuth } from './useIndodaxAuth';
import { fetchTicker, getUserInfo, tradeOrder, cancelOrder, fetchSummaries, fetchOrderBook, fetchOpenOrders, fetchBitcoin24hChange } from '../utils/indodaxApi';
import { useCoinList } from './useCoinList';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { analyzeTechnicalIndicators, calculateEMA } from '../utils/technicalIndicators';
import { analyzeOrderBook, findMarketWalls } from '../utils/orderBookAnalysis';
import { checkBuyOrderIntelligence, checkSellOrderIntelligence } from '../utils/orderIntelligence';
import { addGlobalSignal } from './useMarketIntelligence';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';

// Environment-aware API base URLs
const isDev = import.meta.env.DEV;

export const useAutoScanner = (onCoinChange, initialIsSimulation) => {
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
    const takeProfitPercentRef = useRef(2.5);   // [FIX] Default TP naik: 2.0% → 2.5%
    const stopLossPercentRef = useRef(1.5);
    const isInitialSweepRef = useRef(false);
    const sweepIndexRef = useRef(0);
    const recentlyScannedRef = useRef(new Set());
    const onCoinChangeRef = useRef(onCoinChange);
    const lastLossTimestampRef = useRef(0);      // [FIX] Timestamp loss terakhir untuk cooldown
    const LOSS_COOLDOWN_MS = 20 * 60 * 1000;    // [FIX] Cooldown ditingkatkan ke 20 menit agar market benar-benar tenang

    // [UPGRADE] BITCOIN GUARD: Mencegah bot beli saat market crash global
    const lastBtcCheckRef = useRef(0);
    const btcCooldownTimestampRef = useRef(0);
    const BTC_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 Jam cooldown jika BTC crash

    useEffect(() => {
        onCoinChangeRef.current = onCoinChange;
    }, [onCoinChange]);

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
            return saved ? parseFloat(saved) : (cloudSettings?.takeProfit || 2.5); // [FIX] Default TP: 2.5%
        } catch (e) {
            return 2.5; // [FIX] Default TP: 2.5%
        }
    });
    const [stopLossPercent, setStopLossPercent] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerStopLoss');
            return saved ? parseFloat(saved) : (cloudSettings?.stopLoss || 1.5);
        } catch (e) {
            return 1.5;
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
            const saved = localStorage.getItem('scannerSimulatedBalance');
            return saved ? parseFloat(saved) : 10000000;
        } catch (e) {
            return 10000000;
        }
    });
    const [activeTrades, setActiveTrades] = useState([]);
    const [tradeHistory, setTradeHistory] = useState([]);
    const [currentScanCoinDisplay, setCurrentScanCoinDisplay] = useState('Wait');
    const [scannerStatus, setScannerStatus] = useState({ message: 'Siap mulai memindai pasar', level: 'chill' }); // 'chill', 'interest', 'action'
    const [isCloudLoaded, setIsCloudLoaded] = useState(false);

    // 4. Sync Effects
    useEffect(() => {
        if (cloudSettings.isLoaded) {
            if (tradeAmount !== cloudSettings.tradeAmount) setTradeAmount(cloudSettings.tradeAmount);
            // TP and SL are local-only for now due to database column limitations
        }
    }, [cloudSettings.isLoaded, cloudSettings.tradeAmount]);

    useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);
    useEffect(() => {
        const historyKey = isSimulation ? 'scannerTradeHistory_sim' : 'scannerTradeHistory_live';
        localStorage.setItem(historyKey, JSON.stringify(tradeHistory));
    }, [tradeHistory, isSimulation]);
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
    }, [tradeAmount, takeProfitPercent, stopLossPercent, user?.id]);
    useEffect(() => {
        isSimulationRef.current = isSimulation;
    }, [isSimulation, user?.id]);
    useEffect(() => { takeProfitPercentRef.current = takeProfitPercent; }, [takeProfitPercent]);
    useEffect(() => { stopLossPercentRef.current = stopLossPercent; }, [stopLossPercent]);
    // Removal of dangerous redundant clear: initIndodax handles it correctly
    // useEffect(() => { setTradeHistory([]); }, [isSimulation]);
    useEffect(() => {
        localStorage.setItem('scannerSimulatedBalance', simulatedBalance.toString());
        // Temporarily disabled cloud sync for simulated_balance to avoid 400 error
        /*
        if (user) {
            supabase.from('profiles').update({ simulated_balance: simulatedBalance }).eq('id', user.id).then(null, () => {});
        }
        */
    }, [simulatedBalance, user?.id]);

    const isInitialMountRef = useRef(false);

    // Initial fetch of Indodax markets
    useEffect(() => {
        if (isInitialMountRef.current) return;
        isInitialMountRef.current = true;

        const initIndodax = async () => {
            setIsCloudLoaded(false);
            try {
                // Fetch active trades and history from Cloud if logged in
                if (user) {
                    console.log("SaktiBot: Initializing cloud data...");
                    const [{ data: cloudTrades }, { data: cloudHistory }] = await Promise.all([
                        supabase.from('active_trades').select('*').eq('user_id', user.id).eq('is_simulation', isSimulation),
                        supabase.from('trade_history').select('*').eq('user_id', user.id).eq('is_simulation', isSimulation).order('created_at', { ascending: false }).limit(20)
                    ]);

                    console.log(`SaktiBot: Penarikan data Cloud selesai. Ditemukan ${cloudTrades?.length || 0} trade dalam mode ${isSimulation ? 'SIMULASI' : 'RIIL'}.`);

                    // Load history for current mode
                    const historyKey = isSimulation ? 'scannerTradeHistory_sim' : 'scannerTradeHistory_live';
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
                        const mappedTrades = cloudTrades.map(t => ({
                            coin: t.coin_id,
                            buyPrice: parseFloat(t.buy_price),
                            amount: parseFloat(t.quantity),
                            targetTP: parseFloat(t.target_tp),
                            targetSL: parseFloat(t.target_sl),
                            highestPrice: parseFloat(t.highest_price || t.buy_price),
                            currentPrice: parseFloat(t.highest_price || t.buy_price),
                            isSimulation: t.is_simulation,
                            id: t.id
                        }));
                        setActiveTrades(mappedTrades);
                        // Jika ada trade aktif di cloud, pastikan scanner "jalan" untuk memantau
                        setIsScanning(true);
                    } else {
                        setActiveTrades([]);
                    }
                } else {
                    // No user: Clear trades
                    setActiveTrades([]);
                    setTradeHistory([]);
                }

                const summaries = await fetchSummaries();
                if (summaries?.tickers) {
                    setIndodaxPairs(new Set(Object.keys(summaries.tickers)));
                }
            } catch (err) {
                console.error("Initial Indodax/Cloud fetch failed:", err);
            } finally {
                setIsCloudLoaded(true);
            }
        };
        initIndodax();
    }, [user?.id, isSimulation]);

    // REALTIME MONITOR: Sync activeTrades directly from Supabase events
    // This ensures Radar is always a "Monitor from Backend" as requested.
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('scanner_active_trades_realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'active_trades', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    const { eventType, new: newRow, old: oldRow } = payload;

                    // Filter for current simulation mode
                    const targetMode = newRow ? newRow.is_simulation : (oldRow ? oldRow.is_simulation : null);
                    if (targetMode !== null && targetMode !== isSimulation) return;

                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        setActiveTrades(prev => {
                            const mapped = {
                                id: newRow.id,
                                coin: newRow.coin_id,
                                buyPrice: parseFloat(newRow.buy_price),
                                amount: parseFloat(newRow.quantity),
                                targetTP: parseFloat(newRow.target_tp),
                                targetSL: parseFloat(newRow.target_sl),
                                highestPrice: parseFloat(newRow.highest_price),
                                currentPrice: parseFloat(newRow.highest_price),
                                isSimulation: newRow.is_simulation
                            };

                            // [FIX] Identity: Use ID as strict primary key to prevent JELLYJELLY / duplication glitches
                            const existingIdx = prev.findIndex(t => t.id === mapped.id);
                            if (existingIdx > -1) {
                                const newTrades = [...prev];
                                newTrades[existingIdx] = { ...newTrades[existingIdx], ...mapped };
                                return newTrades;
                            }
                            // Add new, but keep max 10 to prevent radar overflow (increased from 4 for flexibility)
                            return [...prev, mapped].slice(-10);
                        });
                    } else if (eventType === 'DELETE') {
                        setActiveTrades(prev => prev.filter(t => t.id !== oldRow.id));
                    }
                }
            )
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user?.id, isSimulation]);

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
        if (!hasKeys || isSimulation) return;
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
        // Skip balance fetch if in simulation and already have initial data
        if (isSimulation && balance.totalBalanceReal > 0) return;

        fetchBalance();

        // Jika akun riil, update saldo setiap 120 detik untuk sinkronisasi total aset
        let interval;
        if (hasKeys && !isSimulation && isScanning) {
            interval = setInterval(fetchBalance, 120000);
        }
        return () => clearInterval(interval);
    }, [hasKeys, isSimulation, isScanning]);

    // [UPGRADE] Audit Logging: Simpan alasan kenapa bot batal beli koin tertentu
    const logRejection = async (coin, reason, type = 'rejection') => {
        if (!user) return;
        const mode = isSimulationRef.current ? 'VIRTUAL' : 'REAL';
        supabase.from('bot_logs').insert({
            user_id: user.id,
            message: `[${mode} ABORTED] ${coin.toUpperCase()}: ${reason}`,
            type: type
        }).then(({ error }) => {
            if (error) console.error("Supabase logRejection error:", error);
        });
    };

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
        
        // AI PATTERN RECOGNITION: Ambil 20 data harga terakhir untuk deteksi pola (Double Bottom, Rejection, dll)
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
        
        Sikap: KONSERVATIF. Lebih baik kehilangan peluang daripada terjebak 'pucuk'. 
        Hanya jawab 'BELI' jika Anda 90% yakin akan ada kenaikan >1% dalam 15 menit ke depan. 
        Jika ragu sedikitpun, jawab 'ABAIKAN'.
        
        Format: 'BELI/ABAIKAN. [Alasan singkat max 10 kata]'.
        `;

        const tryModel = async (modelName, isFallback = false) => {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const responseText = (await result.response.text()).trim();
                console.log(`[GEMINI ${isFallback ? 'FALLBACK' : 'PRIMARY'} RESPONSE] ${coinId}:`, responseText);

                const isApproved = responseText.toUpperCase().includes('BELI');
                if (!isApproved) {
                    console.warn(`[GEMINI REJECTION] ${coinId} ditolak oleh ${modelName}: ${responseText}`);
                }
                return { approved: isApproved, reason: responseText };
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
                return { approved: false, reason: `AI Error: ${errorMsg}` };
            }
        };

        // ⏱️ PROFESSIONAL TRADING: Timeout 6.5 detik untuk Gemini.
        // Beri waktu napas pada API LLM yang sibuk.
        const GEMINI_TIMEOUT_MS = 6500;
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                console.warn(`[GEMINI TIMEOUT] ${coinId}: AI tidak merespons dalam ${GEMINI_TIMEOUT_MS / 1000} detik. Melewati peluang ini.`);
                addLog(`⏱️ [AI TIMEOUT] ${coinId.toUpperCase()}: Gemini terlalu lambat merespons, peluang dilewati untuk menjaga momentum.`, 'warning');
                resolve({ approved: false, reason: 'AI Timeout' }); // Skip = false
            }, GEMINI_TIMEOUT_MS);
        });

        return await Promise.race([
            tryModel("gemini-3.1-flash-lite-preview"),
            timeoutPromise
        ]);
    };

    // Eksekusi Beli dan Siapkan Order Jual (Scalping)
    const executeScalpTrade = async (coin, price, signalType = 'POTENTIAL_BUY') => {
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
                const depthData = await fetchOrderBook(pair);
                if (!depthData || !depthData.sell || depthData.sell.length === 0) {
                    addLog(`🔴 REAL TRADE GAGAL: Order Book ${pair} tidak tersedia.`, 'error');
                    return;
                }
                
                // [PRO] Ask-Price Limit Order: Gunakan harga jual terendah (Best Ask) 
                // agar tidak terkena slippage parah dari Market Buy.
                const bestAsk = parseFloat(depthData.sell[0][0]);
                buyPrice = bestAsk;

                addLog(`📡 [PRO EXECUTION] Menggunakan Limit Order di harga Best Ask: Rp ${buyPrice.toLocaleString()}`, 'info');

                const order = await tradeOrder(apiKey, secretKey, pair, 'buy', buyPrice, currentTradeAmount);
                addLog(`🟢 REAL TRADE Sukses (Limit Order @ Ask)! Order ID: ${order.order_id}`, 'buy');
                fetchBalance(); // Refresh balance immediately after trade

                // Deteksi jumlah koin yang dibeli (Taker fee Indodax ~0.51%)
                if (order.receive) {
                    amountCoinBought = parseFloat(order.receive);
                } else {
                    // Fallback: Hitung estimasi jika API tidak mengembalikan 'receive' seketika
                    // (Lebih baik ada estimasi daripada 0 yang bikin radar tidak muncul)
                    amountCoinBought = (currentTradeAmount / buyPrice) * 0.994;

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

            // Log konfirmasi mode
            if (currentIsSimulation) {
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
                hardStopOrderId: null, // Akan diisi setelah order terpasang
                id: `${coin}-${Date.now()}`, // Temporary ID, will be replaced by DB ID
                signal: signalType // [NEW] Untuk Dynamic Trailing Stop
            };

            // [FIX] Pasang Hard SL SETELAH newTrade dibuat agar bisa menyimpan order ID-nya
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
                    newTrade.hardStopOrderId = slOrder.order_id; // [FIX] Simpan agar bisa di-cancel saat trade ditutup
                } catch (err) {
                    addLog(`🔴 SAFETY WARNING: Gagal pasang Hard Stop Loss: ${err.message}`, 'error');
                }
            }

            // PERSIST TO CLOUD for Backend Safeguard (Now supports Simulation!)
            if (user) {
                try {
                    // [ADD] Log to indicate we are trying to sync
                    console.log(`SaktiBot: Syncing new trade ${coin} to cloud...`);
                    
                    const { data: dbTrade, error: upsertError } = await supabase
                        .from('active_trades')
                        .upsert({
                            user_id: user.id,
                            coin_id: coin,
                            buy_price: initialHighestPrice,
                            target_tp: targetTP,
                            target_sl: targetSL,
                            highest_price: initialHighestPrice,
                            quantity: amountCoinBought,
                            is_simulation: currentIsSimulation
                        }, { onConflict: 'user_id,coin_id,is_simulation' })
                        .select()
                        .maybeSingle();

                    if (upsertError) throw upsertError;

                    if (dbTrade) {
                        newTrade.id = dbTrade.id; // Switch to cloud UUID
                        console.log(`SaktiBot: Trade ${coin} successfully synced to Cloud. ID: ${dbTrade.id}`);
                    }
                } catch (dbErr) {
                    console.error("Gagal sinkron trade ke Cloud:", dbErr);
                    addLog(`⚠️ Cloud Sync Error: Trade tetap berjalan lokal tapi tidak tercatat di Cloud.`, 'error');
                }
            }

            setActiveTrades(prev => [...prev.slice(-(3)), newTrade]); // max 4
            addLog(`⏳ Trade aktif: ${coin.toUpperCase()} (${activeTradesRef.current.length + 1} posisi terbuka). Scanner tetap berjalan...`, 'info');
            setScannerStatus({ message: `Monitoring ${coin.toUpperCase()} + scanning...`, level: 'action' });
        }
    };

    const lastOrderCheckRef = useRef(0);
    const ORDER_CHECK_INTERVAL_MS = 30000; // 30 detik

    // Fungsi Utama: Scanner Loop
    const scanNextCoin = async () => {
        if (!isScanning) {
            setScannerStatus({ message: 'Bot Idle. Pilih mode untuk memulai.', level: 'chill' });
            return;
        }

        // [UPGRADE] BITCOIN GUARD: Cek kesehatan market global (BTC/IDR) setiap 15 menit
        const now = Date.now();
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
            setScannerStatus({ 
                message: `🛡️ BITCOIN GUARD: Jeda ${hoursLeft} jam lagi (Market Crash).`, 
                level: 'chill' 
            });
            setCurrentScanCoinDisplay('BTC Mode Aman');
            return;
        }

        // [ORDER INTELLIGENCE] Cek dan kelola open orders setiap 30 detik
        if (Date.now() - lastOrderCheckRef.current > ORDER_CHECK_INTERVAL_MS && !isSimulation) {
            lastOrderCheckRef.current = Date.now();
            try {
                const openData = await fetchOpenOrders(apiKey, secretKey);
                if (openData && openData.orders && typeof openData.orders === 'object' && !Array.isArray(openData.orders)) {
                    for (const [pair, pairOrders] of Object.entries(openData.orders || {})) {
                        if (!Array.isArray(pairOrders)) continue; // Guard: skip jika bukan array
                        for (const order of pairOrders) {
                            if (order.type === 'buy') {
                                // Cek apakah order beli masih relevan
                                const ticker = await fetchTicker(pair).catch(() => null);
                                if (ticker) {
                                    const intel = checkBuyOrderIntelligence(order, parseFloat(ticker.last));
                                    if (intel.shouldCancel) {
                                        addLog(`🤖 [INTEL] Membatalkan Order BELI ${pair.split('_')[0].toUpperCase()}: ${intel.reason}`, 'warning');
                                        await cancelOrder(apiKey, secretKey, pair, order.order_id, 'buy');
                                    }
                                }
                            } else if (order.type === 'sell') {
                                // Cek apakah target jual perlu disesuaikan (Panic Sell/Take Profit early)
                                const depth = await fetchOrderBook(pair).catch(() => null);
                                if (depth) {
                                    const intel = checkSellOrderIntelligence(order, depth);
                                    if (intel.shouldAdjust) {
                                        addLog(`🤖 [INTEL] Menyesuaikan Target JUAL ${pair.split('_')[0].toUpperCase()}: ${intel.reason}`, 'action');
                                        // Batalkan order lama dan pasang harga baru yang lebih kompetitif
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

        const currentActiveTrades = activeTradesRef.current;

        // MONITOR semua posisi aktif secara mengalir (sequential) untuk mencegah Indodax Rate Limit 429
        if (currentActiveTrades.length > 0) {
            setScannerStatus({ message: `Memantau ${currentActiveTrades.length} Trade...`, level: 'action' });

            for (const trade of currentActiveTrades) {
                const { coin, buyPrice, targetSL, targetTP, amount, id, highestPrice, hardStopOrderId } = trade;

                try {
                    const pair = getPair(coin);
                    const ticker = await fetchTicker(pair).catch(() => null);
                    if (!ticker || !ticker.last) {
                        setActiveTrades(prev => prev.filter(t => t.id !== id));
                        continue;
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

                    // Dynamic Stop Loss (Trailing distance)
                    // [PRO] Untuk koin Momentum, gunakan trailing yang jauh lebih ketat (0.8%) agar tidak terjun bebas.
                    const isMomentum = trade.signal === 'MOMENTUM_UP';
                    const trailingDistancePercent = isMomentum ? 0.8 : stopLossPercentRef.current;
                    const dynamicSL = newHighestPrice * (1 - (trailingDistancePercent / 100));

                    // Update state memori lokal (harga terkini & highest price)
                    setActiveTrades(prev => prev.map(t => t.id === id ? { ...t, currentPrice, highestPrice: newHighestPrice } : t));

                    // Sync rekor harga tertinggi ke Cloud secara berkala jika naik signifikan (menghemat load)
                    if (shouldUpdateCloudPrice && user && id && id.length > 20 && id.includes('-') && !id.startsWith(coin)) {
                        // Mengurangi beban debounce: Hanya simpan jika beda harganya lumayan 
                        if (newHighestPrice > (highestPrice * 1.005)) {
                            supabase.from('active_trades').update({ highest_price: newHighestPrice }).eq('id', id).then(null, () => { });
                        }
                    }

                    // [PROFIT PROTECTION] Break-Even Strategy
                    // Jika profit sudah mencapai 0.7%, pindahkan SL ke buyPrice + 0.1% (Break-even + fee)
                    const currentRawProfit = ((currentPrice - buyPrice) / buyPrice * 100);
                    const isBreakEvenTriggered = currentRawProfit >= 0.7;
                    const protectedSL = isBreakEvenTriggered ? (buyPrice * 1.001) : targetSL;

                    // EKSEKUSI JUAL: Trailing SL ATAU Hard SL ATAU Fixed TP
                    const isTPHit = targetTP && currentPrice >= targetTP;
                    const isTrailingHit = currentPrice <= dynamicSL && newHighestPrice > (buyPrice * 1.015); // [FIX] Trailing aktif @ 1.5% profit
                    const isHardSlHit = currentPrice <= protectedSL; // Menggunakan protectedSL (BE jika sudah trigger)

                    if (isTPHit || isTrailingHit || isHardSlHit) {
                        // [FIX] Guard: Sanitize P/L calculation to prevent -100% glitch
                        if (!buyPrice || buyPrice <= 0 || !currentPrice || currentPrice <= 0) {
                            console.error(`[PL GLITCH PREVENTED] Invalid prices for ${coin}: Buy=${buyPrice}, Current=${currentPrice}`);
                            setActiveTrades(prev => prev.filter(t => t.id !== id));
                            continue;
                        }

                        const rawProfit = ((currentPrice - buyPrice) / buyPrice * 100);
                        const netProfit = (rawProfit - 0.51).toFixed(2); // Estimasi potong fee + pajak (Indodax 0.51% roundtrip)
                        const profitPercent = netProfit;
                        const isSim = trade.isSimulation;

                        if (isSim) {
                            // Update simulated balance: return principal + profit/loss
                            const profitValue = amount * currentPrice;
                            setSimulatedBalance(prev => prev + profitValue);
                        }

                        // Tentukan tipe aksi dengan presisi
                        const actionType = isTPHit ? '[Fixed TP]' : (parseFloat(netProfit) >= 0 ? '[Trailing TP]' : '[Hard SL]');
                        const logCat = isHardSlHit && !isTPHit ? 'error' : 'success';
                        const speakText = isHardSlHit && !isTPHit ? `Stop loss ${coin.toUpperCase()}` : `Take profit ${coin.toUpperCase()}`;

                        addLog(`🚀 ${actionType} ${coin.toUpperCase()} ${profitPercent}% @ Rp ${currentPrice.toLocaleString('id-ID')}`, logCat);
                        speak(speakText);

                        // [Fix 2] Cancel Hard SL order di Indodax terlebih dahulu (anti double sell)
                        if (!isSim && hardStopOrderId) {
                            try {
                                await cancelOrder(apiKey, secretKey, pair, hardStopOrderId, 'sell');
                                addLog(`🛡️ SAFETY: Hard Stop Loss ${hardStopOrderId} dibatalkan untuk memberi jalan eksekusi Profit/Cut.`, 'info');
                                // Beri jeda 1.5 detik agar mesin Indodax mengembalikan saldo ke dompet sebelum order sell baru.
                                await new Promise(res => setTimeout(res, 1500));
                            } catch(e) {
                                console.warn(`[SL Cancel] Gagal cancel Hard SL order ${hardStopOrderId}:`, e.message);
                            }
                        }

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

                            // Only delete from DB if we have a valid DB ID (not the temporary coin-timestamp ID)
                            if (id && id.length > 20 && id.includes('-') && !id.startsWith(coin)) {
                                supabase.from('active_trades').delete().eq('id', id).then(null, () => { });
                            }
                        }

                        setTradeHistory(prev => [{ id: Date.now(), coin: coin.toUpperCase(), type: parseFloat(netProfit) >= 0 ? 'PROFIT' : 'LOSS', buyPrice, sellPrice: currentPrice, profit: profitPercent, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
                        // [FIX SINKRONISASI] URUTAN: Jual Indodax -> Berhasil -> Hapus Supabase
                        if (!isSim) {
                            try {
                                // Double Check Balance before final sell attempt
                                const info = await getUserInfo(apiKey, secretKey).catch(() => null);
                                const coinToken = pair.split('_')[0];
                                const currentInventory = info?.balance[coinToken] || amount;
                                
                                if (currentInventory > 0) {
                                    const depthData = await fetchOrderBook(pair);
                                    const bestBid = (depthData && depthData.buy && depthData.buy.length > 0) ? parseFloat(depthData.buy[0][0]) : currentPrice;
                                    
                                    addLog(`🔴 REAL TRADE: Menjual ${amount} ${coinToken.toUpperCase()} @Rp ${bestBid.toLocaleString()} (Best Bid)...`, 'sell');
                                    await tradeOrder(apiKey, secretKey, pair, 'sell', bestBid, currentInventory);
                                    addLog(`✅ REAL TRADE: Jual Sukses! Sinkronisasi data ke Cloud...`, 'success');
                                    fetchBalance();
                                } else {
                                    addLog(`⚠️ [SYNC] Aset ${coinToken.toUpperCase()} sudah tidak ada di dompet (Mungkin sudah terjual via Hard SL).`, 'warning');
                                }

                                // Hanya hapus dari DB JIKA order jual Indodax tidak melempar error
                                if (user && id && id.length > 20 && id.includes('-') && !id.startsWith(coin)) {
                                    await supabase.from('active_trades').delete().eq('id', id);
                                    console.log(`SaktiBot: Cloud trade ${id} cleaned up after confirmed sale.`);
                                }
                            } catch (sErr) {
                                addLog(`🔴 GAGAL JUAL REAL: ${sErr.message}. Data tetap disimpan di Radar untuk manual check.`, 'error');
                                // JANGAN hapus dari activeTrades lokal agar user bisa 'Force Sell' atau jual manual
                                return; 
                            }
                        } else {
                            // Simulasi: Langsung hapus
                            if (user && id && id.length > 20 && id.includes('-') && !id.startsWith(coin)) {
                                supabase.from('active_trades').delete().eq('id', id).then();
                            }
                        }

                        // [FIX] Aktifkan cooldown jika ini adalah kerugian murni (Hard SL hit)
                        if (isHardSlHit && !isTPHit && parseFloat(netProfit) < 0) {
                            lastLossTimestampRef.current = Date.now();
                            addLog(`🧊 [COOLDOWN] Loss terdeteksi. Bot jeda 15 menit sebelum buka posisi baru.`, 'error');
                        }

                        setActiveTrades(prev => prev.filter(t => t.id !== id));
                    }

                } catch (err) {
                    console.error(`Gagal monitor ${coin}:`, err);
                }
                
                // Jeda 300ms antar koin yang dipantau agar API Indodax tidak memblokir kita
                await new Promise(res => setTimeout(res, 300));
            }
        }

        // [FIX] Cooldown Check: Jika sedang jeda setelah loss, jangan cari peluang baru (fokus monitor atau rest saja)
        const timeSinceLoss = Date.now() - lastLossTimestampRef.current;
        if (timeSinceLoss < LOSS_COOLDOWN_MS) {
            const minutesLeft = Math.ceil((LOSS_COOLDOWN_MS - timeSinceLoss) / 60000);
            setScannerStatus({ 
                message: `🧊 COOLDOWN: Market sedang tidak stabil. Jeda ${minutesLeft} menit lagi.`, 
                level: 'chill' 
            });
            setCurrentScanCoinDisplay('Mode Tenang');
            return; // Keluar dari loop peluang, lanjut monitoring di siklus berikutnya
        }

        // Logic Scan normal...
        setScannerStatus({ message: 'Mencari peluang... Anda bisa beristirahat.', level: 'chill' });

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
            const coinList = top20CoinsRef.current;
            const isFirstCycle = coinList.length === 0;
            const isFullCycleComplete = coinList.length > 0 && scanIndexRef.current % coinList.length === 0 && scanIndexRef.current > 0;

            // Refresh coin list on first run or after completing a full cycle
            if (isFirstCycle || isFullCycleComplete) {
                if (allCoins.length > 0) {
                    const sortedByVolatility = [...allCoins].sort((a, b) =>
                        Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0)
                    );
                    top20CoinsRef.current = sortedByVolatility.slice(0, 25);
                    // Clear recently scanned list when we start a new cycle
                    recentlyScannedRef.current.clear();
                    if (!isFirstCycle) {
                        addLog(`🔄 [SCANNER] Daftar koin diperbarui untuk siklus baru.`, 'info');
                    } else {
                        addLog(`🎯 [SCANNER] Fokus pada 25 koin dengan pergerakan tercepat hari ini.`, 'info');
                    }
                } else {
                    setCurrentScanCoinDisplay('...Connecting');
                    setScannerStatus({ message: 'Waiting for Market Data to Sync...', level: 'chill' });
                    return; // Tunggu data coinList siap
                }
            }

            const freshCoinList = top20CoinsRef.current;
            // Find a coin that hasn't been scanned recently
            let found = false;
            for (let attempt = 0; attempt < freshCoinList.length; attempt++) {
                const idx = (scanIndexRef.current + attempt) % freshCoinList.length;
                const candidate = freshCoinList[idx];
                if (!recentlyScannedRef.current.has(candidate.id)) {
                    targetCoin = candidate.id;
                    targetSymbol = candidate.symbol;
                    recentlyScannedRef.current.add(candidate.id);
                    // Limit set size to half the list so coins can be revisited
                    if (recentlyScannedRef.current.size >= Math.ceil(freshCoinList.length / 2)) {
                        const firstEntry = recentlyScannedRef.current.values().next().value;
                        recentlyScannedRef.current.delete(firstEntry);
                    }
                    found = true;
                    break;
                }
            }
            if (!found && freshCoinList.length > 0) {
                // Fallback: all coins recently scanned, just use modulo
                const targetCoinObj = freshCoinList[scanIndexRef.current % freshCoinList.length];
                targetCoin = targetCoinObj.id;
                targetSymbol = targetCoinObj.symbol;
            }
        }

        // Jalankan callback jika koin berubah (Optimasi: Hanya jika koin benar-benar berubah dan tidak terlalu sering)
        // Kita pindahkan ke bagian setelah TA ditemukan agar tidak merusak chart utama setiap detik
        /*
        if (targetCoin && onCoinChangeRef.current) {
            onCoinChangeRef.current(targetCoin);
        }
        */

        setCurrentScanCoinDisplay(isPortfolioAsset ? `📌 Aset: ${targetSymbol.toUpperCase()}` : `🔍 Scan: ${targetSymbol.toUpperCase()}`);
        setScannerStatus({ message: `Memindai ${targetSymbol.toUpperCase()}...`, level: 'info' });
        addLog(`🔍 Memindai ${targetSymbol.toUpperCase()}...`, 'info');


        try {
            let prices = [];
            let volumes = [];
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
                        // [NEW] Get Volume data
                        volumes = historyData.map(d => typeof d.Volume === 'string' ? parseFloat(d.Volume) : (d.Volume || 0));
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
                        setCurrentScanCoinDisplay(`📌 Memantau: ${targetSymbol.toUpperCase()} @Rp ${currentPrice.toLocaleString('id-ID')}`);
                        setScannerStatus({ message: `Memantau ${targetSymbol.toUpperCase()} (Hanya Harga).`, level: 'info' });

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

                // [PRO] VOLUME SURGE DETECTOR (Relative Volume / RVOL)
                let rvol = 1.0;
                if (volumes.length >= 11) {
                    const latestVol = volumes[volumes.length - 1];
                    const prevVols = volumes.slice(volumes.length - 11, volumes.length - 1);
                    const avgVol = prevVols.reduce((a, b) => a + b, 0) / prevVols.length;
                    rvol = avgVol > 0 ? (latestVol / avgVol) : 1.0;
                }

                // [FIX] SHARP DOWNTREND FILTER: Jangan beli jika 5 menit terakhir turun > 1% (Falling Knife protection)
                const isSharpDowntrend = parseFloat(momentumScore) < -1.0;
                if (isSharpDowntrend && (signal === 'STRONG_BUY' || signal === 'POTENTIAL_BUY')) {
                    addLog(`🧊 [PROTECTION] ${targetSymbol.toUpperCase()} sedang terjun bebas (${momentumScore}% dlm 5m). SKIP.`, 'chill');
                    scanIndexRef.current += 1;
                    return;
                }

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
                            setScannerStatus({ message: `Terjual ${targetSymbol.toUpperCase()}!`, level: 'success' });
                            fetchBalance(); // Refresh balance immediately after trade
                        } catch (err) {
                            addLog(`❌ Gagal Jual Portfolio: ${err.message}`, 'error');
                            setScannerStatus({ message: `Gagal menjual ${targetSymbol.toUpperCase()}.`, level: 'error' });
                        }
                    } else {
                        addLog(`🟢 SIMULASI: Aset ${targetSymbol.toUpperCase()} layak jual (Target tercapai/Overbought).`, 'success');
                        setScannerStatus({ message: `Simulasi jual untuk ${targetSymbol.toUpperCase()}.`, level: 'success' });
                    }
                }

                if ((signal === 'STRONG_BUY' || signal === 'POTENTIAL_BUY' || signal === 'MOMENTUM_UP') && !isPortfolioAsset) {
                    // Update chart global hanya saat menemukan sinyal menarik agar tidak berkedip terus menerus
                    if (onCoinChangeRef.current) {
                        onCoinChangeRef.current(targetCoin);
                    }
                    // --- [FIX] FILTER TREN 15m: Jangan beli di downtrend ---
                    try {
                        const pair15m = getPair(targetCoin);
                        const formattedPair15m = pair15m.toUpperCase().replace('_', '');
                        const to15 = Math.floor(Date.now() / 1000);
                        const from15 = to15 - (6 * 60 * 60); // 6 jam ke belakang untuk 15m TF
                        const histRes15m = await fetch(`https://indodax.com/tradingview/history_v2?symbol=${formattedPair15m}&tf=15&from=${from15}&to=${to15}`);
                        if (histRes15m.ok) {
                            const histData15m = await histRes15m.json();
                            if (Array.isArray(histData15m) && histData15m.length >= 20) {
                                const prices15m = histData15m.map(d => typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close);
                                // Hitung EMA20 pada 15m TF
                                const ema20_15m = calculateEMA(prices15m, 20);
                                const latestEma20 = ema20_15m[ema20_15m.length - 1];
                                const latestPrice15m = prices15m[prices15m.length - 1];

                                // [RELAXED] Jika sinyal adalah MOMENTUM_UP, kita abaikan filter Downtrend 15m 
                                // Karena momentum seringkali justru dimulai dari bawah EMA20 (Trend Reversal).
                                if (latestEma20 && latestPrice15m < latestEma20 * 0.99 && signal !== 'MOMENTUM_UP') {
                                    const reason = `Downtrend 15m (Harga @ Rp ${latestPrice15m.toLocaleString()} < EMA20 @ Rp ${latestEma20.toFixed(0)})`;
                                    addLog(`🚫 [FILTER 15m] ${targetSymbol.toUpperCase()}: ${reason}`, 'info');
                                    logRejection(targetSymbol, reason);
                                    return;
                                }
                            }
                        }
                    } catch (trendErr) {
                        console.warn('[Filter 15m] Gagal fetch data 15m:', trendErr.message);
                        // Jika gagal fetch 15m, lanjutkan (jangan block)
                    }

                    // --- KRITERIA PRO-TRADER: FILTER LIKUIDITAS & SPREAD ---
                    const coinData = allCoins.find(c => c.id === targetCoin);
                    const volumeIDR = coinData?.volumeIdr24h || 0;

                    const currentPriceValue = prices[prices.length - 1];
                    const priceStr = `Rp ${currentPriceValue.toLocaleString('id-ID')}`;

                    // 1. Filter Volume (Minimal 500 Juta IDR agar lebih inklusif)
                    if (volumeIDR < 500000000) {
                        const reason = `Volume 24h terlalu rendah (Rp ${volumeIDR.toLocaleString()})`;
                        addLog(`🚫 [FILTER] ${targetSymbol.toUpperCase()} @ ${priceStr} dilewati: ${reason}`, 'info');
                        logRejection(targetSymbol, reason);
                        return;
                    }

                    // 2. Filter Kedalaman Pasar (Order Book Analysis)
                    try {
                        const depthData = await fetchOrderBook(getPair(targetCoin));
                        if (depthData) {
                            const analysis = analyzeOrderBook(depthData);
                            
                            // Log analisis depth untuk transparansi
                            addLog(`📡 Depth Analysis: ${analysis.buyPressure.toFixed(1)}% Buy | Spread ${analysis.spread.toFixed(2)}%`, 'info');

                            // Filter 1: Spread (Maksimal 1.5% untuk scalping, 2.5% untuk momentum agresif)
                            const maxSpread = signal === 'MOMENTUM_UP' ? 2.5 : 1.5;
                            if (analysis.spread > maxSpread) {
                                const reason = `Spread terlalu lebar (${analysis.spread.toFixed(2)}% > Max ${maxSpread}%)`;
                                addLog(`🚫 [DEPTH] ${targetSymbol.toUpperCase()} @ ${priceStr} dilewati: ${reason}`, 'info');
                                logRejection(targetSymbol, reason);
                                return;
                            }

                            // Filter 2: Imbalance (Jangan beli jika tekanan jual > tekanan beli secara signifikan)
                            if (analysis.imbalance < -30) {
                                const reason = `Tekanan jual tinggi (Imbal: ${analysis.imbalance.toFixed(1)}%)`;
                                addLog(`🚫 [DEPTH] ${targetSymbol.toUpperCase()} @ ${priceStr} dilewati: ${reason}`, 'info');
                                logRejection(targetSymbol, reason);
                                return;
                            }

                            // Filter 3: Sell Walls (Tembok Jual)
                            const sellWalls = findMarketWalls(depthData.sell);
                            const bestBid = parseFloat(depthData.buy[0][0]);
                            const nearbySellWalls = sellWalls.filter(wall => wall.price < bestBid * 1.02); // Tembok dalam rentang 2%
                            
                            if (nearbySellWalls.length > 0) {
                                const reason = `Terhalang Tembok Jual dalam rentang 2%`;
                                addLog(`🚫 [DEPTH] ${targetSymbol.toUpperCase()} @ ${priceStr} dilewati: ${reason}`, 'info');
                                logRejection(targetSymbol, reason);
                                return;
                            }
                        }
                    } catch (depthErr) {
                        console.warn("Gagal analisis depth:", depthErr);
                        // Jika gagal fetch depth, lanjutkan (opsional, tapi lebih aman stop)
                    }

                    const currentIdrBalance = isSimulationRef.current ? simulatedBalance : balance.idr;

                    // Optimistic Execution: Jika balance.idr = 0 di mode LIVE, mungkin karena gagal sync TAPI.
                    // Biarkan Indodax API asli yang mereject jika saldo benar-benar kurang, daripada diblock sepihak oleh sistem.
                    if (isSimulationRef.current) {
                        if (simulatedBalance < tradeAmountRef.current) {
                            addLog(`⚠️ [SALDO KURANG] Simulasi Gagal. Saldo: Rp ${simulatedBalance.toLocaleString('id-ID')} | Butuh: Rp ${tradeAmountRef.current.toLocaleString('id-ID')}`, 'error');
                            return;
                        }
                    } else {
                        // Live mode
                        if (balance.idr > 0 && balance.idr < tradeAmountRef.current) {
                            addLog(`⚠️ [SALDO KURANG] Gagal eksekusi ${targetSymbol.toUpperCase()}. Saldo Aktual: Rp ${balance.idr.toLocaleString('id-ID')} | Butuh: Rp ${tradeAmountRef.current.toLocaleString('id-ID')}`, 'error');
                            return;
                        } else if (balance.idr === 0) {
                            console.warn("Cached balance is 0, but proceeding with optimistic order execution in case of stale cache.");
                        }
                    }

                    if (signal === 'STRONG_BUY' || signal === 'MOMENTUM_UP') {
                        // STRONG_BUY/MOMENTUM: Boleh sampai 4 posisi aktif
                        if (activeTradesRef.current.length >= 4) return;
                        
                        const msg = signal === 'STRONG_BUY' ? 
                            '🔥 [AKURASI TINGGI] Sinyal Teknis SANGAT KUAT (RSI+MACD+BB)!' : 
                            '🚀 [MOMENTUM] Breakout Terdeteksi! Tren sedang menguat.';

                        // [PRO] Momentum Spike Guard: Jika sinyal MOMENTUM_UP tetapi Volume tidak meledak (RVOL < 3), abaikan.
                        if (signal === 'MOMENTUM_UP' && rvol < 3.0) {
                            const reason = `Momentum lemah (RVOL: ${rvol.toFixed(1)}x < 3x)`;
                            addLog(`⏩ [SKIP] ${targetSymbol.toUpperCase()} @ Rp ${latestPrice.toLocaleString()}: ${reason}`, 'info');
                            logRejection(targetSymbol, reason);
                            scanIndexRef.current += 1;
                            return;
                        }
                        
                        addLog(`${msg} ${signal === 'MOMENTUM_UP' ? `(Volume Spike: ${rvol.toFixed(1)}x) ` : ''}Melewati konfirmasi AI untuk hemat API.`, 'success');
                        setScannerStatus({ message: `Sinyal BELI ${signal === 'STRONG_BUY' ? 'kuat' : 'momentum'} untuk ${targetCoin.toUpperCase()}!`, level: 'success' });
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

                        await executeScalpTrade(targetCoin, currentPrice, signal);
                    } else if (signal === 'POTENTIAL_BUY') {
                        // [FIX] POTENTIAL_BUY (Gemini-confirmed): Batasi hanya 2 posisi aktif (lebih konservatif)
                        if (activeTradesRef.current.length >= 2) {
                            addLog(`⏸️ [SLOT PENUH] Sinyal AI masuk tapi sudah ada ${activeTradesRef.current.length} posisi. Max 2 untuk sinyal POTENTIAL.`, 'info');
                            return;
                        }
                        addLog(`🔍 [Lapis 1] ${targetCoin.toUpperCase()} menunjukkan sinyal oversold. Mengirim ke Gemini untuk 'Deep Analysis'...`, 'info');

                        // Lapis 2: Konfirmasi Gemini
                        setScannerStatus({ message: `Menganalisis ${targetCoin.toUpperCase()}... Mohon tunggu!`, level: 'interest' });
                        const isApproved = await askGeminiConfirmation(targetCoin, prices);

                        if (isApproved) {
                            addLog(`🤖 [Lapis 2] GEMINI MENYETUJUI: Sinyal dikonfirmasi AI!`, 'success');
                            setScannerStatus({ message: `Gemini menyetujui BELI untuk ${targetCoin.toUpperCase()}!`, level: 'success' });
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

                            await executeScalpTrade(targetCoin, currentPrice, 'GEMINI_BUY');
                        } else {
                            const currentPriceForRejection = prices[prices.length - 1];
                            const priceStrRej = `Rp ${currentPriceForRejection.toLocaleString('id-ID')}`;
                            addLog(`🤖 [Lapis 2] Gemini MENOLAK sinyal ${targetCoin.toUpperCase()} @ ${priceStrRej}. Alasan: ${isApproved.reason}`, 'error');
                            logRejection(targetSymbol, `Ditepis AI @ ${priceStrRej}: ${isApproved.reason}`);
                            setScannerStatus({ message: `Gemini menolak ${targetSymbol.toUpperCase()}.`, level: 'warning' });
                        }
                    }
                } else if (!isPortfolioAsset) {
                    // Koin tidak ada di portfolio dan sinyal bukan BUY (Hold/Sell)
                    const techData = analyzeTechnicalIndicators(prices, true);
                    const currentPriceValue = prices[prices.length - 1];
                    const priceStr = `Rp ${currentPriceValue.toLocaleString('id-ID')}`;
                    const macdStr = techData.macdHist ? techData.macdHist.toFixed(2) : 'N/A';
                    
                    const reasonMsg = `Sinyal ${signal} (RSI: ${techData.rsi.toFixed(1)}, MACD: ${macdStr})`;
                    addLog(`⏩ [SKIP] ${targetSymbol.toUpperCase()} @ ${priceStr} dilewati: ${reasonMsg}`, 'info');
                    logRejection(targetSymbol, `Teknikal Lemah: ${reasonMsg}`);
                }
            } else if (isPortfolioAsset) {
                // FALLBACK: Untuk aset di dompet yang tidak punya data histori (misal IDT)
                // Kita tetap pantau harga terkininya saja
                try {
                    const ticker = await fetchTicker(getPair(targetCoin));
                    if (ticker) {
                        setCurrentScanCoinDisplay(`📌 Memantau: ${targetSymbol.toUpperCase()} @Rp ${parseFloat(ticker.last).toLocaleString('id-ID')}`);
                        setScannerStatus({ message: `Memantau ${targetSymbol.toUpperCase()} (Portofolio).`, level: 'info' });
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
                // Jika masih dalam tahap inisialisasi/koneksi, cek lagi lebih cepat (2 detik)
                // Jika sudah stabil, gunakan interval normal (7 detik)
                // [Fix 4] Percepat interval monitoring: 2s saat init, 5s normal (sebelumnya 7s)
                const delay = (currentScanCoinDisplay === '...Initialize' || currentScanCoinDisplay === '...Connecting') ? 2000 : 5000;
                loopRef.current = setTimeout(runScanner, delay);
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
    const toggleScanner = (forceVal) => {
        if (typeof forceVal === 'boolean') {
            setIsScanning(forceVal);
        } else {
            setIsScanning(!isScanning);
        }
    };
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

                // [Fix 2] Cancel Hard SL order di Indodax terlebih dahulu (anti double sell)
                if (trade.hardStopOrderId) {
                    cancelOrder(apiKey, secretKey, pair, trade.hardStopOrderId, 'sell')
                        .catch(e => console.warn(`[Force Sell] Gagal cancel Hard SL:`, e.message));
                }

                // Exec Real Sell if possible
                const info = await getUserInfo(apiKey, secretKey).catch(() => null);
                const coinBalanceCount = info?.balance[coin.split('-')[0].toLowerCase()] || 0;

                if (coinBalanceCount > 0) {
                    await tradeOrder(apiKey, secretKey, pair, 'sell', currentPrice, coinBalanceCount);
                    addLog(`🔴 [FORCE SELL] Real Trade: Sah terjual @Rp ${currentPrice.toLocaleString()}`, 'sell');
                    fetchBalance(); // Refresh balance immediately after trade
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
        scannerStatus,
        isCloudLoaded,
    };
};
