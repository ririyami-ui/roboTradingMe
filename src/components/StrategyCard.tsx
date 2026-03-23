import React from 'react';

interface StrategyDetail {
  name: string;
  icon: string;
  description: string;
  indicators: string[];
  timeframe: string;
  style: string;
}

const STRATEGY_DETAILS: Record<string, StrategyDetail> = {
  DYNAMIC_AUTO: {
    name: 'SaktiBot Auto',
    icon: '🤖',
    description: 'Mode cerdas: Hunter (< -1.5%), Trend (> 1.5%), atau Balanced (Sideways).',
    indicators: ['Adaptive', 'RSI', 'EMA 9/21'],
    timeframe: 'Multi-TF',
    style: 'Dynamic'
  },
  SCALPER_5M: {
    name: 'Sakti Scalper 5M',
    icon: '🐝',
    description: 'Strategi trend-following pada timeframe menengah untuk sinyal yang lebih stabil.',
    indicators: ['EMA 9 > 21', 'RSI 35-65', 'Volume > Avg'],
    timeframe: '5 Menit',
    style: 'Conservative'
  },
  EMA_SCALPING: {
    name: 'EMA Scalping',
    icon: '📈',
    description: 'Mencari momentum Golden Cross dengan batas RSI yang lebih longgar (60).',
    indicators: ['EMA 9/21 Cross', 'RSI <= 60', 'Price > EMA9'],
    timeframe: '1 Menit',
    style: 'Standard'
  },
  OVERSOLD_REBOUND: {
    name: 'Oversold Hunter',
    icon: '🎯',
    description: 'Menangkap pantulan harga ekstrem dengan batas RSI hingga 36.',
    indicators: ['RSI <= 36', 'Price > EMA9', 'RSI > 28'],
    timeframe: '1 Menit',
    style: 'Mean Reversion'
  },
  SCALPING: {
    name: 'Pure Scalper',
    icon: '⚡',
    description: 'Strategi agresif dengan frekuensi trading tinggi.',
    indicators: ['EMA Cross', 'RSI <= 50', 'Quick TP'],
    timeframe: '1 Menit',
    style: 'Aggressive'
  },
  DAY_TRADING: {
    name: 'Day Trading',
    icon: '📅',
    description: 'Menahan posisi lebih lama untuk mengejar profit harian yang signifikan.',
    indicators: ['EMA Trend', 'RSI <= 55', 'Volume 1.5x'],
    timeframe: '1 Menit (Manual Target)',
    style: 'Moderate'
  },
  SWING_TRADING: {
    name: 'Swing Trading',
    icon: '🌊',
    description: 'Target profit besar dengan mengandalkan tren jangka panjang.',
    indicators: ['EMA Trend', 'RSI <= 60', 'Volume 2.0x'],
    timeframe: '1 Menit (Manual Target)',
    style: 'Patient'
  },
  MICRO_SCALPING: {
    name: 'Micro Scalping',
    icon: '💎',
    description: 'Strategi scalping super cepat berbasis Stochastic RSI dan EMA 25.',
    indicators: ['StochRSI < 20', 'EMA 25 Trend', 'Quick Exit'],
    timeframe: '1 Menit',
    style: 'Extreme'
  }
};

interface StrategyCardProps {
  strategy: string;
  tp: number;
  sl: number;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, tp, sl }) => {
  const detail = STRATEGY_DETAILS[strategy] || STRATEGY_DETAILS['DYNAMIC_AUTO'];

  return (
    <div className="bg-gradient-to-br from-cyan-900/20 to-gray-900/50 border border-cyan-500/30 rounded-xl p-4 shadow-lg backdrop-blur-sm mb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
            {detail.icon}
          </div>
          <div>
            <h3 className="text-white font-black text-lg uppercase tracking-tight leading-tight">
              {detail.name}
            </h3>
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-800/20">
              {detail.style} Mode
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Target R:R</div>
          <div className="text-white font-mono text-sm font-bold">
            <span className="text-green-400">{tp}%</span> / <span className="text-red-400">{sl}%</span>
          </div>
        </div>
      </div>

      <p className="text-gray-300 text-xs leading-relaxed mb-4 border-l-2 border-cyan-500/50 pl-3 italic">
        "{detail.description}"
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-[10px] text-gray-400 font-bold uppercase">Indikator Kunci</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detail.indicators.map((ind, i) => (
              <span key={i} className="text-[9px] bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700 font-medium">
                {ind}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] text-gray-400 font-bold uppercase">Timeframe</span>
          </div>
          <div className="text-[11px] text-white font-bold bg-gray-800/50 px-2 py-1 rounded border border-gray-700 w-fit">
            {detail.timeframe}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyCard;
