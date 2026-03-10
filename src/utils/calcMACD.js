import { calcEMA } from './calcEMA';

/**
 * Menghitung Moving Average Convergence Divergence (MACD).
 * @param {number[]} prices - Array harga penutupan.
 * @param {number} shortPeriod - Periode EMA pendek (umumnya 12).
 * @param {number} longPeriod - Periode EMA panjang (umumnya 26).
 * @param {number} signalPeriod - Periode EMA untuk garis sinyal (umumnya 9).
 * @returns {{macdLine: number[], signalLine: number[], histogram: number[]}}
 */
export function calcMACD(prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const emaShort = calcEMA(prices, shortPeriod);
  const emaLong = calcEMA(prices, longPeriod);

  const macdLine = emaShort.map((val, index) => (val !== null && emaLong[index] !== null ? val - emaLong[index] : null));

  const signalLine = calcEMA(macdLine.map(v => v === null ? 0 : v), signalPeriod)
    .map((val, index) => macdLine[index] === null ? null : val);

  const histogram = macdLine.map((val, index) => {
    if (val !== null && signalLine[index] !== null) {
      return val - signalLine[index];
    }
    return null;
  });

  return { macdLine, signalLine, histogram };
}