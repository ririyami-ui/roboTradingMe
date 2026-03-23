import { useState, useEffect, useMemo } from "react";
import { fetchChartHistory } from "../utils/indodaxApi";
import { calcSMA } from "../utils/calcSMA";
import { calcEMA } from "../utils/calcEMA"; // Refresh
import { calcRSI } from "../utils/calcRSI";
import { generateSignals, Signal } from "../utils/signals";
import { analyzeEMAScalping } from "../utils/technicalIndicators";

interface ChartData {
    Time: number;
    Open: number | string;
    High: number | string;
    Low: number | string;
    Close: number | string;
    Volume?: number | string;
}

export interface OhlcData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface IndicatorPoint {
    time: number;
    value: number;
}

interface AnalyticsResult {
    ohlcData: OhlcData[] | null;
    signals: Signal[];
    latestSignal: Signal | { type: string };
    ema12: IndicatorPoint[];
    ema26: IndicatorPoint[];
    sma7: IndicatorPoint[];
    sma30: IndicatorPoint[];
    rsi: IndicatorPoint[];
}

interface UseChartAnalyticsProps {
    coinId: string;
    period: string | number;
    strategy?: string;
}

/**
 * Custom hook untuk mengambil data chart dari INDODAX, menghitung indikator, dan menghasilkan sinyal.
 */
export function useChartAnalytics({ coinId, period, strategy = 'SCALPING' }: UseChartAnalyticsProps) {
  const [data, setData] = useState<ChartData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetchIndodaxData = async () => {
      try {
        if (!coinId) return;
        
        let formattedPair = coinId.toUpperCase().replace('-', '');
        if (!formattedPair.includes('IDR')) {
          const baseMap: Record<string, string> = {
            'BITCOIN': 'BTC',
            'ETHEREUM': 'ETH',
            'TETHER': 'USDT',
            'BINANCECOIN': 'BNB',
            'SOLANA': 'SOL',
            'RIPPLE': 'XRP',
            'CARDANO': 'ADA'
          };
          const base = baseMap[formattedPair] || formattedPair;
          formattedPair = `${base}IDR`;
        }

        const to = Math.floor(Date.now() / 1000);
        let periodInMinutes = 15;

        if (typeof period === 'string') {
          if (period.endsWith('D')) {
            periodInMinutes = parseInt(period) * 24 * 60;
          } else if (period.endsWith('W')) {
            periodInMinutes = parseInt(period) * 7 * 24 * 60;
          } else {
            periodInMinutes = parseInt(period);
          }
        } else if (typeof period === 'number') {
          periodInMinutes = period;
        }

        const from = to - (periodInMinutes * 60 * 500);
        const historyData = await fetchChartHistory(formattedPair, period.toString(), from, to);

        if (isMounted) {
          setData(historyData);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching Indodax chart data:", error);
        if (isMounted) {
          setData(null);
          setLoading(false);
        }
      }
    };

    fetchIndodaxData();
    const interval = setInterval(fetchIndodaxData, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [coinId, period]);

  const analytics = useMemo((): AnalyticsResult => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { ohlcData: null, signals: [], latestSignal: { type: 'HOLD' }, ema12: [], ema26: [], sma7: [], sma30: [], rsi: [] };
    }

    const ohlcData: OhlcData[] = data.map(d => ({
      time: d.Time,
      open: typeof d.Open === 'string' ? parseFloat(d.Open) : d.Open,
      high: typeof d.High === 'string' ? parseFloat(d.High) : d.High,
      low: typeof d.Low === 'string' ? parseFloat(d.Low) : d.Low,
      close: typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close
    }));

    if (ohlcData.length === 0) {
      return { ohlcData: null, signals: [], latestSignal: { type: 'HOLD' }, ema12: [], ema26: [], sma7: [], sma30: [], rsi: [] };
    }

    const prices = ohlcData.map(d => d.close);

    const sma7Values = calcSMA(prices, 7) as (number | null)[];
    const sma30Values = calcSMA(prices, 30) as (number | null)[];
    const ema12Values = calcEMA(prices, 12) as (number | null)[];
    const ema26Values = calcEMA(prices, 26) as (number | null)[];

    let signals: Signal[] = [];
    if (strategy === 'EMA_SCALPING') {
      for (let i = 30; i < prices.length; i++) {
        const slice = data.slice(0, i + 1).map(d => ({
          Open: typeof d.Open === 'string' ? parseFloat(d.Open) : d.Open,
          High: typeof d.High === 'string' ? parseFloat(d.High) : d.High,
          Low: typeof d.Low === 'string' ? parseFloat(d.Low) : d.Low,
          Close: typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close,
          Volume: typeof d.Volume === 'string' ? parseFloat(d.Volume) : d.Volume
        }));
        const signal = analyzeEMAScalping(slice as any);
        if (signal === 'BUY') {
          signals.push({ index: i, type: "BUY", price: prices[i] });
        }
      }
    } else {
      signals = generateSignals(prices);
    }
    const latestSignal = signals.length > 0 ? signals[signals.length - 1] : { type: 'HOLD' };

    const formatIndicatorData = (indicatorValues: (number | null)[], baseOhlcData: OhlcData[]): IndicatorPoint[] => {
      const formattedData: IndicatorPoint[] = [];
      for (let i = 0; i < indicatorValues.length; i++) {
        const value = indicatorValues[i];
        if (value !== null && baseOhlcData[i] && baseOhlcData[i].time !== undefined) {
          formattedData.push({ time: baseOhlcData[i].time, value });
        }
      }
      return formattedData;
    };

    const ema12 = formatIndicatorData(ema12Values, ohlcData);
    const ema26 = formatIndicatorData(ema26Values, ohlcData);
    const sma7 = formatIndicatorData(sma7Values, ohlcData);
    const sma30 = formatIndicatorData(sma30Values, ohlcData);

    const rsiValues = calcRSI(prices, 14);
    const rsi = formatIndicatorData(rsiValues, ohlcData);

    return { ohlcData, signals, latestSignal, ema12, ema26, sma7, sma30, rsi };
  }, [data, strategy]);

  return { loading, ...analytics };
}
