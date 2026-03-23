import React from 'react';
import { useMarketIntelligence } from '../hooks/useMarketIntelligence';

interface FastMovementListProps {
    onCoinSelect: (coinId: string) => void;
}

const FastMovementList: React.FC<FastMovementListProps> = ({ onCoinSelect }) => {
    const { fastMovers, loading } = useMarketIntelligence();

    if (loading) return (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 animate-pulse">
            <div className="h-6 bg-gray-700 w-1/2 mb-4 rounded"></div>
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-700 rounded"></div>)}
            </div>
        </div>
    );

    return (
        <div className="bg-gray-800 rounded-xl shadow-md p-4 border border-gray-700/50">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2 uppercase tracking-wider">
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                Fastest Movers (24h)
            </h2>
            <div className="max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-2">
                    {fastMovers.map(coin => (
                        <button
                            key={coin.symbol}
                            onClick={() => onCoinSelect(coin.id)}
                            className="w-full flex items-center justify-between p-2 rounded-lg bg-gray-900/30 border border-white/5 hover:border-cyan-500/50 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600 p-0.5">
                                    <img
                                        src={`https://indodax.com/v2/logo/png/color/${coin.symbol?.toLowerCase()}.png`}
                                        alt={coin.symbol}
                                        className="w-full h-full object-contain"
                                        onError={(e: any) => {
                                            e.target.onerror = null;
                                            e.target.src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=0D8ABC&color=fff`;
                                        }}
                                    />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors uppercase">{coin.symbol}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-sm font-black ${(coin.change24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {(coin.change24h || 0) >= 0 ? '+' : ''}{(coin.change24h || 0).toFixed(2)}%
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FastMovementList;
