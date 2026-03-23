import React from 'react';
import { useMarketIntelligence, GlobalSignal } from '../hooks/useMarketIntelligence';

interface SparklineProps {
    prices: number[];
    color?: string;
    width?: number;
    height?: number;
}

// ---- Mini Sparkline Chart (SVG tanpa library tambahan) ----
const Sparkline: React.FC<SparklineProps> = ({ prices, color = '#22d3ee', width = 100, height = 36 }) => {
    if (!prices || prices.length < 2) return null;

    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const points = prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((p - minP) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // Area fill path
    const areaPoints = `0,${height} ${points} ${width},${height}`;
    const gradId = `grad-${color.replace('#', '')}`;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <polygon
                points={areaPoints}
                fill={`url(#${gradId})`}
            />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle
                cx={width}
                cy={height - ((prices[prices.length - 1] - minP) / range) * height}
                r="2.5"
                fill={color}
            />
        </svg>
    );
};

// ---- Format harga IDR yang ringkas ----
const formatPrice = (price: number): string => {
    if (!price) return '-';
    if (price >= 1_000_000_000) return `Rp ${(price / 1_000_000_000).toFixed(2)}M`;
    if (price >= 1_000_000) return `Rp ${(price / 1_000_000).toFixed(2)}jt`;
    if (price >= 1_000) return `Rp ${(price / 1_000).toFixed(1)}rb`;
    return `Rp ${price.toFixed(4)}`;
};

interface OpportunityRadarProps {
    onCoinSelect: (coinId: string) => void;
}

const OpportunityRadar: React.FC<OpportunityRadarProps> = ({ onCoinSelect }) => {
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
            <div className="max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {signals.map((signal) => {
                        const isStrong = signal.type === 'STRONG_BUY';
                        const isMomentum = signal.type === 'MOMENTUM_UP';
                        const chartColor = isStrong ? '#4ade80' : isMomentum ? '#facc15' : '#22d3ee';
                        const priceHistory = signal.priceHistory || [];
                        const priceChange = priceHistory.length >= 2
                            ? ((priceHistory[priceHistory.length - 1] - priceHistory[0]) / priceHistory[0]) * 100
                            : 0;

                        return (
                            <button
                                key={`radar-signal-${signal.coin}-${signal.timestamp}`}
                                onClick={() => onCoinSelect(signal.coin)}
                                className={`flex flex-col p-3 rounded-lg border transition-all hover:scale-[1.02] active:scale-95 text-left
                                    ${isStrong
                                        ? 'bg-green-900/20 border-green-500/30 hover:border-green-500'
                                        : isMomentum
                                        ? 'bg-yellow-900/20 border-yellow-500/30 hover:border-yellow-500'
                                        : 'bg-cyan-900/20 border-cyan-500/30 hover:border-cyan-500'}`}
                            >
                                {/* Baris 1: Logo + Nama + Harga */}
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600 p-1 flex-shrink-0">
                                            <img
                                                src={`https://indodax.com/v2/logo/png/color/${signal.symbol?.toLowerCase()}.png`}
                                                alt={signal.symbol}
                                                className="w-full h-full object-contain"
                                                onError={(e: any) => {
                                                    e.target.onerror = null;
                                                    e.target.src = `https://ui-avatars.com/api/?name=${signal.symbol}&background=0D8ABC&color=fff`;
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <span className="text-white font-black text-base leading-tight block">{signal.symbol?.toUpperCase()}</span>
                                            <div className={`text-[10px] font-bold uppercase ${isStrong ? 'text-green-400' : isMomentum ? 'text-yellow-400' : 'text-cyan-400'}`}>
                                                {isStrong ? '🔥 STRONG BUY' : isMomentum ? '🚀 MOMENTUM' : '🤖 AI APPROVED'}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Harga Saat Ini */}
                                    <div className="text-right">
                                        <div className="text-white font-bold text-sm">{formatPrice(signal.price)}</div>
                                        <div className={`text-[10px] font-bold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Mini Sparkline Chart */}
                                {priceHistory.length >= 2 && (
                                    <div className="w-full mb-2 rounded overflow-hidden">
                                        <Sparkline prices={priceHistory} color={chartColor} width={200} height={40} />
                                    </div>
                                )}

                                {/* Baris 2: Stats Grid */}
                                <div className="grid grid-cols-3 gap-1.5 mb-2">
                                    <div className="bg-black/20 rounded p-1.5 border border-white/5 text-center">
                                        <div className="text-[9px] text-gray-500 uppercase">Hourly</div>
                                        <div className={`text-xs font-bold ${Number(signal.hourlyChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {signal.hourlyChange}%
                                        </div>
                                    </div>
                                    <div className="bg-black/20 rounded p-1.5 border border-white/5 text-center">
                                        <div className="text-[9px] text-gray-500 uppercase">5m Mom.</div>
                                        <div className={`text-xs font-bold ${Number(signal.momentum) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {Number(signal.momentum) >= 0 ? '▲' : '▼'} {Math.abs(Number(signal.momentum)).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="bg-black/20 rounded p-1.5 border border-white/5 text-center">
                                        <div className="text-[9px] text-gray-500 uppercase">Target</div>
                                        <div className="text-xs font-bold text-green-400">+{signal.potentialProfit}%</div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="pt-1.5 border-t border-gray-700/50 flex justify-between items-center">
                                    <span className="text-[9px] text-gray-500">{new Date(signal.timestamp).toLocaleTimeString()}</span>
                                    <span className="text-[9px] font-medium text-gray-400 truncate max-w-[140px]">{signal.strength}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default OpportunityRadar;
