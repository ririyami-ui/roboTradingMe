import { calcEMA } from './calcEMA';

/**
 * Menghitung Moving Average Convergence Divergence (MACD).
 * @param {(number | null)[]} prices - Array harga penutupan.
 * @param {number} shortPeriod - Periode EMA pendek (umumnya 12).
 * @param {number} longPeriod - Periode EMA panjang (umumnya 26).
 * @param {number} signalPeriod - Periode EMA untuk garis sinyal (umumnya 9).
 * @returns {{macdLine: (number | null)[], signalLine: (number | null)[], histogram: (number | null)[]}}
 */
export function calcMACD(
  prices: (number | null)[], 
  shortPeriod: number = 12, 
  longPeriod: number = 26, 
  signalPeriod: number = 9
): { macdLine: (number | null)[], signalLine: (number | null)[], histogram: (number | null)[] } {
  const emaShort = calcEMA(prices, shortPeriod);
  const emaLong = calcEMA(prices, longPeriod);

  const macdLine = emaShort.map((val, index) => 
    (val !== null && emaLong[index] !== null ? val - (emaLong[index] as number) : null)
  );

  const signalLineIn = macdLine.map(v => v === null ? null : v);
  const signalLineRaw = calcEMA(signalLineIn, signalPeriod);
  
  const signalLine = signalLineRaw.map((val, index) => 
    macdLine[index] === null ? null : val
  );

  const histogram = macdLine.map((val, index) => {
    const sigVal = signalLine[index];
    if (val !== null && sigVal !== null) {
      return val - sigVal;
    }
    return null;
  });

  return { macdLine, signalLine, histogram };
}
// Refresh 03/17/2026 00:21:40
