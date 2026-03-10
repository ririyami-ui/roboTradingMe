import { calcRSI } from "./calcRSI";
import { calcMACD } from "./calcMACD";

/**
 * Menghasilkan sinyal "AI" (BUY/SELL) berdasarkan MACD Crossover dan RSI.
 * Logika:
 * - BUY: Garis MACD memotong ke atas garis Sinyal, DAN RSI tidak overbought (< 70).
 * - SELL: Garis MACD memotong ke bawah garis Sinyal, DAN RSI tidak oversold (> 30).
 * @param {number[]} prices - Array harga penutupan.
 * @returns {Array<{index: number, type: 'BUY' | 'SELL', price: number}>} Array objek sinyal.
 */
export function generateSignals(prices) {
  const requiredDataPoints = 35; // Perkiraan aman untuk MACD(12,26,9)
  if (!prices || prices.length < requiredDataPoints) {
    return [];
  }

  const { macdLine, signalLine } = calcMACD(prices);
  const rsi14 = calcRSI(prices, 14);

  const signals = [];

  for (let i = 1; i < prices.length; i++) {
    // Cek kondisi crossover dan validitas data
    if (macdLine[i-1] !== null && signalLine[i-1] !== null && macdLine[i] !== null && signalLine[i] !== null && rsi14[i] !== null) {
      // Sinyal BUY (Bullish Crossover)
      if (macdLine[i-1] <= signalLine[i-1] && macdLine[i] > signalLine[i] && rsi14[i] < 70) {
        signals.push({ index: i, type: "BUY", price: prices[i] });
      }
      // Sinyal SELL (Bearish Crossover)
      else if (macdLine[i-1] >= signalLine[i-1] && macdLine[i] < signalLine[i] && rsi14[i] > 30) {
        signals.push({ index: i, type: "SELL", price: prices[i] });
      }
    }
  }

  return signals;
}