import React, { useState, useEffect, useRef } from 'react';
import { useAutoTrader } from '../hooks/useAutoTrader';
import { useAutoScanner } from '../hooks/useAutoScanner';
import { useCoinList } from '../hooks/useCoinList';
import { useBackgroundBot } from '../hooks/useBackgroundBot';
import { useAuth } from '../hooks/useAuth';
import SettingsModal from './SettingsModal';
import OpenOrdersList from './OpenOrdersList';

const TradingBotPanel = ({ coinId, setCoinId, currentSignal, onLogout, onScannerStatusChange, isSimulation, isScannerActive, onSimToggle, onModeChange, isMinimal }) => {
    const { user } = useAuth();
    const [showSettings, setShowSettings] = useState(false);
    const [activeTabPanel, setActiveTabPanel] = useState('history'); // 'history' or 'orders'
    const logContainerRef = useRef(null);
    const traderProps = useAutoTrader(coinId, currentSignal, isSimulation);
    const bgBotProps = useBackgroundBot(user);
    const scannerProps = useAutoScanner((newCoin) => {
        if (isScannerActive) {
            setCoinId(newCoin);
        }
    }, isSimulation);

    // Actually just use the prop directly to avoid state desync
    const currentBotMode = isScannerActive ? 'scanner' : 'single';
    const activeHook = currentBotMode === 'single' ? traderProps : scannerProps;

    // [FIX] Report ONLY scanning status to parent if needed, but don't tie it to 'isScannerActive' mode
    useEffect(() => {
        if (onScannerStatusChange && currentBotMode === 'scanner') {
            // onScannerStatusChange(scannerProps.isScanning); // Temporarily disabled to avoid feedback loop
        }
    }, [scannerProps.isScanning, currentBotMode, onScannerStatusChange]);


    const { categorizedCoins, loading: coinListLoading } = useCoinList();


    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [activeHook.logs]);

    // AUTO-RESUME: Jalankan bot otomatis jika status di cloud aktif saat startup
    const isFirstLoadRef = useRef(true);
    useEffect(() => {
        if (bgBotProps.isEnabled && isFirstLoadRef.current && !activeHook.isRunning) {
            // console.log("SaktiBot: Auto-resuming from cloud status...");
            activeHook.toggleBot(true);
            isFirstLoadRef.current = false;
        } else if (!bgBotProps.loading && isFirstLoadRef.current) {
            // Jika sudah selesai loading cloud dan tidak enabled, matikan flag first load
            isFirstLoadRef.current = false;
        }
    }, [bgBotProps.isEnabled, bgBotProps.loading, activeHook.isRunning]);

    return (
        <div className="bg-gray-800 rounded-xl shadow-md p-5 flex flex-col h-full border border-gray-700 font-sans">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-3">
                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                    <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Auto Trader AI
                </h2>
                <div className="flex items-center gap-2">
                    {traderProps.isSyncing && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-900/30 rounded-lg border border-cyan-800/30 animate-pulse" title="Cloud Syncing...">
                            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                            </svg>
                            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Sinkron</span>
                        </div>
                    )}
                    <button
                        onClick={() => setShowSettings(true)}
                        className="text-gray-400 hover:text-cyan-400 transition-colors p-1"
                        title="Pengaturan Bot"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </button>
                    <button
                        onClick={onLogout}
                        className="text-gray-400 hover:text-red-400 transition-colors p-1"
                        title="Logout"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>



            <div className="flex flex-col lg:flex-row gap-4 mb-4 items-stretch">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-3 border border-gray-700 shadow-lg flex-1 lg:flex-[3] flex flex-col justify-center">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Saldo Tersedia</span>
                        <div className={`text-[9px] px-1.5 py-0.5 rounded ${activeHook.isSimulation ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-800/30' : 'bg-green-900/40 text-green-400 border border-green-800/30'}`}>
                            {activeHook.isSimulation ? 'SIMULASI' : 'LIVE ACC'}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-gray-800 p-2 rounded-lg border border-gray-700 shadow-inner">
                            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.5-1c.11 0 .21-.01.31-.03M12 16c-1.11 0-2.08-.402-2.599-1M12 16v1m0-1v-8"></path>
                            </svg>
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Estimasi Nilai Aset</span>
                                <div className="text-cyan-400 font-mono text-2xl font-black tracking-tighter leading-none mb-2 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                                    Rp {activeHook.totalBalance.toLocaleString('id-ID')}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase">Saldo IDR:</span>
                                    <span className="text-white font-mono text-sm font-bold">
                                        {activeHook.balance ? (
                                            `Rp ${activeHook.balance.idr.toLocaleString('id-ID')}`
                                        ) : 'Rp 0'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {(activeHook.isSimulation || (activeHook.balance?.assets && activeHook.balance.assets.length > 0)) && (
                            <div className="flex-1 flex flex-col items-end border-l border-gray-700/50 pl-3 max-h-14 overflow-y-auto custom-scrollbar">
                                <div className="text-[9px] uppercase tracking-tighter text-gray-600 mb-1 font-bold">Crypto Assets</div>
                                <div className="grid grid-cols-1 gap-1 w-full max-w-[110px]">
                                    {activeHook.balance.assets.map(asset => asset.total > 0 && (
                                        <div key={asset.symbol} className="flex justify-between items-center bg-gray-800/40 px-1.5 py-0.5 rounded border border-gray-700/30">
                                            <span className="text-[9px] font-bold text-cyan-500/80">{asset.symbol}</span>
                                            <span className="text-[9px] font-mono text-gray-400">{asset.total.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 lg:flex-[2] grid grid-cols-2 gap-3 items-stretch">
                    <div className="bg-gray-700/50 rounded-lg p-3 flex flex-col justify-center border border-gray-600/30">
                        <p className="text-[11px] uppercase text-gray-500 mb-1 font-bold tracking-wider leading-none">Koin / Mode</p>
                        <div className="flex flex-col gap-1">
                            <select
                                value={currentBotMode}
                                onChange={(e) => onModeChange(e.target.value === 'scanner')}
                                disabled={activeHook.isRunning}
                                className="bg-gray-900 border border-gray-600 rounded text-xs px-1 py-1 text-white focus:outline-none"
                            >
                                <option value="single">Single Coin</option>
                                <option value="scanner">Auto Scanner</option>
                            </select>
                            {currentBotMode === 'single' ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center overflow-hidden border border-gray-600 p-1">
                                        <img
                                            src={`https://indodax.com/v2/logo/png/color/${coinId?.toLowerCase()}.png`}
                                            alt={coinId}
                                            className="w-full h-full object-contain"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = `https://ui-avatars.com/api/?name=${coinId}&background=0D8ABC&color=fff`;
                                            }}
                                        />
                                    </div>
                                    <select
                                        value={coinId}
                                        onChange={(e) => setCoinId(e.target.value)}
                                        disabled={activeHook.isRunning}
                                        className="bg-gray-800 border border-gray-600 rounded text-[11px] px-1 py-0.5 text-cyan-400 font-bold focus:outline-none flex-grow"
                                    >
                                        {Object.entries(categorizedCoins).map(([category, coins]) => (
                                            <optgroup key={category} label={category} className="bg-gray-800 text-gray-400 text-[10px]">
                                                {coins.map(c => (
                                                    <option key={c.id} value={c.id} className="text-white text-xs">
                                                        {c.symbol ? c.symbol.toUpperCase() : c.name}/IDR
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <p className="font-bold text-[13px] text-cyan-400 truncate">
                                    {scannerProps.currentScanCoin === 'Wait' ? 'Inisialisasi...' : scannerProps.currentScanCoin?.toUpperCase()}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-3 flex flex-col justify-center border border-gray-600/30">
                        <p className="text-[11px] uppercase text-gray-500 mb-1 font-bold tracking-wider leading-none">Status Bot</p>
                        <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${activeHook.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                            <span className={`font-bold text-sm ${activeHook.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                                {activeHook.isRunning ? 'BERJALAN' : 'BERHENTI'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3 mb-6">
                {/* Trading Level Selector - Premium Redesign */}
                <div className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 shadow-inner">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${isSimulation ? 'bg-cyan-500/10' : 'bg-red-500/10'}`}>
                                {isSimulation ? (
                                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4 text-red-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                )}
                             </div>
                            <div>
                                <span className="text-sm font-bold text-gray-200 block leading-tight">Level Trading</span>
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Mode Sistem</span>
                            </div>
                        </div>

                        <div className="flex items-center bg-gray-900/80 rounded-xl p-1 border border-gray-700/50">
                            <button
                                onClick={() => onSimToggle(true)}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${isSimulation ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-gray-500 hover:text-gray-300'}`}
                                disabled={activeHook.isRunning}
                            >
                                SIMULASI
                            </button>
                            <button
                                onClick={() => onSimToggle(false)}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${!isSimulation ? 'bg-red-600/20 text-red-500 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                                disabled={activeHook.isRunning}
                            >
                                LIVE TRADE
                            </button>
                        </div>
                    </div>
                    {!isSimulation && (
                        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-red-500/5 rounded border border-red-500/10">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                            <span className="text-[9px] text-red-400 font-bold tracking-tight">DANA ASLI BERISIKO: Gunakan dengan bijak.</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-gray-900/30 p-4 rounded-xl border border-gray-700/50 shadow-sm backdrop-blur-sm">
                    <div className="flex-1">
                        <h2 className="text-base font-black uppercase tracking-tight text-gray-100 mb-1 flex items-center gap-2">
                            <span className="w-1 h-4 bg-cyan-500 rounded-full"></span>
                            {currentBotMode === 'single' ? 'Single Trading' : 'Auto Scanner'} Mode
                        </h2>
                        {scannerProps.isScanning ? (
                            <div className={`flex items-center gap-2 text-[10px] font-bold transition-all duration-500
                                ${scannerProps.scannerStatus.level === 'chill' ? 'text-green-400' :
                                    scannerProps.scannerStatus.level === 'interest' ? 'text-yellow-400 animate-pulse' :
                                        'text-red-400 animate-pulse'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${scannerProps.scannerStatus.level === 'chill' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                                    scannerProps.scannerStatus.level === 'interest' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' :
                                        'bg-red-500'}`}
                                />
                                {scannerProps.scannerStatus.level === 'chill' ? 'SISTEM SIAGA: Menunggu pemindaian pasar' : scannerProps.scannerStatus.message}
                            </div>
                        ) : (
                            <div className="text-[10px] text-gray-500 italic">Siap untuk inisialisasi operasi trading</div>
                        )}
                    </div>

                    {/* Oracle Insight Section */}
                    {user && (
                        <div className="flex-1 lg:flex-none min-w-[180px] bg-cyan-900/10 border border-cyan-800/20 rounded-lg p-2 flex flex-col gap-1">
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black text-cyan-500 uppercase tracking-widest flex items-center gap-1">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    Oracle Insight
                                </span>
                                {(() => {
                                    const currentCoinKey = currentBotMode === 'single' ? (coinId.includes('-') ? coinId : `${coinId}-idr`) : (scannerProps.currentScanCoin ? `${scannerProps.currentScanCoin.toLowerCase()}-idr` : null);
                                    const config = bgBotProps.configs?.find(c => c.coin_id === currentCoinKey);
                                    const sentiment = config?.market_sentiment?.toUpperCase() || 'NEUTRAL';
                                    return (
                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${sentiment === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                                            sentiment === 'SATURATED' ? 'bg-red-500/20 text-red-400' :
                                                'bg-gray-500/20 text-gray-400'
                                            }`}>
                                            {sentiment}
                                        </span>
                                    );
                                })()}
                            </div>
                            <p className="text-[10px] text-cyan-100/80 leading-tight italic line-clamp-2">
                                {(() => {
                                    const currentCoinKey = currentBotMode === 'single' ? (coinId.includes('-') ? coinId : `${coinId}-idr`) : (scannerProps.currentScanCoin ? `${scannerProps.currentScanCoin.toLowerCase()}-idr` : null);
                                    const config = bgBotProps.configs?.find(c => c.coin_id === currentCoinKey);
                                    return config?.advice || "Waiting for Oracle analysis...";
                                })()}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col items-start mr-2 group">
                        <span className="text-[9px] text-gray-500 font-bold uppercase mb-1 ml-1 tracking-widest">Oracle Protection</span>
                        <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 h-[38px]">
                            {user ? (
                                <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[10px] animate-pulse">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    ACTIVE
                                </div>
                            ) : (
                                <span className="text-[10px] text-gray-500 font-bold">OFFLINE</span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col items-start">
                        <span className="text-[9px] text-gray-500 font-bold uppercase mb-1 ml-1 tracking-widest">Jumlah Beli (IDR)</span>
                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[10px] font-bold">Rp</span>
                            <input
                                type="number"
                                value={activeHook.tradeAmount}
                                onChange={(e) => activeHook.setTradeAmount(Number(e.target.value))}
                                disabled={activeHook.isRunning}
                                className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 w-28 text-right text-white text-xs font-mono focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner group-hover:border-gray-600"
                            />
                        </div>
                    </div>

                    <button
                        onClick={async () => {
                            const isStarting = !activeHook.isRunning;

                            // 1. Manage Background Bot automatically if user is logged in
                            if (user) {
                                try {
                                    if (isStarting) {
                                        // Starting: sync configs (Only for Real Trade, but toggle global enable for both to persist status)
                                        if (currentBotMode === 'single') {
                                            let formattedCoin = coinId;
                                            if (!formattedCoin.includes('-')) {
                                                const baseMap = { 'bitcoin': 'btc', 'ethereum': 'eth', 'tether': 'usdt', 'binancecoin': 'bnb', 'solana': 'sol', 'ripple': 'xrp', 'cardano': 'ada' };
                                                formattedCoin = `${baseMap[formattedCoin] || formattedCoin}-idr`;
                                            }
                                            await bgBotProps.updateCoinConfig(formattedCoin, activeHook.tradeAmount);
                                        } else {
                                            const topCoins = ['btc-idr', 'eth-idr', 'sol-idr', 'xrp-idr', 'doge-idr', 'ada-idr', 'dot-idr', 'link-idr', 'ltc-idr', 'trx-idr'];
                                            await bgBotProps.updateMultipleConfigs(topCoins, activeHook.tradeAmount);
                                        }
                                        await bgBotProps.toggleBackgroundBot(true);
                                    } else {
                                        // Stopping: disable background (ALWAYS toggle off when user stops)
                                        await bgBotProps.toggleBackgroundBot(false);
                                    }
                                } catch (e) {
                                    console.error("Cloud toggle fail:", e);
                                }
                            }

                            // 2. Toggle local bot
                            activeHook.toggleBot();
                        }}
                        className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all duration-300
                                ${activeHook.isRunning
                                ? 'bg-red-600/10 text-red-500 border border-red-500/30 hover:bg-red-600/20'
                                : 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-cyan-500/20 active:scale-95'
                            }`}
                    >
                        {activeHook.isRunning ? (
                            <span className="flex items-center gap-2 justify-center">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                                BERHENTI TRADING
                            </span>
                        ) : (
                            <span>MULAI TRADING</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Only show detail panels if not in minimal mode (e.g. for the 'Bot' tab on mobile) */}
            {!isMinimal && (
                <div className="mt-6 flex flex-col lg:flex-row gap-4 lg:h-[520px]">
                    {/* Activity Log */}
                    <div className="flex-none lg:flex-1 flex flex-col h-[350px] lg:h-full overflow-hidden border border-gray-700 rounded-lg bg-gray-900">
                        <div className="flex justify-between items-center p-3 border-b border-gray-800">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-gray-400">Log Aktivitas</h3>
                                {user && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] bg-cyan-900/40 text-cyan-400 border border-cyan-800/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest flex items-center gap-1" title="Background safeguarding is active via Supabase">
                                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></span>
                                            Oracle Protect
                                        </span>
                                        {bgBotProps.notificationPermission === 'granted' && bgBotProps.hasFcmToken && (
                                            <button
                                                onClick={bgBotProps.testNotification}
                                                className="text-[8px] bg-cyan-900/40 text-cyan-400 border border-cyan-800/30 px-1.5 py-0.5 rounded font-bold hover:bg-cyan-800/50 transition-colors uppercase tracking-widest flex items-center gap-1"
                                                title="Tes Notifikasi Sekarang"
                                            >
                                                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                                Test Notif
                                            </button>
                                        )}
                                        {(bgBotProps.notificationPermission !== 'granted' || !bgBotProps.hasFcmToken) && (
                                            <button
                                                onClick={bgBotProps.requestNotificationPermission}
                                                className={`text-[8px] px-1.5 py-0.5 rounded font-bold hover:opacity-80 transition-colors uppercase tracking-widest flex items-center gap-1 ${!bgBotProps.hasFcmToken && bgBotProps.notificationPermission === 'granted' ? 'bg-orange-900/40 text-orange-400 border border-orange-800/30' : 'bg-yellow-900/40 text-yellow-500 border border-yellow-800/30'}`}
                                                title={!bgBotProps.hasFcmToken && bgBotProps.notificationPermission === 'granted' ? "Daftarkan Perangkat Ini" : "Aktifkan Notifikasi Browser"}
                                            >
                                                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                                                {!bgBotProps.hasFcmToken && bgBotProps.notificationPermission === 'granted' ? 'Daftar' : 'Notif'}
                                            </button>
                                        )}
                                        <button 
                                            onClick={bgBotProps.resetServiceWorker}
                                            className="text-[8px] text-gray-600 hover:text-red-400 font-bold uppercase tracking-widest px-1.5 py-0.5 border border-gray-800 hover:border-red-900/30 rounded transition-all"
                                            title="Reset sistem notifikasi jika bermasalah"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button onClick={activeHook.clearLogs} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
                        </div>
                        <div ref={logContainerRef} className="p-3 flex-1 overflow-y-auto font-mono text-xs custom-scrollbar">
                            {/* Unified Log: Priority Local, fallback Cloud if stopped */}
                                    {activeHook.logs.length === 0 && user && bgBotProps.logs.length > 0 ? (
                                <div className="space-y-2 opacity-60">
                                    <p className="text-[10px] text-gray-500 text-center mb-2 italic">Menampilkan aktivitas Cloud terakhir...</p>
                                    {bgBotProps.logs.map((log, i) => (
                                        <div key={log.id || i} className="flex gap-2">
                                            <span className="text-gray-600 shrink-0">[{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                            <span className={`${log.type === 'error' ? 'text-red-400' : ''} ${log.type === 'buy' ? 'text-green-400 font-bold' : ''} ${log.type === 'sell' ? 'text-fuchsia-400 font-bold' : ''} ${!['error', 'buy', 'sell'].includes(log.type) ? 'text-cyan-300/70' : ''}`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : activeHook.logs.length === 0 ? (
                                <p className="text-gray-500 italic text-center mt-4">Bot siaga...</p>
                            ) : (
                                <div className="space-y-2">
                                    {activeHook.logs.map(log => (
                                        <div key={log.id} className="flex gap-2">
                                            <span className="text-gray-500 shrink-0">[{log.time}]</span>
                                            <span className={`${log.type === 'error' ? 'text-red-400' : ''} ${log.type === 'success' ? 'text-green-400' : ''} ${log.type === 'info' ? 'text-blue-300' : ''} ${log.type === 'buy' ? 'text-cyan-400 font-bold' : ''} ${log.type === 'sell' ? 'text-fuchsia-400 font-bold' : ''}`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Trade Radar Monitor - beside Activity Log */}
                    <div className="lg:w-[280px] flex flex-col gap-4 lg:h-full overflow-hidden">
                        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 flex flex-col shrink-0 overflow-hidden relative" style={{ minHeight: '14rem' }}>
                            <div className="flex justify-between items-center border-b border-gray-700 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Trade Radar</span>
                                <span className="text-[9px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700">
                                    {(() => {
                                        const allTrades = [
                                            ...(traderProps.activeTrade ? [traderProps.activeTrade] : []),
                                            ...(scannerProps.activeTrades || [])
                                        ];
                                        const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values());
                                        return uniqueTrades.filter(t => t.isSimulation === activeHook.isSimulation).length;
                                    })()}/4 Aktif
                                </span>
                            </div>

                            {(() => {
                                const allTrades = [
                                    ...(traderProps.activeTrade ? [traderProps.activeTrade] : []),
                                    ...(scannerProps.activeTrades || [])
                                ];

                                // De-duplicate by ID to be safe
                                const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values());
                                const filteredTrades = uniqueTrades.filter(t => t.isSimulation === activeHook.isSimulation);

                                /* [REMOVE] Redundant Log
                                if (filteredTrades.length > 0) {
                                    console.log(`SaktiBot: Radar rendering ${filteredTrades.length} trades.`);
                                }
                                */

                                if (!activeHook.isCloudLoaded) {
                                    return (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center">
                                            <div className="w-10 h-10 mb-2 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
                                            <p className="text-[10px] uppercase tracking-widest animate-pulse">Syncing Cloud...</p>
                                        </div>
                                    );
                                }

                                if (filteredTrades.length === 0) {
                                    return (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center">
                                            <svg className="w-10 h-10 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                            <p className="text-[10px]">Mencari peluang trade...</p>
                                            {activeHook.isRunning && (
                                                <div className="mt-2 flex gap-1">
                                                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        className="flex overflow-x-auto snap-x snap-mandatory pb-1"
                                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
                                    >
                                        {filteredTrades.map(trade => {
                                            const pnl = trade.currentPrice ? (((trade.currentPrice - trade.buyPrice) / trade.buyPrice) * 100).toFixed(2) : '0.00';
                                            const isProfit = parseFloat(pnl) >= 0;
                                            const positionPercent = (() => {
                                                if (!trade.currentPrice) return 50;

                                                const highestPrice = trade.highestPrice || trade.buyPrice;
                                                const trailingSL = highestPrice * 0.97; // Using 3% as visual reference

                                                if (trade.currentPrice >= trade.buyPrice) {
                                                    const range = highestPrice - trade.buyPrice;
                                                    return 50 + (range > 0 ? ((trade.currentPrice - trade.buyPrice) / range) * 50 : 0);
                                                } else {
                                                    const range = trade.buyPrice - trailingSL;
                                                    return 50 - (range > 0 ? ((trade.buyPrice - trade.currentPrice) / range) * 50 : 0);
                                                }
                                            })();
                                            const clamped = Math.max(0, Math.min(100, positionPercent));

                                            return (
                                                <div key={`radar-trade-${trade.id}`} className="snap-start shrink-0" style={{ width: '100%', minWidth: '100%' }}>
                                                    <div className="flex justify-between items-center mb-1.5">
                                                        <span className="text-gray-400 text-[11px]">Aktif: <strong className="text-cyan-400 text-xs uppercase">{trade.coin}</strong></span>
                                                        <span className={`text-base font-mono font-black animate-pulse ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{isProfit ? '+' : ''}{pnl}%</span>
                                                        <button
                                                            onClick={() => activeHook.forceSell(trade.id || activeHook.trade?.id)}
                                                            className="ml-auto p-1.5 bg-red-900/30 hover:bg-red-600/40 text-red-500 rounded border border-red-800/30 transition-all group/force"
                                                            title="Force Sell (Exit Manual)"
                                                        >
                                                            <svg className="w-3.5 h-3.5 group-hover/force:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <div className="space-y-1 mb-2">
                                                        <div className="flex justify-between items-center bg-gray-800/30 px-2 py-0.5 rounded text-[10px]">
                                                            <span className="text-gray-500">Buy</span>
                                                            <strong className="text-white">Rp {trade.buyPrice.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</strong>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-cyan-900/20 border border-cyan-800/30 px-2 py-0.5 rounded text-[10px]">
                                                            <span className="text-cyan-500/80" title="Highest Price Seen">Peak</span>
                                                            <strong className="text-cyan-400">Rp {(trade.highestPrice || trade.buyPrice).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</strong>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-red-900/10 border border-red-800/20 px-2 py-0.5 rounded text-[10px]">
                                                            <span className="text-red-500/70" title={`Trailing Stop Loss (-${activeHook.stopLossPercent || 1.5}% from Peak)`}>Trail SL</span>
                                                            <strong className="text-red-400">Rp {((trade.highestPrice || trade.buyPrice) * (1 - ((activeHook.stopLossPercent || 1.5) / 100))).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</strong>
                                                        </div>
                                                    </div>
                                                    {/* Radar bar */}
                                                    <div className="px-1">
                                                        <div className="flex justify-between text-[8px] font-bold uppercase mb-0.5">
                                                            <span className="text-red-500">Loss</span>
                                                            <span className="text-green-500">Profit</span>
                                                        </div>
                                                        <div className="relative h-2 w-full bg-gray-800 rounded-full border border-gray-700 overflow-hidden">
                                                            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-gray-700/10 to-green-500/20"></div>
                                                            <div className={`absolute top-0 bottom-0 transition-all duration-700 ${isProfit ? 'bg-green-500/40' : 'bg-red-500/40'}`}
                                                                style={{ left: isProfit ? '50%' : `${clamped}%`, right: isProfit ? `${100 - clamped}%` : '50%' }}
                                                            />
                                                            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-500 z-10"></div>
                                                            <div className={`absolute top-0 bottom-0 w-1.5 z-20 transition-all duration-1000 ${isProfit ? 'bg-green-400' : 'bg-red-400'}`}
                                                                style={{ left: `calc(${clamped}% - 3px)` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {/* Dots indicator if more than 1 trade */}
                            {activeHook.activeTrades && activeHook.activeTrades.length > 1 && (
                                <div className="flex justify-center gap-1 mt-2">
                                    {activeHook.activeTrades.map((t, i) => (
                                        <div key={`radar-dot-${i}`} className="w-1 h-1 rounded-full bg-cyan-500/60"></div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => setActiveTabPanel('history')}
                                        className={`text-xs font-bold uppercase tracking-tighter transition-all ${activeTabPanel === 'history' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-400'}`}
                                    >
                                        Riwayat
                                    </button>
                                    <button 
                                        onClick={() => setActiveTabPanel('orders')}
                                        className={`text-xs font-bold uppercase tracking-tighter transition-all ${activeTabPanel === 'orders' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-400'}`}
                                    >
                                        Order Terbuka
                                    </button>
                                </div>
                                {activeTabPanel === 'history' && (
                                    <button onClick={activeHook.clearHistory} className="text-[10px] text-gray-600 hover:text-gray-400 uppercase font-bold">Clear</button>
                                )}
                            </div>

                            {activeTabPanel === 'history' ? (
                                <div className="bg-gray-900 rounded-lg p-3 flex-1 border border-gray-700 flex flex-col overflow-y-auto max-h-[300px] min-h-[150px] scrollbar-thin scrollbar-thumb-gray-800">
                                {!activeHook.tradeHistory || activeHook.tradeHistory.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-600 text-[10px] italic">
                                        Belum ada history trade.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {activeHook.tradeHistory.map(item => (
                                            <div key={`history-item-${item.id}`} className="bg-gray-800/40 border-l-2 border-gray-700 p-2 rounded-r flex justify-between items-center">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white uppercase">{item.coin}</span>
                                                    <span className="text-[9px] text-gray-500">{item.time}</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-xs font-black ${(item.type || '').toUpperCase() === 'PROFIT' ? 'text-green-400' : 'text-red-400'}`}>
                                                        {(item.type || '').toUpperCase() === 'PROFIT' ? '+' : ''}{item.profit || '0.00'}%
                                                    </div>
                                                    <div className="text-[10px] text-gray-500">Rp {(item.sellPrice || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col overflow-hidden min-h-[150px]">
                                    <OpenOrdersList coinId={coinId} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                notificationPermission={bgBotProps.notificationPermission}
                requestNotificationPermission={bgBotProps.requestNotificationPermission}
            />
        </div >
    );
};

export default TradingBotPanel;
