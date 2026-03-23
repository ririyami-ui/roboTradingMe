/**
 * Menghitung Relative Strength Index (RSI) untuk serangkaian data harga.
 * @param {number[]} prices - Array harga penutupan.
 * @param {number} period - Periode waktu untuk kalkulasi RSI (umumnya 14).
 * @returns {(number | null)[]} Array nilai RSI, dengan nilai null di awal sesuai periode.
 */
export function calcRSI(prices: (number | null)[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(prices.length).fill(null);
  
  const validPrices = prices.filter((p): p is number => p !== null);
  
  if (validPrices.length <= period) {
    return rsi;
  }

  let gains = 0;
  let losses = 0;

  // Find first index where we can start calculation
  let startIdx = 0;
  let count = 0;
  for(let i=1; i<prices.length; i++) {
    if (prices[i] !== null && prices[i-1] !== null) {
        count++;
        if (count === period) {
            startIdx = i;
            break;
        }
    } else {
        count = 0;
    }
  }
  
  if (startIdx === 0) return rsi;

  // Hitung gain/loss awal
  for (let i = startIdx - period + 1; i <= startIdx; i++) {
    const p1 = prices[i];
    const p0 = prices[i-1];
    if (p1 === null || p0 === null) continue;
    
    const change = p1 - p0;
    if (change > 0) {
      gains += change;
    } else {
      losses -= change; 
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = startIdx; i < prices.length; i++) {
    const p1 = prices[i];
    const p0 = prices[i-1];
    
    if (p1 === null || p0 === null) {
        rsi[i] = (i > 0) ? rsi[i-1] : null; // carry over or null
        continue;
    }

    if (i > startIdx) {
        const change = p1 - p0;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}
// Refresh 03/17/2026 00:21:40
