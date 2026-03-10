/**
 * Menghitung Relative Strength Index (RSI) untuk serangkaian data harga.
 * @param {number[]} prices - Array harga penutupan.
 * @param {number} period - Periode waktu untuk kalkulasi RSI (umumnya 14).
 * @returns {number[]} Array nilai RSI, dengan nilai null di awal sesuai periode.
 */
export function calcRSI(prices, period = 14) {
  const rsi = new Array(prices.length).fill(null);
  if (prices.length <= period) {
    return rsi;
  }

  let gains = 0;
  let losses = 0;

  // Hitung gain/loss awal
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change; // losses adalah nilai positif
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}