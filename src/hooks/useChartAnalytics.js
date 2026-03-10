import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { calcSMA } from "../utils/calcSMA";
import { calcEMA } from "../utils/calcEMA";
import { calcRSI } from "../utils/calcRSI";
import { generateSignals } from "../utils/signals";

/**
 * Custom hook untuk mengambil data chart dari INDODAX, menghitung indikator, dan menghasilkan sinyal.
 * @param {string} coinId - ID koin (cth: 'btc-idr', 'eth-idr', atau 'bitcoin' yang akan diubah formatnya).
 * @param {number} period - Periode chart dalam menit (5, 15, 60, 240, 1440).
 * @returns {{loading: boolean, ohlcData: Array|null, signals: Array, latestSignal: object|null, ema12: Array, ema26: Array, sma7: Array, sma30: Array, rsi: Array}}
 */
export function useChartAnalytics({ coinId, period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetchIndodaxData = async () => {
      try {
        // Format coin_id: Indodax tradingview expects 'BTCIDR' formatting
        let formattedPair = coinId.toUpperCase().replace('-', '');
        if (!formattedPair.includes('IDR')) {
          const baseMap = {
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

        // Hitung range waktu (mundur misal 500 candle ke belakang)
        const to = Math.floor(Date.now() / 1000);

        let periodInMinutes = 15; // default fallback

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

        const response = await axios.get(`https://indodax.com/tradingview/history_v2?symbol=${formattedPair}&tf=${period}&from=${from}&to=${to}`);

        if (isMounted) {
          setData(response.data);
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

    // Opsional: Polling tiap 30 detik untuk real-time feel
    const interval = setInterval(fetchIndodaxData, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [coinId, period]);

  const analytics = useMemo(() => {
    // Data dari Indodax tradingview_v2: Array of Objects [{"Time":1699..., "Open":..., "High":...}]
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { ohlcData: null, signals: [], latestSignal: null, ema12: [], ema26: [], sma7: [], sma30: [], rsi: [] };
    }

    const ohlcData = data.map(d => ({
      time: d.Time,
      open: typeof d.Open === 'string' ? parseFloat(d.Open) : d.Open,
      high: typeof d.High === 'string' ? parseFloat(d.High) : d.High,
      low: typeof d.Low === 'string' ? parseFloat(d.Low) : d.Low,
      close: typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close
    }));

    if (ohlcData.length === 0) {
      return { ohlcData: null, signals: [], latestSignal: null, ema12: [], ema26: [], sma7: [], sma30: [], rsi: [] };
    }

    const prices = ohlcData.map(d => d.close);

    // Hitung semua indikator
    const sma7Values = calcSMA(prices, 7);
    const sma30Values = calcSMA(prices, 30);
    const ema12Values = calcEMA(prices, 12);
    const ema26Values = calcEMA(prices, 26);

    // Hasilkan sinyal BUY/SELL berdasarkan logic yang sama
    const signals = generateSignals(prices);
    const latestSignal = signals.length > 0 ? signals[signals.length - 1] : null;

    // Format data indikator untuk lightweight-charts
    const formatIndicatorData = (indicatorValues, baseOhlcData) => {
      const formattedData = [];
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

    // Hitung dan format RSI
    const rsiValues = calcRSI(prices, 14);
    const rsi = formatIndicatorData(rsiValues, ohlcData);

    return { ohlcData, signals, latestSignal, ema12, ema26, sma7, sma30, rsi };
  }, [data]);

  return { loading, ...analytics };
}