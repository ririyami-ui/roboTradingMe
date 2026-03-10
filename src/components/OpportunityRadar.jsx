import React from 'react';
import { useMarketIntelligence } from '../hooks/useMarketIntelligence';

export default function OpportunityRadar({ onCoinSelect }) {
    const { signals } = useMarketIntelligence();

    if (signals.length === 0) return null;

    return (
        <div className="bg-gray-800 rounded-xl shadow-lg p-5 border border-cyan-500/30 mb-6 bg-gradient-to-br from-gray-800 to-cyan-900/10">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                    Opportunity Radar (Live Signals)
                </h2>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Real-time Predictions</div>
            </div>

            <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {signals.map((signal, idx) => (
                        <button
                            key={`${signal.coin}-${signal.timestamp}`}
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
