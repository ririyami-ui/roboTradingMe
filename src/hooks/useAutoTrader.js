import { useState, useEffect, useRef } from 'react';
import { useIndodaxAuth } from './useIndodaxAuth';
import { fetchTicker, getUserInfo, tradeOrder, cancelOrder, fetchSummaries } from '../utils/indodaxApi';
import { useCoinList } from './useCoinList';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';

export const useAutoTrader = (coinId, currentSignal) => {
    // 1. External Hooks
    const { apiKey, secretKey, hasKeys } = useIndodaxAuth();
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

    // 3. States
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const [balance, setBalance] = useState({ idr: 0, coin: 0, assets: [] });
    const [tradeAmount, setTradeAmount] = useState(() => {
        try {
            const saved = localStorage.getItem('traderTradeAmount');
            return saved ? parseInt(saved) : (cloudSettings?.tradeAmount || 50000);
        } catch (e) {
            return 50000;
        }
    });
    const [isSimulation, setIsSimulation] = useState(true);
    const [simulatedBalance, setSimulatedBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('traderSimulatedBalance');
            return saved ? parseFloat(saved) : 10000000;
        } catch (e) {
            return 10000000;
        }
    });
    const [activeTrade, setActiveTrade] = useState(null);
    const [tradeHistory, setTradeHistory] = useState(() => {
        try {
            const saved = localStorage.getItem('singleTradeHistory');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

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

    useEffect(() => { localStorage.setItem('singleTradeHistory', JSON.stringify(tradeHistory)); }, [tradeHistory]);

    // Initial fetch of cloud trades
    useEffect(() => {
        const initCloud = async () => {
            if (user) {
                try {
                    const [{ data: cloudTrades }, { data: profile }, { data: cloudHistory }] = await Promise.all([
                        supabase.from('active_trades').select('*').eq('user_id', user.id).eq('coin_id', coinId).eq('is_simulation', isSimulation),
                        supabase.from('profiles').select('last_is_simulation').eq('id', user.id).maybeSingle(),
                        supabase.from('trade_history').select('*').eq('user_id', user.id).eq('coin', coinId).eq('is_simulation', isSimulation).order('created_at', { ascending: false }).limit(20)
                    ]);

                    if (profile && profile.last_is_simulation !== undefined) {
                        setIsSimulation(profile.last_is_simulation);
                    }

                    if (cloudHistory && cloudHistory.length > 0) {
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
                            return cloudMapped;
                        });
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
                            highestPrice: parseFloat(t.highest_price || t.buy_price), // New trailing stop anchor
                            isSimulation: t.is_simulation,
                            id: t.id
                        });
                        buyPriceRef.current = parseFloat(t.buy_price);
                        setIsRunning(true); // Auto-resume if position is open
                    }
                } catch (err) {
                    console.error("Initial Cloud pull (Single) failed:", err);
                }
            }
        };
        initCloud();
    }, [user, coinId, isSimulation]);

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

            // Perbarui saldo riil setiap loop (untuk total estimasi aset)
            if (!isSimulation && hasKeys) {
                updateBalance();
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

                // Sync ke Cloud if peak is significant (debounced by margin to save API calls)
                if (shouldUpdateCloud && user && prev.id && newHighestPrice > (prev.highestPrice * 1.005)) {
                    supabase.from('active_trades').update({ highest_price: newHighestPrice }).eq('id', prev.id).then(null, () => { });
                }

                // Cek eksekusi Trailing SL (Ini terpisah dari currentSignal, meng-override)
                const trailingSLPercent = 3.0; // Fixed 3% for single trader, you can make this configurable later
                const dynamicSL = newHighestPrice * (1 - (trailingSLPercent / 100));
                const hardSL = prev.buyPrice * 0.95; // Absolute 5% loss limit

                const isTrailingHit = currentPrice <= dynamicSL && newHighestPrice > (prev.buyPrice * 1.01);
                const isHardSlHit = currentPrice <= hardSL;

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
                    addLog(`[Sinyal Beli] Menyiapkan order...`, 'info');
                    buyPriceRef.current = currentPrice;

                    if (isSimulation) {
                        addLog(`🟢 SIMULASI: Membeli ${coinId} senilai Rp ${currentTradeAmount.toLocaleString('id-ID')} pada harga Rp ${currentPrice.toLocaleString('id-ID')}`, 'buy');
                    } else {
                        try {
                            // Instant Buy: Pasang harga 0.2% lebih tinggi agar langsung match
                            const instantPrice = Math.ceil(currentPrice * 1.002);
                            const result = await tradeOrder(apiKey, secretKey, pair, 'buy', instantPrice, currentTradeAmount);
                            addLog(`🟢 REAL TRADE: Beli Eksekusi (INSTANT)! Order ID: ${result.order_id}`, 'buy');

                            // 3. Pasang Hard Stop Loss di Indodax sebagai pengaman (2.5% atau sesuai setelan)
                            try {
                                const slPrice = Math.floor(currentPrice * 0.95); // Hard SL 5% (Limit slightly below trigger)
                                const amountToSell = result.receive ? parseFloat(result.receive) : (currentTradeAmount / currentPrice) * 0.994;

                                const slResult = await tradeOrder(apiKey, secretKey, pair, 'sell', slPrice, amountToSell, {
                                    order_type: 'stoplimit',
                                    stop_price: Math.floor(currentPrice * 0.955) // Trigger di 4.5%
                                });
                                hardStopOrderIdRef.current = slResult.order_id;
                                addLog(`🛡️ SAFETY: Hard Stop Loss terpasang di Indodax (Trigger: Rp ${Math.floor(currentPrice * 0.955).toLocaleString()})`, 'success');
                            } catch (slErr) {
                                addLog(`⚠️ SAFETY WARNING: Gagal memasang Hard Stop Loss di Indodax: ${slErr.message}`, 'error');
                            }

                            updateBalance();
                        } catch (err) {
                            addLog(`🔴 REAL TRADE GAGAL: ${err.message}`, 'error');
                        }
                    }

                    const newTrade = {
                        coin: coinId,
                        buyPrice: currentPrice,
                        amount: currentTradeAmount / currentPrice,
                        currentPrice: currentPrice,
                        highestPrice: currentPrice,
                        // Menambahkan target untuk UI Radar (meskipun single mode berbasis sinyal)
                        targetTP: currentPrice * 1.025, // Estimasi 2.5% untuk UI
                        targetSL: currentPrice * 0.955   // Estimasi 4.5% untuk UI
                    };

                    // PERSIST TO CLOUD for Backend Safeguard (Now supports Simulation!)
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
                                    is_simulation: isSimulation,
                                    updated_at: new Date().toISOString()
                                }, { onConflict: 'user_id,coin_id' })
                                .select()
                                .maybeSingle();

                            if (dbTrade) {
                                newTrade.id = dbTrade.id;
                            }
                        } catch (dbErr) {
                            console.error("Gagal sinkron single trade ke Cloud:", dbErr);
                        }
                    }

                    setActiveTrade(newTrade);

                    if (isSimulation) {
                        setSimulatedBalance(prev => prev - currentTradeAmount);
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
                                        hardStopOrderIdRef.current = null;
                                    } catch (cErr) {
                                        console.warn("Gagal cancel Hard SL (Mungkin sudah tereksekusi):", cErr.message);
                                    }
                                }

                                const result = await tradeOrder(apiKey, secretKey, pair, 'sell', currentPrice, coinBalance);
                                addLog(`🔴 REAL TRADE: Jual Eksekusi! Order ID: ${result.order_id}`, 'sell');

                                // Persist real trade log to Cloud
                                if (user) {
                                    supabase.from('bot_logs').insert({
                                        user_id: user.id,
                                        message: `[REAL SELL] ${coinId.toUpperCase()} terjual melalui sinyal @Rp ${currentPrice.toLocaleString()}. Profit: ${profit}%`,
                                        type: parseFloat(profit) >= 0 ? 'profit' : 'loss'
                                    }).then(null, () => { });
                                }

                                updateBalance();

                                // Sync removal from Cloud
                                if (user && activeTrade?.id) {
                                    supabase.from('active_trades').delete().eq('id', activeTrade.id).then();
                                }

                                setActiveTrade(null);
                            } else {
                                addLog(`🔴 REAL TRADE GAGAL: Saldo koin tidak cukup untuk dijual`, 'error');
                            }
                        } catch (err) {
                            addLog(`🔴 REAL TRADE GAGAL: ${err.message}`, 'error');
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

    const toggleBot = () => setIsRunning(!isRunning);
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
        clearHistory
    };
};
