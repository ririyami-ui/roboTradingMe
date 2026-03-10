// src/utils/calcSMA.js
export function calcSMA(values = [], period = 7) {
  if (values.length < period) return [];
  const sma = [];
  for (let i = 0; i <= values.length - period; i++) {
    const slice = values.slice(i, i + period);
    const sum = slice.reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  // pad front to keep same length (optional)
  return Array(period - 1).fill(null).concat(sma);
}
