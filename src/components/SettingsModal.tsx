import React, { useState, useEffect } from 'react';
import { useIndodaxAuth } from '../hooks/useIndodaxAuth';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    notificationPermission: string;
    requestNotificationPermission: () => Promise<void>;
}

interface StrategyInfo {
    label: string;
    tp: number;
    sl: number;
    icon: string;
}

const STRATEGIES: Record<string, StrategyInfo> = {
    DYNAMIC_AUTO: { label: 'SaktiBot Auto (Hybrid)', tp: 2.0, sl: 1.5, icon: '🤖' },
    SCALPER_5M: { label: 'Sakti Scalper 5M (Balanced)', tp: 1.8, sl: 1.2, icon: '🐝' },
    EMA_SCALPING: { label: 'EMA Scalping (Trend Follow)', tp: 3.0, sl: 1.8, icon: '📈' },
    OVERSOLD_REBOUND: { label: 'Oversold Hunter (Dip Buyer)', tp: 2.0, sl: 1.2, icon: '🎯' },
    SCALPING: { label: 'Pure Scalping (High Freq)', tp: 1.5, sl: 1.0, icon: '⚡' },
    MICRO_SCALPING: { label: 'Micro Scalping (Stoch RSI)', tp: 1.5, sl: 1.0, icon: '🎯' },
    DAY_TRADING: { label: 'Day Trading (Daily)', tp: 5.0, sl: 2.5, icon: '📅' },
    SWING_TRADING: { label: 'Swing Trading (Long Hold)', tp: 15.0, sl: 5.0, icon: '🌊' }
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    notificationPermission, 
    requestNotificationPermission 
}) => {
    const { 
        apiKey, 
        secretKey, 
        geminiKey, 
        tradingStrategy, 
        takeProfit, 
        stopLoss, 
        tradeAmount, 
        dailyLossLimit, 
        isSyncing, 
        saveKeys, 
        clearKeys 
    } = useIndodaxAuth();

    const [inputApiKey, setInputApiKey] = useState(apiKey || '');
    const [inputSecretKey, setInputSecretKey] = useState(secretKey || '');
    const [inputGeminiKey, setInputGeminiKey] = useState(geminiKey || '');
    const [inputStrategy, setInputStrategy] = useState(tradingStrategy || 'SCALPING');
    const [inputTP, setInputTP] = useState<string | number>(takeProfit || 1.5);
    const [inputSL, setInputSL] = useState<string | number>(stopLoss || 1.0);
    const [inputTradeAmount, setInputTradeAmount] = useState<string | number>(tradeAmount || 50000);
    const [inputDailyLossLimit, setInputDailyLossLimit] = useState<string | number>(dailyLossLimit || 5.0);

    const [showSecret, setShowSecret] = useState(false);
    const [showGemini, setShowGemini] = useState(false);
    const [showSavedMessage, setShowSavedMessage] = useState(false);

    // Sync state if keys change from outside
    useEffect(() => {
        setInputApiKey(apiKey || '');
        setInputSecretKey(secretKey || '');
        setInputGeminiKey(geminiKey || '');
        setInputStrategy(tradingStrategy || 'SCALPING');
        setInputTP(takeProfit || 1.5);
        setInputSL(stopLoss || 1.0);
        setInputTradeAmount(tradeAmount || 50000);
        setInputDailyLossLimit(dailyLossLimit || 5.0);
    }, [apiKey, secretKey, geminiKey, tradingStrategy, takeProfit, stopLoss, tradeAmount, dailyLossLimit, isOpen]);

    if (!isOpen) return null;

    const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const strategy = e.target.value;
        setInputStrategy(strategy);
        
        const defaults = STRATEGIES[strategy];
        if (defaults) {
            setInputTP(defaults.tp);
            setInputSL(defaults.sl);
        }
    };

    const handleSave = () => {
        saveKeys(inputApiKey, inputSecretKey, inputGeminiKey, {
            tradingStrategy: inputStrategy,
            takeProfit: typeof inputTP === 'string' ? parseFloat(inputTP) : inputTP,
            stopLoss: typeof inputSL === 'string' ? parseFloat(inputSL) : inputSL,
            tradeAmount: typeof inputTradeAmount === 'string' ? parseInt(inputTradeAmount) : inputTradeAmount,
            dailyLossLimit: typeof inputDailyLossLimit === 'string' ? parseFloat(inputDailyLossLimit) : inputDailyLossLimit
        });
        
        setShowSavedMessage(true);
        setTimeout(() => {
            setShowSavedMessage(false);
            onClose();
        }, 1500);
    };

    const handleClear = () => {
        if (window.confirm('Are you sure you want to delete your API keys from this browser?')) {
            clearKeys();
            setInputApiKey('');
            setInputSecretKey('');
            setInputGeminiKey('');
        }
    };

    const handleReset = () => {
        if (window.confirm('Reset semua pengaturan ke default (Optimal & Aman)?')) {
            setInputTradeAmount(100000);
            setInputTP(2.0);
            setInputSL(1.5);
            setInputDailyLossLimit(5.0);
            setInputStrategy('DYNAMIC_AUTO');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-700 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-white">Bot Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
                    <div className="bg-cyan-900/30 border border-cyan-800/50 rounded-lg p-3 text-sm text-cyan-200">
                        <p className="font-semibold mb-1 flex items-center gap-2">
                            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                            Secure Cloud Sync Active
                        </p>
                        <p className="text-[11px] leading-relaxed">
                            API Key Anda kini dienkripsi dengan <strong>AES-256</strong> secara lokal sebelum disimpan ke Firebase. Data Anda aman dan tersinkronisasi di seluruh perangkat Anda.
                        </p>
                    </div>

                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-4">
                        <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest">Konfigurasi Trading</h3>
                        
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Jenis Trading</label>
                            <div className="relative">
                                <select
                                    value={inputStrategy}
                                    onChange={handleStrategyChange}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white appearance-none focus:ring-2 focus:ring-cyan-500 outline-none"
                                >
                                    {Object.entries(STRATEGIES).map(([key, info]) => (
                                        <option key={key} value={key}>{info.icon} {info.label}</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Take Profit (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={inputTP}
                                    onChange={(e) => setInputTP(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase">Stop Loss (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={inputSL}
                                    onChange={(e) => setInputSL(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase">Jumlah Per Trade (IDR)</label>
                            <input
                                type="number"
                                step="10000"
                                value={inputTradeAmount}
                                onChange={(e) => setInputTradeAmount(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase">Batasi Loss Harian (%)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    step="0.5"
                                    value={inputDailyLossLimit}
                                    onChange={(e) => setInputDailyLossLimit(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                                />
                                <div className="text-[10px] text-gray-500 leading-tight">Bot akan berhenti otomatis jika rugi mencapai batas ini dalam 24 jam.</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 space-y-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-medium text-gray-200 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                                    Android & Browser Notifications
                                </p>
                                <p className="text-[10px] text-gray-500 mt-0.5">Dapatkan sinyal beli/jual langsung di HP Anda.</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${notificationPermission === 'granted' ? 'bg-green-900/40 text-green-400 border border-green-800/30' : 'bg-red-900/40 text-red-400 border border-red-800/30'}`}>
                                {notificationPermission === 'granted' ? 'ACTIVE' : 'OFF'}
                            </span>
                        </div>

                        {notificationPermission !== 'granted' && (
                            <button
                                onClick={requestNotificationPermission}
                                className="w-full py-2 bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-500 text-xs font-bold border border-yellow-600/30 rounded-lg transition-all"
                            >
                                IZINKAN NOTIFIKASI
                            </button>
                        )}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-700">
                        <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest">Kredensial API</h3>
                        
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Indodax API Key</label>
                            <input
                                type="text"
                                autoComplete="off"
                                value={inputApiKey}
                                onChange={(e) => setInputApiKey(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-sm"
                                placeholder="Enter your API Key"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Indodax Secret Key</label>
                            <div className="relative">
                                <input
                                    type={showSecret ? "text" : "password"}
                                    autoComplete="new-password"
                                    value={inputSecretKey}
                                    onChange={(e) => setInputSecretKey(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 pr-10 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-sm"
                                    placeholder="Enter your Secret Key"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSecret(!showSecret)}
                                >
                                    {showSecret ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943-9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Gemini API Key</label>
                            <div className="relative">
                                <input
                                    type={showGemini ? "text" : "password"}
                                    value={inputGeminiKey}
                                    onChange={(e) => setInputGeminiKey(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 pr-10 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-sm"
                                    placeholder="Enter your Gemini API Key"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowGemini(!showGemini)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                                >
                                    {showGemini ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <div className="flex gap-2">
                        <button
                            onClick={handleClear}
                            className="text-red-400 hover:text-red-300 text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded transition-colors"
                        >
                            Clear Keys
                        </button>
                        <button
                            onClick={handleReset}
                            className="text-yellow-500 hover:text-yellow-400 text-[11px] font-bold uppercase tracking-wider px-3 py-2 border border-yellow-900/30 rounded transition-colors"
                        >
                            Reset Default
                        </button>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
                            disabled={isSyncing}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSyncing}
                            className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-all flex items-center gap-2 ${
                                isSyncing 
                                ? 'bg-cyan-800 text-cyan-300 cursor-not-allowed' 
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20'
                            }`}
                        >
                            {isSyncing ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </>
                            ) : showSavedMessage ? (
                                <>
                                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    Seting Tersimpan!
                                </>
                            ) : 'Save Keys'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
