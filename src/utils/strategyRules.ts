
export const TRADING_CONFIG = {
  EMA_FAST: 9,
  EMA_SLOW: 21,
  RSI_OVERSOLD: 30,
  MIN_VOLUME_MULTIPLIER: 1.2,
  MAX_BTC_DROP_PERCENT: 7.5,
  
  // Risk Mgmt
  TRAILING_ACTIVATION: 2.0,
  TRAILING_DISTANCE: 0.5,
  BREAKEVEN_TRIGGER: 1.0,
  
  // Strategy - Oversold Bounce
  RSI_OVERSOLD_EXTREME: 36,
};

interface MarketData {
  rsi: number;
  ema9: number;
  ema21: number;
  ema25?: number; // Filter for Micro-Scalping
  stochK?: number; // Stochastic RSI %K
  stochD?: number; // Stochastic RSI %D
  currentPrice: number;
  volume: number;
  avgVolume: number;
  btcChange24h: number;
  strategy: 'EMA_SCALPING' | 'OVERSOLD_REBOUND' | 'SCALPING' | 'DAY_TRADING' | 'SWING_TRADING' | 'DYNAMIC_AUTO' | 'SCALPER_5M' | 'MICRO_SCALPING';
}

interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  confidence: number;
}

const getChecklist = (conditions: { label: string, met: boolean }[]): string => {
    return conditions.map(c => `[${c.met ? '✅' : '❌'}${c.label}]`).join(' ');
};

