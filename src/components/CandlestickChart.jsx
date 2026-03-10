import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

/**
 * Komponen untuk menampilkan grafik candlestick menggunakan Lightweight Charts.
 * @param {{ohlcData: Array, signals: Array, loading: boolean, ema12: Array, ema26: Array, sma7: Array, sma30: Array, rsi: Array}} props
 */
export default function CandlestickChart({ ohlcData, signals, loading, ema12, ema26, sma7, sma30, rsi }) {
  const chartContainerRef = useRef();

  useEffect(() => {
    if (!ohlcData || ohlcData.length === 0 || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.parentElement?.clientHeight || 450,
      layout: {
        background: { color: 'rgba(17, 24, 39, 0.5)' }, // dark gray with slight transparency
        textColor: '#9CA3AF', // gray-400
        fontSize: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.3)' }, // Very subtle gray-700
        horzLines: { color: 'rgba(55, 65, 81, 0.3)' }, // Very subtle gray-700
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(34, 211, 238, 0.5)',
          labelBackgroundColor: '#06B6D4',
        },
        horzLine: {
          color: 'rgba(34, 211, 238, 0.5)',
          labelBackgroundColor: '#06B6D4',
        },
      },
    });

    // Panel utama untuk candlestick
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981', // Emerald-500
      downColor: '#EF4444', // Red-500
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candlestickSeries.setData(ohlcData);

    // Menambahkan marker untuk sinyal BUY/SELL
    const signalMarkers = signals.map(s => ({
      time: ohlcData[s.index].time,
      position: s.type === 'BUY' ? 'belowBar' : 'aboveBar',
      color: s.type === 'BUY' ? '#34D399' : '#F87171',
      shape: s.type === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: s.type.toUpperCase(),
      size: 1,
    }));
    candlestickSeries.setMarkers(signalMarkers);

    // Menambahkan garis indikator (Tampilan lebih halus)
    const ema12Series = chart.addLineSeries({ color: 'rgba(129, 140, 248, 0.6)', lineWidth: 1.5 }); // Indigo-400
    ema12Series.setData(ema12);

    const ema26Series = chart.addLineSeries({ color: 'rgba(232, 121, 249, 0.6)', lineWidth: 1.5 }); // Fuchsia-400
    ema26Series.setData(ema26);

    // Panel terpisah untuk RSI (Lebih ramping)
    const rsiPane = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'rsi_id',
      lastValueVisible: false,
    });
    rsiPane.setData(rsi.map(d => ({
      time: d.time,
      value: d.value,
      color: d.value > 70 ? 'rgba(239, 68, 68, 0.3)' : d.value < 30 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.2)'
    })));

    chart.priceScale('rsi_id').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 }, // Hanya memakan 15% di bawah
    });

    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        const parent = chartContainerRef.current.parentElement;
        chart.resize(
          chartContainerRef.current.clientWidth,
          parent ? parent.clientHeight : 600
        );
      }
    };
    window.addEventListener('resize', handleResize);

    // Initial resize to match parent immediately
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [ohlcData, signals, ema12, ema26, sma7, sma30, rsi]);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">Loading chart...</div>;
  if (!ohlcData) return <div className="flex items-center justify-center h-full text-gray-400">No data available for candlestick chart.</div>;

  // The container div will be styled by the parent (App.jsx)
  // We add a key to force re-mount when ohlcData changes, which is a clean way to handle chart re-creation
  return <div ref={chartContainerRef} className="w-full h-full" />;
}