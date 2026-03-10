// src/utils/calcEMA.js
export function calcEMA(values = [], period = 12) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const ema = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  // pad start
  for (let i = 0; i < period - 1; i++) ema.push(null);
  ema.push(prev);
  for (let i = period; i < values.length; i++) {
    const current = values[i];
    prev = current * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}
