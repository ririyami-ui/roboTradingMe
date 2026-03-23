import React, { useMemo } from 'react';
import { useCoinList, Coin } from '../hooks/useCoinList';

interface MarketMoverItemProps {
    coin: Coin;
    onCoinSelect: (coinId: string) => void;
}

const MarketMoverItem: React.FC<MarketMoverItemProps> = ({ coin, onCoinSelect }) => (
    <button
        onClick={() => onCoinSelect(coin.id)}
        className="flex items-center p-2 rounded-lg hover:bg-gray-700 transition-colors w-full text-left"
    >
        <div className="w-8 h-8 mr-3 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600">
            <img
                src={coin.logoUrl}
                alt={coin.symbol}
                className="w-full h-full object-contain p-1"
                onError={(e: any) => {
                    e.target.onerror = null;
                    e.target.src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=0D8ABC&color=fff`;
                }}
            />
        </div>
        <div className="flex-grow">
            <p className="font-bold text-sm text-white">{coin.name}</p>
            <p className="text-xs text-gray-400 uppercase">{coin.symbol}</p>
        </div>
        <div className={`text-sm font-semibold ${coin.change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {coin.change24h > 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
        </div>
    </button>
);

const Skeleton: React.FC = () => (
    <div className="animate-pulse">
        {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center p-2">
                <div className="w-8 h-8 mr-3 rounded-full bg-gray-700"></div>
                <div className="flex-grow">
                    <div className="h-4 bg-gray-700 rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/4"></div>
                </div>
                <div className="h-4 bg-gray-700 rounded w-1/5"></div>
            </div>
        ))}
    </div>
);

interface MarketMoversProps {
    onCoinSelect: (coinId: string) => void;
}

const MarketMovers: React.FC<MarketMoversProps> = ({ onCoinSelect }) => {
    const { allCoins, loading } = useCoinList();

    const { topGainers, topLosers } = useMemo(() => {
        if (!Array.isArray(allCoins) || allCoins.length === 0) return { topGainers: [], topLosers: [] };

        const sortedData = [...allCoins].sort((a, b) => b.change24h - a.change24h);
        const topGainers = sortedData.slice(0, 5);
        const topLosers = sortedData.filter(c => c.change24h < 0).slice(-5).reverse();

        return { topGainers, topLosers };
    }, [allCoins]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-gray-800 rounded-xl shadow-md p-5 border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2 flex items-center gap-2">
                    <span className="text-green-400">🚀</span> Top 5 Keuntungan (24h)
                </h2>
                {loading ? <Skeleton /> : topGainers.map(coin => (
                    <MarketMoverItem key={coin.id} coin={coin} onCoinSelect={onCoinSelect} />
                ))}
            </div>
            <div className="bg-gray-800 rounded-xl shadow-md p-5 border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2 flex items-center gap-2">
                    <span className="text-red-400">📉</span> Top 5 Kerugian (24h)
                </h2>
                {loading ? <Skeleton /> : topLosers.map(coin => (
                    <MarketMoverItem key={coin.id} coin={coin} onCoinSelect={onCoinSelect} />
                ))}
            </div>
        </div>
    );
};

export default MarketMovers;
