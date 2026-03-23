export function calcSMA(values: (number | null)[] = [], period: number = 7): (number | null)[] {
  if (values.length < period) return new Array(values.length).fill(null);
  
  const sma: (number | null)[] = [];
  
  // pad front to keep same length
  for (let i = 0; i < period - 1; i++) {
    sma.push(null);
  }

  for (let i = 0; i <= values.length - period; i++) {
    const slice = values.slice(i, i + period);
    const validSlice = slice.filter((v): v is number => v !== null);
    
    if (validSlice.length < period) {
       sma.push(null);
       continue;
    }
    
    const sum = validSlice.reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }

  // Adjust to return only the values.length array
  return sma.slice(0, values.length);
}
// Forced refresh
// Refresh 03/17/2026 00:21:40
