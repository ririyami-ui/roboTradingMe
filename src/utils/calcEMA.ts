export function calcEMA(values: (number | null)[] = [], period: number = 12): (number | null)[] {
  if (!values.length) return [];
  
  const k = 2 / (period + 1);
  const ema: (number | null)[] = [];
  
  // Find first index with enough valid data
  let startIndex = -1;
  let validCount = 0;
  for(let i=0; i<values.length; i++) {
    if (values[i] !== null) {
      validCount++;
      if (validCount === period) {
        startIndex = i;
        break;
      }
    } else {
      validCount = 0;
    }
  }

  if (startIndex === -1) return new Array(values.length).fill(null);

  // pad start
  for (let i = 0; i < startIndex; i++) ema.push(null);

  const initialSlice = values.slice(startIndex - period + 1, startIndex + 1).filter((v): v is number => v !== null);
  let prev = initialSlice.reduce((a, b) => a + b, 0) / period;
  ema.push(prev);

  for (let i = startIndex + 1; i < values.length; i++) {
    const current = values[i];
    if (current === null) {
      ema.push(null);
    } else {
      prev = current * k + prev * (1 - k);
      ema.push(prev);
    }
  }
  
  return ema;
}
// Refresh 03/17/2026 00:21:40
