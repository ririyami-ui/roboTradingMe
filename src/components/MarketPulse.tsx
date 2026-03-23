import React from 'react';
import { useMarketPulse } from '../hooks/useMarketPulse';

const MarketPulse: React.FC = () => {
    const { sentiment, btcChange, upCount, downCount, stableCount, totalCoins, advice, level, loading, refresh } = useMarketPulse();

    if (loading) {
        return (
            <div className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 rounded-2xl p-4 lg:p-5 animate-pulse h-28 mb-6">
                <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
                <div className="h-8 bg-gray-700 rounded w-3/4"></div>
            </div>
        );
    }

    const getColorClass = () => {
        switch (level) {
            case 'danger': return 'text-red-400 border-red-500/30 bg-red-500/5';
            case 'success': return 'text-green-400 border-green-500/30 bg-green-500/5';
            case 'warning': return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5';
            default: return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5';
        }
    };

    const getGlowClass = () => {
        switch (level) {
            case 'danger': return 'shadow-[0_0_20px_rgba(239,68,68,0.15)]';
            case 'success': return 'shadow-[0_0_20px_rgba(34,197,94,0.15)]';
            case 'warning': return 'shadow-[0_0_20px_rgba(234,179,8,0.15)]';
            default: return 'shadow-[0_0_20px_rgba(34,211,238,0.15)]';
        }
    };

    const getPulseColor = () => {
        switch (level) {
            case 'danger': return 'bg-red-500';
            case 'success': return 'bg-green-500';
            case 'warning': return 'bg-yellow-500';
            default: return 'bg-cyan-500';
        }
    };

    return (
        <div className={`relative overflow-hidden bg-gray-900/40 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-4 lg:p-5 mb-6 transition-all duration-500 ${getGlowClass()}`}>
            {/* Background Decorative Element */}
            <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-20 rounded-full -mr-16 -mt-16 ${getPulseColor()}`}></div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-800/80 border border-gray-700/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getPulseColor()}`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${getPulseColor()}`}></span>
                            </span>
                            Indodax Market Pulse
                        </div>
                        <span className="text-[10px] text-gray-600 font-bold uppercase tracking-tighter">Update setiap 1m</span>
                    </div>
                    
                    <h2 className={`text-2xl lg:text-3xl font-black italic tracking-tighter uppercase mb-1 flex items-center gap-3 ${getColorClass().split(' ')[0]}`}>
                        SENTIMEN {sentiment}
                        <span className={`text-base not-italic font-bold px-3 py-1 rounded-lg border ${getColorClass()}`}>
                            {btcChange >= 0 ? '+' : ''}{btcChange.toFixed(2)}% BTC
                        </span>
                    </h2>
                    <p className="text-gray-400 text-xs lg:text-sm italic font-medium max-w-2xl leading-relaxed">
                        &quot;{advice}&quot;
                    </p>
                </div>

                <div className="flex-none w-full lg:w-auto flex items-stretch gap-3">
                    {/* Advance / Decline Stats */}
                    <div className="flex-1 lg:flex-none flex flex-col justify-between bg-gray-800/40 p-3 lg:p-4 rounded-xl border border-gray-700/30 min-w-[140px]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] uppercase font-black text-gray-500 tracking-wider">Rasio Naik / Turun</span>
                            <span className="text-[10px] font-bold text-gray-400">{totalCoins} Pair</span>
                        </div>
                        <div className="flex items-end gap-2 mb-2">
                            <div className="flex-1 flex flex-col items-center">
                                <div className="text-green-400 font-mono font-black text-lg leading-none">{upCount}</div>
                                <div className="text-[8px] text-gray-600 uppercase font-black">NAIK</div>
                            </div>
                            <div className="w-px h-6 bg-gray-700/50 self-center"></div>
                            <div className="flex-1 flex flex-col items-center">
                                <div className="text-yellow-400 font-mono font-black text-lg leading-none">{stableCount}</div>
                                <div className="text-[8px] text-gray-600 uppercase font-black">SID</div>
                            </div>
                            <div className="w-px h-6 bg-gray-700/50 self-center"></div>
                            <div className="flex-1 flex flex-col items-center">
                                <div className="text-red-400 font-mono font-black text-lg leading-none">{downCount}</div>
                                <div className="text-[8px] text-gray-600 uppercase font-black">TRN</div>
                            </div>
                        </div>
                        {/* Progress Bar Micro */}
                        <div className="h-1 w-full bg-gray-700/50 rounded-full overflow-hidden flex">
                            <div className="h-full bg-green-500" style={{ width: `${totalCoins > 0 ? (upCount / totalCoins) * 100 : 0}%` }}></div>
                            <div className="h-full bg-yellow-500" style={{ width: `${totalCoins > 0 ? (stableCount / totalCoins) * 100 : 0}%` }}></div>
                            <div className="h-full bg-red-500" style={{ width: `${totalCoins > 0 ? (downCount / totalCoins) * 100 : 0}%` }}></div>
                        </div>
                    </div>

                    <button 
                        onClick={() => refresh && refresh()}
                        className="flex items-center justify-center p-3 lg:p-4 rounded-xl border border-gray-700/50 bg-gray-800/20 hover:bg-gray-700/40 transition-all group"
                        title="Scan Pasar Sekarang"
                    >
                        <svg className="w-5 h-5 text-gray-500 group-hover:text-cyan-400 transition-colors group-hover:rotate-180 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MarketPulse;