export const checkEntrySignal = (data: MarketData): TradeSignal => {
  const { RSI_OVERSOLD, RSI_OVERSOLD_EXTREME, MAX_BTC_DROP_PERCENT, MIN_VOLUME_MULTIPLIER } = TRADING_CONFIG;
  
  // Decide which strategy to use
  let activeStrategy = data.strategy;
  
  if (data.strategy === 'DYNAMIC_AUTO') {
      if (data.btcChange24h <= -1.5) {
          activeStrategy = 'OVERSOLD_REBOUND'; // Bearish Hunter
      } else if (data.btcChange24h >= 1.5) {
          activeStrategy = 'EMA_SCALPING'; // Bullish Trend
      } else if (data.btcChange24h > -0.5 && data.btcChange24h < 0.5) {
          // Very tight sideways — Micro Scalping catches small bounces
          activeStrategy = 'MICRO_SCALPING';
      } else {
          activeStrategy = 'SCALPER_5M'; // Slightly trending sideways
      }
  }

  // Hard Filter for BTC Crash (Security)
  if (data.btcChange24h < -MAX_BTC_DROP_PERCENT) {
    return { action: 'HOLD', reason: `BTC Crash (${data.btcChange24h.toFixed(1)}%)`, confidence: 0 };
  }
  
  // Strategy 1: OVERSOLD REBOUND (Contrarian / Mean Reversion)
  // Best for Bearish Market or sudden plunges
  // Requires RSI to be low AND price to start bouncing above EMA9
  if (activeStrategy === 'OVERSOLD_REBOUND') {
    const isOversold = data.rsi <= RSI_OVERSOLD_EXTREME;
    const isBouncing = data.currentPrice > data.ema9;
    const rsiRecovering = data.rsi > 28;
    const stochConfirm = (data.stochK || 0) > (data.stochD || 0);

    const checklist = getChecklist([
        { label: 'Oversold', met: isOversold },
        { label: 'Bounce', met: isBouncing },
        { label: 'Stoch', met: stochConfirm }
    ]);

    if (isOversold && isBouncing && rsiRecovering && stochConfirm) {
      return { 
        action: 'BUY', 
        reason: `${checklist} | Bearish Rebound OK`, 
        confidence: 90 
      };
    }
    
    let waitReason = 'Scanning...';
    if (!isOversold) waitReason = 'RSI too high';
    else if (!isBouncing) waitReason = 'Price < EMA9';
    else if (!rsiRecovering) waitReason = 'RSI too low';
    
    return { action: 'HOLD', reason: `${checklist} | ${waitReason}`, confidence: 0 };
  }

  // Strategy 2: EMA SCALPING (Standard Golden Cross)
  if (activeStrategy === 'EMA_SCALPING' || activeStrategy === 'SCALPING') {
    const isAggressive = activeStrategy === 'SCALPING';
    const emaCross = data.ema9 > data.ema21;
    const priceAbove = data.currentPrice > (data.ema9 * 0.998); // Allow 0.2% margin
    const rsiLimit = isAggressive ? 65 : 60;
    const rsiOk = data.rsi <= rsiLimit;
    const volumeMultiplier = isAggressive ? 1.0 : 1.1;
    const volumeOk = data.volume >= (data.avgVolume * volumeMultiplier);
    const stochConfirm = (data.stochK || 0) > (data.stochD || 0);

    const checklist = getChecklist([
        { label: 'EMA', met: emaCross },
        { label: 'MA9', met: priceAbove },
        { label: 'RSI', met: rsiOk },
        { label: 'Stoch', met: stochConfirm }
    ]);

    if (emaCross && priceAbove && rsiOk && volumeOk && stochConfirm) {
      return { 
        action: 'BUY', 
        reason: `${checklist} | ${isAggressive ? 'Pure Scalper' : 'EMA Cross'} OK`, 
        confidence: isAggressive ? 80 : 90 
      };
    }

    // Provide specific reason for skip
    let skipReason = 'Scanning...';
    if (!emaCross) skipReason = 'EMA Bearish';
    else if (!priceAbove) skipReason = 'Price < EMA9';
    else if (!rsiOk) skipReason = `RSI > ${rsiLimit}`;
    else if (!volumeOk) skipReason = 'Low Volume';
    
    return { action: 'HOLD', reason: `${checklist} | ${skipReason}`, confidence: 0 };
  }

  // Strategy 4: DAY & SWING TRADING (Higher RSI tolerance, higher volume requirement)
  if (activeStrategy === 'DAY_TRADING' || activeStrategy === 'SWING_TRADING') {
    const isSwing = activeStrategy === 'SWING_TRADING';
    const emaCross = data.ema9 > data.ema21;
    const rsiLimit = isSwing ? 65 : 60;
    const volumeMultiplier = isSwing ? 1.5 : 1.2;
    const volumeOk = data.volume >= (data.avgVolume * volumeMultiplier);

    const checklist = getChecklist([
        { label: 'EMA', met: emaCross },
        { label: 'RSI', met: data.rsi <= rsiLimit },
        { label: 'Vol', met: volumeOk }
    ]);

    if (emaCross && data.rsi <= rsiLimit && volumeOk) {
      return { 
        action: 'BUY', 
        reason: `${checklist} | ${isSwing ? 'Swing' : 'Day'} Trading OK`, 
        confidence: 80 
      };
    }

    let skipReason = 'Scanning...';
    if (!emaCross) skipReason = 'EMA Bearish';
    else if (data.rsi > rsiLimit) skipReason = `RSI > ${rsiLimit}`;
    else if (!volumeOk) skipReason = 'Low Volume';
    
    return { action: 'HOLD', reason: `${checklist} | ${skipReason}`, confidence: 0 };
  }

  // Strategy 3: SAKTI SCALPER 5M (User Proposal)
  // Simplified entry for more frequent trades
  if (activeStrategy === 'SCALPER_5M') {
    const emaTrend = data.ema9 > data.ema21;
    const priceMomentum = data.currentPrice > data.ema9;
    const rsiNotExtreme = data.rsi > 35 && data.rsi < 65;
    const volumeOk = data.volume > data.avgVolume;

    const checklist = getChecklist([
        { label: 'Trend', met: emaTrend },
        { label: 'MA9', met: priceMomentum },
        { label: 'RSI', met: rsiNotExtreme },
        { label: 'Vol', met: volumeOk }
    ]);

    if (emaTrend && priceMomentum && rsiNotExtreme && volumeOk) {
      return { 
        action: 'BUY', 
        reason: `${checklist} | Scalper 5M Approved`, 
        confidence: 80 
      };
    }
    
    let skipReason = 'Scanning...';
    if (!emaTrend) skipReason = 'EMA Bearish';
    else if (!priceMomentum) skipReason = 'Price < EMA9';
    else if (!rsiNotExtreme) skipReason = 'RSI Extreme';
    else if (!volumeOk) skipReason = 'Low Volume';
    
    return { action: 'HOLD', reason: `${checklist} | ${skipReason}`, confidence: 0 };
  }

  // Strategy 5: MICRO SCALPING (Stochastic RSI + EMA 25)
  if (activeStrategy === 'MICRO_SCALPING') {
    const k = data.stochK ?? 50;
    const d = data.stochD ?? 50;
    // Prefer EMA25 directly; if unavailable, fallback to EMA21 with a slight buffer to reduce false signals
    const ema25 = data.ema25 || (data.ema21 * 1.002); 
    const hasRealEma25 = !!data.ema25;
    
    const isOversold = k < 20; 
    const isGoldenCross = k > d;
    const priceFilter = data.currentPrice > (ema25 * 0.995); 
    const isAboveEma25 = data.currentPrice > ema25;
    // Volume filter: avoid entry during illiquid/thin market (minimum 0.8x avg volume)
    const volumeOk = data.volume >= (data.avgVolume * 0.8);
    const stochMomentum = (k - d) > 2; // Require clear separation, not just marginal cross

    const checklist = getChecklist([
        { label: 'Stoch<20', met: isOversold },
        { label: 'K>D+2', met: stochMomentum },
        { label: hasRealEma25 ? 'MA25' : 'MA21*', met: isAboveEma25 },
        { label: 'Vol', met: volumeOk }
    ]);

    if (isOversold && isGoldenCross && stochMomentum && priceFilter && isAboveEma25 && volumeOk) {
      return { 
        action: 'BUY', 
        reason: `${checklist} | Micro-Scalp OK (K:${k.toFixed(1)},D:${d.toFixed(1)})${!hasRealEma25 ? ' [EMA21 fallback]' : ''}`, 
        confidence: hasRealEma25 ? 90 : 75 
      };
    }

    let skipReason = 'Scanning...';
    if (!isOversold) skipReason = `Stoch K:${k.toFixed(0)} not Oversold`;
    else if (!stochMomentum) skipReason = 'K-D gap too small';
    else if (!isAboveEma25) skipReason = `Price < ${hasRealEma25 ? 'EMA25' : 'EMA21'}`;
    else if (!volumeOk) skipReason = 'Low Volume';
    else if (!priceFilter) skipReason = 'Price Crash Guard';

    return { action: 'HOLD', reason: `${checklist} | ${skipReason}`, confidence: 0 };
  }

  return { action: 'HOLD', reason: 'Scanning for signal...', confidence: 0 };
};

