import { calcRSI } from "./calcRSI";
import { calcMACD } from "./calcMACD";

export interface Signal {
    index: number;
    type: 'BUY' | 'SELL' | 'HOLD';
    price: number | null;
}

/**
 * Menghasilkan sinyal "AI" (BUY/SELL) berdasarkan MACD Crossover dan RSI.
 * Logika:
 * - BUY: Garis MACD memotong ke atas garis Sinyal, DAN RSI tidak overbought (< 70).
 * - SELL: Garis MACD memotong ke bawah garis Sinyal, DAN RSI tidak oversold (> 30).
 * @param {(number | null)[]} prices - Array harga penutupan.
 * @returns {Signal[]} Array objek sinyal.
 */
export function generateSignals(prices: (number | null)[]): Signal[] {
  const requiredDataPoints = 35; // Perkiraan aman untuk MACD(12,26,9)
  if (!prices || prices.length < requiredDataPoints) {
    return [];
  }

  const { macdLine, signalLine } = calcMACD(prices);
  const rsi14 = calcRSI(prices, 14);

  const signals: Signal[] = [];

  for (let i = 1; i < prices.length; i++) {
    const prevMacd = macdLine[i-1];
    const prevSignal = signalLine[i-1];
    const currMacd = macdLine[i];
    const currSignal = signalLine[i];
    const currRsi = rsi14[i];

    // Cek kondisi crossover dan validitas data
    if (prevMacd !== null && prevSignal !== null && currMacd !== null && currSignal !== null && currRsi !== null) {
      // Sinyal BUY (Bullish Crossover)
      if (prevMacd <= prevSignal && currMacd > currSignal && currRsi < 70) {
        signals.push({ index: i, type: "BUY", price: prices[i] });
      }
      // Sinyal SELL (Bearish Crossover)
      else if (prevMacd >= prevSignal && currMacd < currSignal && currRsi > 30) {
        signals.push({ index: i, type: "SELL", price: prices[i] });
      }
    }
  }

  return signals;
}
// Refresh 03/17/2026 00:21:40
