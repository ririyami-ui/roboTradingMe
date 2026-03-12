import React from 'react';
import { useMarketIntelligence } from '../hooks/useMarketIntelligence';

export default function OpportunityRadar({ onCoinSelect }) {
    const { signals } = useMarketIntelligence();

    if (signals.length === 0) {
        return (
            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700/50 mb-6 bg-gradient-to-br from-gray-800 to-gray-900/50 text-center">
                <div className="flex flex-col items-center justify-center py-4">
                    <div className="relative mb-4">
                        <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-cyan-500/40 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                        </span>
                    </div>
                    <h3 className="text-gray-400 font-bold uppercase tracking-[0.2em] text-xs">Opportunity Radar</h3>
                    <p className="text-[10px] text-gray-500 mt-1">SaktiBot sedang menganalisa pasar untuk mencari sinyal...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800 rounded-xl shadow-lg p-5 border border-gray-700/50 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-3">
                <h2 className="text-xl font-black text-white flex items-center gap-3 italic tracking-tighter uppercase">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                    Radar Peluang (Live)
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
                        Memindai 40+ Pair
                    </span>
                </div>
            </div>
            <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {signals.map((signal, idx) => (
                        <button
                            key={`radar-signal-${signal.coin}-${signal.timestamp}`}
                            onClick={() => onCoinSelect(signal.coin)}
                            className={`flex flex-col p-3 rounded-lg border transition-all hover:scale-[1.02] active:scale-95 text-left
                                ${signal.type === 'STRONG_BUY'
                                    ? 'bg-green-900/20 border-green-500/30 hover:border-green-500'
                                    : 'bg-cyan-900/20 border-cyan-500/30 hover:border-cyan-500'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600 p-1">
                                        <img
                                            src={`https://indodax.com/v2/logo/png/color/${signal.symbol?.toLowerCase()}.png`}
                                            alt={signal.symbol}
                                            className="w-full h-full object-contain"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = `https://ui-avatars.com/api/?name=${signal.symbol}&background=0D8ABC&color=fff`;
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <span className="text-white font-black text-lg">{signal.symbol.toUpperCase()}</span>
                                        <div className="text-[10px] text-gray-400">Target Profit: <span className="text-green-400">+{signal.potentialProfit}%</span></div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-xs font-bold ${parseFloat(signal.momentum) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {parseFloat(signal.momentum) >= 0 ? '📈' : '📉'} {signal.momentum}%
                                    </div>
                                    <div className="text-[9px] text-gray-500 uppercase font-bold">5m Momentum</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-black/20 rounded p-1.5 border border-white/5">
                                    <div className="text-[9px] text-gray-500 uppercase">Hourly</div>
                                    <div className={`text-xs font-bold ${parseFloat(signal.hourlyChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {signal.hourlyChange}%
                                    </div>
                                </div>
                                <div className="bg-black/20 rounded p-1.5 border border-white/5">
                                    <div className="text-[9px] text-gray-500 uppercase">Signal Type</div>
                                    <div className={`text-[10px] font-bold uppercase truncate ${signal.type === 'STRONG_BUY' ? 'text-green-400' : 'text-cyan-400'}`}>
                                        {signal.type.split('_')[0]}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto pt-2 border-t border-gray-700/50 flex justify-between items-center">
                                <span className="text-xs text-gray-500">{new Date(signal.timestamp).toLocaleTimeString()}</span>
                                <span className="text-[10px] font-medium text-gray-400 truncate max-w-[120px]">{signal.strength}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