export const checkExitSignal = (
  entryPrice: number,
  currentPrice: number,
  highestPrice: number,
  tp: number,
  sl: number
): TradeSignal => {
  const { TRAILING_DISTANCE, BREAKEVEN_TRIGGER } = TRADING_CONFIG;
  const profit = ((currentPrice - entryPrice) / entryPrice) * 100;
  const dropFromPeak = ((highestPrice - currentPrice) / highestPrice) * 100;

  // 1. HARD STOP LOSS (Safety First)
  if (profit <= -sl) {
    return { action: 'SELL', reason: `Stop Loss Hit (${profit.toFixed(1)}%)`, confidence: 100 };
  }

  // 2. TRAILING TAKE PROFIT (Let Profits Run)
  // If we are above or at TP target, we don't sell immediately.
  // We only sell if price drops by TRAILING_DISTANCE from the highest peak reached.
  if (profit >= tp) {
    if (dropFromPeak >= TRAILING_DISTANCE) {
      return { action: 'SELL', reason: `TTP: Captured Run (${profit.toFixed(1)}%)`, confidence: 100 };
    }
    return { action: 'HOLD', reason: `TTP Active: Riding Trend (+${profit.toFixed(1)}%)`, confidence: 0 };
  }

  // 3. BREAKEVEN PROTECTION (Move SL to Entry)
  // If we ever reached the BREAKEVEN_TRIGGER (e.g. 1%), but now price has fallen 
  // back to entry level (+0.1% buffer), we sell to protect capital.
  const peakProfit = ((highestPrice - entryPrice) / entryPrice) * 100;
  if (peakProfit >= BREAKEVEN_TRIGGER && profit <= 0.1) {
    return { action: 'SELL', reason: `Breakeven Protection (Peak was ${peakProfit.toFixed(1)}%)`, confidence: 80 };
  }

  return { action: 'HOLD', reason: 'Scanning for peak...', confidence: 0 };
};
