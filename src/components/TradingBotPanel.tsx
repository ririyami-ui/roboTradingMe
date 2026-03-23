import React, { useState, useEffect, useRef } from 'react';
import { 
  useAutoTrader, 
  useAutoScanner, 
  useCoinList, 
  useBackgroundBot, 
  useAuth 
} from '../hooks';
import SettingsModal from './SettingsModal';
import OpenOrdersList from './OpenOrdersList';
import StrategyCard from './StrategyCard';
import { useIndodaxAuth } from '../hooks/useIndodaxAuth';

interface TradingBotPanelProps {
  coinId: string;
  setCoinId: (coinId: string) => void;
  currentSignal: any; // Ideally this should be specialized but we'll use any for now
  onLogout: () => void;
  onScannerStatusChange?: (isScanning: boolean) => void;
  isSimulation: boolean;
  isScannerActive: boolean;
  onSimToggle: (val: boolean) => void;
  onModeChange: (isScanner: boolean) => void;
  isMinimal?: boolean;
}

const TradingBotPanel: React.FC<TradingBotPanelProps> = ({ 
  coinId, 
  setCoinId, 
  currentSignal, 
  onLogout, 
  onScannerStatusChange, 
  isSimulation, 
  isScannerActive, 
  onSimToggle, 
  onModeChange, 
  isMinimal 
}) => {
    // ---- HELPER: Price Range Indicator Lines ----
    const PriceRangeIndicator = ({ current, buy, tp, sl }: { current: number, buy: number, tp: number, sl: number }) => {
        const min = Math.min(sl, buy, current);
        const max = Math.max(tp, buy, current);
        const total = max - min || 1;
        
        const getX = (val: number) => ((val - min) / total) * 100;
        
        const slX = getX(sl);
        const buyX = getX(buy);
        const tpX = getX(tp);
        const curX = getX(current);

        return (
            <div className="w-full h-8 mt-2 mb-1 relative flex flex-col justify-end">
                {/* Horizontal Base Line */}
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gray-700 -translate-y-1/2 rounded-full"></div>
                
                {/* Markers */}
                <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" style={{ left: `${slX}%`, marginLeft: '-3px' }} title="Stop Loss"></div>
                <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-gray-900" style={{ left: `${buyX}%`, marginLeft: '-4px' }} title="Entry Price"></div>
                <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" style={{ left: `${tpX}%`, marginLeft: '-3px' }} title="Take Profit"></div>
                
                {/* Current Price Pointer */}
                <div className="absolute top-0 transition-all duration-500 ease-out flex flex-col items-center" style={{ left: `${curX}%`, marginLeft: '-6px' }}>
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-cyan-400"></div>
                </div>

                {/* Labels */}
                <div className="flex justify-between w-full mt-3 text-[7px] font-bold text-gray-500 uppercase tracking-tighter">
                    <span style={{ marginLeft: `${Math.max(0, slX - 2)}%` }}>SL</span>
                    <span style={{ position: 'absolute', left: `${buyX}%`, transform: 'translateX(-50%)' }}>BELI</span>
                    <span style={{ marginRight: `${Math.max(0, 100 - tpX - 2)}%` }}>TP</span>
                </div>
            </div>
        );
    };

    const { user } = useAuth();
    const [showSettings, setShowSettings] = useState(false);
    const [activeTabPanel, setActiveTabPanel] = useState<'history' | 'orders'>('history');
    const logContainerRef = useRef<HTMLDivElement>(null);
    const { tradingStrategy, takeProfit, stopLoss } = useIndodaxAuth();
    
    const traderProps = useAutoTrader(coinId, currentSignal, isSimulation);
    const bgBotProps = useBackgroundBot(user);
    const scannerProps = useAutoScanner((newCoin: string) => {
        if (isScannerActive) {
            setCoinId(newCoin);
        }
    }, isSimulation);

    const currentBotMode = isScannerActive ? 'scanner' : 'single';
    const activeHook = currentBotMode === 'single' ? traderProps : scannerProps;

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [activeHook.logs]);

    const isFirstLoadRef = useRef(true);
    useEffect(() => {
        if (bgBotProps.isEnabled && isFirstLoadRef.current && !activeHook.isRunning) {
            activeHook.toggleBot(true);
            isFirstLoadRef.current = false;
        } else if (!bgBotProps.loading && isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
        }
    }, [bgBotProps.isEnabled, bgBotProps.loading, activeHook.isRunning, activeHook]);

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
                <div className="flex-1 lg:flex-[3] flex flex-col gap-3">
                    <div className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-500 shadow-lg ${activeHook.isBotActive ? 'bg-gradient-to-r from-cyan-900/40 to-blue-900/30 border-cyan-500/40' : 'bg-gray-800/40 border-gray-700/50 grayscale'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${activeHook.isBotActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-700 text-gray-500'}`}>
                                <svg className={`w-5 h-5 ${activeHook.isBotActive ? 'animate-spin-slow' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className={`text-sm font-black uppercase tracking-tighter ${activeHook.isBotActive ? 'text-white' : 'text-gray-500'}`}>Saklar Global Bot</h3>
                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                    {activeHook.isBotActive 
                                        ? (() => {
                                            const names: Record<string, string> = {
                                                DYNAMIC_AUTO: 'SaktiBot Auto (Hybrid Mode)',
                                                SCALPER_5M: 'Sakti Scalper 5M (Balanced)',
                                                EMA_SCALPING: 'EMA Scalping (Trend Follow)',
                                                OVERSOLD_REBOUND: 'Oversold Hunter (Dip Buyer)',
                                                SCALPING: 'Pure Scalping (High Freq)',
                                                MICRO_SCALPING: 'Micro Scalping (Extreme)',
                                                DAY_TRADING: 'Day Trading (Daily)',
                                                SWING_TRADING: 'Swing Trading (Long Hold)'
                                            };
                                            return names[tradingStrategy] || 'SaktiBot Aktif';
                                        })()
                                        : 'Seluruh Bot Dimatikan'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => activeHook.toggleGlobalBot(!activeHook.isBotActive)}
                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 focus:outline-none ${activeHook.isBotActive ? 'bg-cyan-500 ring-2 ring-cyan-500/30 ring-offset-2 ring-offset-gray-900' : 'bg-gray-700'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${activeHook.isBotActive ? 'translate-x-8' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-3 border border-gray-700 shadow-lg flex flex-col justify-center">
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
            </div>

                <div className="flex-1 lg:flex-[2] grid grid-cols-2 gap-3 items-stretch">
                    <div className="bg-gray-700/50 rounded-lg p-3 flex flex-col justify-center border border-gray-600/30">
                        <p className="text-[11px] uppercase text-gray-500 mb-1 font-bold tracking-wider leading-none">Koin / Mode</p>
                        <div className="flex flex-col gap-1">
                            <select
                                value={currentBotMode}
                                onChange={(e) => onModeChange(e.target.value === 'scanner')}
                                disabled={activeHook.isRunning || (scannerProps as any).cooldownRemaining}
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
                                            onError={(e: any) => {
                                                e.target.onerror = null;
                                                e.target.src = `https://ui-avatars.com/api/?name=${coinId}&background=0D8ABC&color=fff`;
                                            }}
                                        />
                                    </div>
                                    <select
                                        value={coinId}
                                        onChange={(e) => setCoinId(e.target.value)}
                                        disabled={activeHook.isRunning || (scannerProps as any).cooldownRemaining}
                                        className="bg-gray-800 border border-gray-600 rounded text-[11px] px-1 py-0.5 text-cyan-400 font-bold focus:outline-none flex-grow"
                                    >
                                        <option value={coinId}>{coinId.toUpperCase()}</option>
                                        {/* Coin options will be populated by CoinList if available, otherwise fallback */}
                                    </select>
                                </div>
                            ) : (
                                <p className="font-bold text-[13px] text-cyan-400 truncate">
                                    {(scannerProps as any).currentScanCoin === 'Wait' ? 'Inisialisasi...' : (scannerProps as any).currentScanCoin?.toUpperCase()}
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

            <StrategyCard 
                strategy={tradingStrategy} 
                tp={takeProfit} 
                sl={stopLoss} 
            />

            <div className="space-y-3 mb-6">
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
                                disabled={activeHook.isRunning || (scannerProps as any).cooldownRemaining}
                            >
                                SIMULASI
                            </button>
                            <button
                                onClick={() => onSimToggle(false)}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${!isSimulation ? 'bg-red-600/20 text-red-500 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                                disabled={activeHook.isRunning || (scannerProps as any).cooldownRemaining}
                            >
                                LIVE TRADE
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-gray-900/30 p-4 rounded-xl border border-gray-700/50 shadow-sm backdrop-blur-sm">
                    <div className="flex-1">
                        <h2 className="text-base font-black uppercase tracking-tight text-gray-100 mb-1 flex items-center gap-2">
                            <span className="w-1 h-4 bg-cyan-500 rounded-full"></span>
                            {currentBotMode === 'single' ? 'Single Trading' : 'Auto Scanner'} Mode
                        </h2>
                        {(scannerProps as any).isScanning ? (
                            <div className={`flex items-center gap-2 text-[10px] font-bold transition-all duration-500
                                ${(scannerProps as any).scannerStatus.level === 'chill' ? 'text-green-400' :
                                    (scannerProps as any).scannerStatus.level === 'interest' ? 'text-yellow-400 animate-pulse' :
                                        'text-red-400 animate-pulse'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${(scannerProps as any).scannerStatus.level === 'chill' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                                    (scannerProps as any).scannerStatus.level === 'interest' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' :
                                        'bg-red-500'}`}
                                />
                                {(scannerProps as any).cooldownRemaining ? (
                                    <span className="flex items-center gap-2">
                                        <span className="text-cyan-400 animate-pulse">🧊 {(scannerProps as any).scannerStatus.message}</span>
                                    </span>
                                ) : (
                                    (scannerProps as any).scannerStatus.level === 'chill' ? 'SISTEM SIAGA: Menunggu pemindaian pasar' : (scannerProps as any).scannerStatus.message
                                )}
                            </div>
                        ) : (
                            <div className="text-[10px] text-gray-500 italic">Siap untuk inisialisasi operasi trading</div>
                        )}
                    </div>

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
                                disabled={activeHook.isRunning || (scannerProps as any).cooldownRemaining}
                                className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 w-28 text-right text-white text-xs font-mono focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner group-hover:border-gray-600"
                            />
                        </div>
                    </div>

                    <button
                        onClick={async () => {
                            if (window.confirm("🚨 PANIC EXIT: Apakah Anda yakin ingin menghentikan SEMUA trading dan menjual SEMUA aset aktif sekarang?")) {
                                await activeHook.panicSellAll();
                            }
                        }}
                        className={`flex-none px-4 py-2.5 rounded-lg font-black text-[11px] uppercase tracking-tighter shadow-lg transition-all duration-300 bg-red-600 text-white hover:bg-red-700 active:scale-95 flex items-center gap-2 ${(!activeHook.activeTrades || (activeHook.activeTrades.length === 0 && !(activeHook as any).activeTrade)) ? 'opacity-30 grayscale cursor-not-allowed' : 'animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.4)]'}`}
                        disabled={!activeHook.activeTrades || (activeHook.activeTrades.length === 0 && !(activeHook as any).activeTrade)}
                        title="PANIC SELL ALL: Jual seluruh posisi aktif segera!"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        PANIC EXIT
                    </button>

                    <button
                        onClick={async () => {
                            const isStarting = !activeHook.isRunning;
                            if (user) {
                                try {
                                    if (isStarting) {
                                        if (currentBotMode === 'single') {
                                            let formattedCoin = coinId;
                                            if (!formattedCoin.includes('-')) {
                                                const baseMap: Record<string, string> = { 'bitcoin': 'btc', 'ethereum': 'eth', 'tether': 'usdt', 'binancecoin': 'bnb', 'solana': 'sol', 'ripple': 'xrp', 'cardano': 'ada' };
                                                formattedCoin = `${baseMap[formattedCoin] || formattedCoin}-idr`;
                                            }
                                            await bgBotProps.updateCoinConfig(formattedCoin, activeHook.tradeAmount);
                                        } else {
                                            const topCoins = ['btc-idr', 'eth-idr', 'sol-idr', 'xrp-idr', 'doge-idr', 'ada-idr', 'dot-idr', 'link-idr', 'ltc-idr', 'trx-idr'];
                                            await bgBotProps.updateMultipleConfigs(topCoins, activeHook.tradeAmount);
                                        }
                                    }
                                } catch (e) {
                                    console.error("Cloud config fail:", e);
                                }
                            }
                            
                            // Let the activeHook manage state instead of calling bgBotProps directly,
                            // preventing a race condition where settings.isBotActive overwrites it.
                            if (currentBotMode === 'scanner') {
                                (activeHook as any).toggleBot(isStarting);
                            } else {
                                (activeHook as any).toggleGlobalBot(isStarting);
                            }
                            
                            // Important: Set the global bot state as well
                            activeHook.toggleGlobalBot(isStarting);
                            
                            // Explicit manual override to prevent "auto-start on reload" race
                            if (user && !isStarting) {
                                await bgBotProps.toggleBackgroundBot(false);
                            }
                        }}
                        className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all duration-300
                                ${activeHook.isRunning
                                ? 'bg-red-600/10 text-red-500 border border-red-500/30 hover:bg-red-600/20'
                                : 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-cyan-500/20 active:scale-95'
                            } ${(scannerProps as any).cooldownRemaining ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                        disabled={(scannerProps as any).cooldownRemaining}
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

            {!isMinimal && (
                <div className="mt-6 flex flex-col lg:flex-row gap-4 lg:h-[520px]">
                    <div className="flex-none lg:flex-1 flex flex-col h-[350px] lg:h-full overflow-hidden border border-green-900/40 rounded-lg bg-black font-mono shadow-[inset_0_0_20px_rgba(0,0,0,1)]">
                        <div className="flex justify-between items-center px-3 py-1.5 border-b border-green-900/30 bg-[#050505]">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500/80 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                                <h3 className="text-[10px] font-bold text-green-500/80 uppercase tracking-widest">root@saktibot:~# tail -f /var/log/trading</h3>
                            </div>
                            <button onClick={activeHook.clearLogs} className="text-[10px] uppercase font-bold text-green-800 hover:text-green-400 transition-colors">CLS</button>
                        </div>
                        <div ref={logContainerRef} className="p-2 flex-1 overflow-y-auto text-[11px] leading-[1.3] custom-scrollbar selection:bg-green-900 selection:text-green-100">
                                    {activeHook.logs.length === 0 && user && bgBotProps.logs.length > 0 ? (
                                <div className="space-y-1 opacity-80">
                                    <p className="text-green-700/60 text-center mb-2 italic">Fetching cloud instances...</p>
                                    {bgBotProps.logs.map((log: any, i: number) => (
                                        <div key={log.id || i} className="flex gap-2">
                                            <span className="text-green-800 shrink-0">[{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                            <span className={`${log.type === 'error' ? 'text-red-500' : ''} ${log.type === 'buy' ? 'text-cyan-400 font-bold' : ''} ${log.type === 'sell' ? 'text-fuchsia-400 font-bold' : ''} ${!['error', 'buy', 'sell'].includes(log.type) ? 'text-green-500/80' : ''}`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : activeHook.logs.length === 0 ? (
                                <p className="text-green-800 italic mt-2 animate-pulse">_ menunggu intervensi sistem...</p>
                            ) : (
                                <div className="space-y-[2px] flex flex-col pb-2">
                                    {activeHook.logs.map((log: any) => {
                                        const isErr = log.type === 'error';
                                        const isOk = log.type === 'success';
                                        const isBuy = log.type === 'buy';
                                        const isSell = log.type === 'sell';
                                        
                                        const textColor = isErr ? 'text-red-500 font-bold' : 
                                                          isOk ? 'text-green-400 font-bold' : 
                                                          isBuy ? 'text-cyan-400 font-bold' : 
                                                          isSell ? 'text-fuchsia-400 font-bold' : 
                                                          'text-green-500/70';

                                        const parts = log.message.split(' | ');

                                        return (
                                            <div key={log.id} className={`flex flex-col w-full px-1 hover:bg-green-900/10 ${textColor}`}>
                                                <div className="flex gap-2">
                                                    <span className="text-green-800/60 font-bold shrink-0">[{log.time}]</span>
                                                    <span className="break-words">
                                                        <span className="text-green-700/50 font-bold mr-1">{'>'}</span> 
                                                        {parts[0]}
                                                    </span>
                                                </div>
                                                {parts.length > 1 && (
                                                    <div className="pl-[52px] text-[10px] text-green-700/50 italic break-words">
                                                        ╰─ {parts.slice(1).join(' | ')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="lg:w-[280px] flex flex-col gap-4 lg:h-full overflow-hidden">
                        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 flex flex-col shrink-0 overflow-hidden relative" style={{ minHeight: '14rem' }}>
                            <div className="flex justify-between items-center border-b border-gray-700 pb-1.5 mb-2">
                                <span className="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Trade Radar</span>
                                <span className="text-[9px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700">
                                    {(() => {
                                        const allTrades = [
                                            ...((traderProps as any).activeTrade ? [(traderProps as any).activeTrade] : []),
                                            ...((scannerProps as any).activeTrades || [])
                                        ];
                                        const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values());
                                        return uniqueTrades.filter(t => t.isSimulation === activeHook.isSimulation).length;
                                    })()}/4 Aktif
                                </span>
                            </div>

                            {(() => {
                                const allTrades = [
                                    ...((traderProps as any).activeTrade ? [(traderProps as any).activeTrade] : []),
                                    ...((scannerProps as any).activeTrades || [])
                                ];

                                const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values());
                                const filteredTrades = uniqueTrades.filter(t => t.isSimulation === activeHook.isSimulation);

                                if (!(activeHook as any).isCloudLoaded) {
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
                                                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                                                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                                                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        className="flex overflow-x-auto snap-x snap-mandatory pb-1"
                                        style={{ scrollbarWidth: 'none' }}
                                    >
                                        {filteredTrades.map((trade: any) => {
                                            const rawPnl = trade.currentPrice ? (((trade.currentPrice - trade.buyPrice) / trade.buyPrice) * 100) : 0;
                                            const pnl = (rawPnl - 0.51).toFixed(2);
                                            const isProfit = parseFloat(pnl) >= 0;
                                            
                                            return (
                                                <div key={`radar-trade-${trade.id}`} className="snap-start shrink-0" style={{ width: '100%', minWidth: '100%' }}>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-tight">Aktif</span>
                                                            <span className="text-cyan-400 text-lg font-black leading-tight italic uppercase">{trade.coin}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`text-xl font-mono font-black animate-pulse ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                                                {isProfit ? '+' : ''}{pnl}%
                                                            </div>
                                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{trade.isSimulation ? 'VIRTUAL' : 'REAL'}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Price Range Visual Indicator */}
                                                    <PriceRangeIndicator 
                                                        current={trade.currentPrice || trade.buyPrice}
                                                        buy={trade.buyPrice}
                                                        tp={trade.targetTP}
                                                        sl={trade.targetSL}
                                                    />

                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                        <div className="bg-gray-800/60 p-1.5 rounded border border-gray-700/50">
                                                            <div className="text-[8px] text-gray-500 uppercase font-black">Harga Beli</div>
                                                            <div className="text-[11px] text-white font-mono font-bold">Rp {trade.buyPrice?.toLocaleString('id-ID')}</div>
                                                        </div>
                                                        <div className="bg-gray-800/60 p-1.5 rounded border border-gray-700/50">
                                                            <div className="text-[8px] text-gray-500 uppercase font-black">Sekarang</div>
                                                            <div className="text-[11px] text-cyan-400 font-mono font-bold">Rp {trade.currentPrice?.toLocaleString('id-ID')}</div>
                                                        </div>
                                                        <div className="bg-green-900/20 p-1.5 rounded border border-green-500/20">
                                                            <div className="text-[8px] text-green-500/70 uppercase font-black">Target TP</div>
                                                            <div className="text-[11px] text-green-400 font-mono font-bold">Rp {trade.targetTP?.toLocaleString('id-ID')}</div>
                                                        </div>
                                                        <div className="bg-red-900/20 p-1.5 rounded border border-red-500/20">
                                                            <div className="text-[8px] text-red-500/70 uppercase font-black">Target SL</div>
                                                            <div className="text-[11px] text-red-400 font-mono font-bold">Rp {trade.targetSL?.toLocaleString('id-ID')}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => activeHook.forceSell(trade.id)}
                                                            className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase rounded shadow-lg shadow-red-900/20 transition-all active:scale-95"
                                                        >
                                                            FORCE SELL NOW
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
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
                                <div className="bg-gray-900 rounded-lg p-3 flex-1 border border-gray-700 flex flex-col overflow-y-auto max-h-[300px] min-h-[150px]">
                                {!activeHook.tradeHistory || activeHook.tradeHistory.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-600 text-[10px] italic">
                                        Belum ada history trade.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {activeHook.tradeHistory.map((item: any, index: number) => {
                                            const showDateHeader = index === 0 || item.date !== activeHook.tradeHistory[index - 1].date;
                                            return (
                                                <React.Fragment key={`history-fragment-${item.id}`}>
                                                    {showDateHeader && (
                                                        <div className="flex items-center gap-2 py-1 mt-4 first:mt-0">
                                                            <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-gray-900 px-2 rounded-full border border-gray-800">
                                                                {item.date || 'Lama'}
                                                            </span>
                                                            <div className="h-[1px] flex-1 bg-gray-800"></div>
                                                        </div>
                                                    )}
                                                    <div key={`history-item-${item.id}`} className="bg-gray-800/40 border-l-2 border-gray-700 p-2 rounded-r flex justify-between items-center transition-all hover:bg-gray-800/60">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-white uppercase">{item.coin}</span>
                                                                {item.profit_percent !== undefined && (
                                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${item.profit_percent >= 0 ? 'bg-green-900/30 text-green-400 border border-green-500/20' : 'bg-red-900/30 text-red-400 border border-red-500/20'}`}>
                                                                        {item.profit_percent >= 0 ? '+' : ''}{item.profit_percent.toFixed(2)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[9px] text-gray-500 uppercase font-medium">{item.time}</span>
                                                                <span className="text-[9px] text-gray-600 font-mono">Rp {item.sell_price?.toLocaleString('id-ID')}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[8px] text-gray-600 uppercase font-black leading-none mb-1">Buy Price</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">Rp {item.buy_price?.toLocaleString('id-ID')}</div>
                                                        </div>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
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
                requestNotificationPermission={async () => { await bgBotProps.requestNotificationPermission(); }}
            />
        </div >
    );
};

export default TradingBotPanel;
