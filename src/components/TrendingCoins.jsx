import React from 'react';
import { useTrendingCoins } from '../hooks/useTrendingCoins';

/**
 * Komponen untuk menampilkan daftar koin yang sedang tren dari Indodax.
 */
export default function TrendingCoins({ onCoinSelect }) {
  const { trendingCoins, loading } = useTrendingCoins();

  return (
    <div className="bg-gray-800 rounded-xl shadow-md p-5 mt-6">
      <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2">
        🔥 Indodax Trending Coins (By Volume)
      </h2>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 animate-pulse">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="bg-gray-700 h-20 rounded-lg"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {trendingCoins.map((coin) => {
            return (
              <button
                key={coin.id}
                onClick={() => onCoinSelect(coin.id)}
                className="bg-gray-700/50 p-3 rounded-lg flex flex-col items-center justify-center hover:bg-gray-700 transition-colors w-full"
              >
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden mb-2 shadow-inner border border-gray-600">
                  <img
                    src={`https://indodax.com/v2/logo/png/color/${coin.symbol?.toLowerCase()}.png`}
                    alt={coin.symbol}
                    className="w-full h-full object-contain p-1.5"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=0D8ABC&color=fff`;
                    }}
                  />
                </div>
                <div className="text-center overflow-hidden w-full">
                  <p className="font-bold text-sm text-white truncate">{coin.name}</p>
                  <p className="text-xs text-gray-400 uppercase">{coin.symbol}</p>
                  <p className={`text-[10px] mt-1 font-semibold ${coin.change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {coin.change24h > 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}