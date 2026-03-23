import React, { useEffect, useRef, memo } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, SeriesMarker } from 'lightweight-charts';
import { OhlcData, IndicatorPoint } from '../hooks/useChartAnalytics';
import { Signal } from '../utils/signals';

interface CandlestickChartProps {
  ohlcData: OhlcData[] | null;
  signals: Signal[];
  loading: boolean;
  ema12: IndicatorPoint[];
  ema26: IndicatorPoint[];
  sma7: IndicatorPoint[];
  sma30: IndicatorPoint[];
  rsi: IndicatorPoint[];
}

/**
 * Komponen untuk menampilkan grafik candlestick menggunakan Lightweight Charts.
 */
const CandlestickChart: React.FC<CandlestickChartProps> = ({ 
  ohlcData, 
  signals, 
  loading, 
  ema12, 
  ema26, 
  sma7, 
  sma30, 
  rsi 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ohlcData || ohlcData.length === 0 || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.parentElement?.clientHeight || 450,
      layout: {
        background: { color: 'rgba(17, 24, 39, 0.5)' },
        textColor: '#9CA3AF',
        fontSize: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.3)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.3)' },
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

    chartRef.current = chart;

    // Panel utama untuk candlestick
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candlestickSeries.setData(ohlcData as CandlestickData[]);

    // Menambahkan marker untuk sinyal BUY/SELL
    const signalMarkers: SeriesMarker<any>[] = signals.map(s => ({
      time: ohlcData[s.index].time as any,
      position: s.type === 'BUY' ? 'belowBar' : 'aboveBar',
      color: s.type === 'BUY' ? '#34D399' : '#F87171',
      shape: s.type === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: s.type.toUpperCase(),
      size: 1,
    }));
    candlestickSeries.setMarkers(signalMarkers);

    // Menambahkan garis indikator
    const ema12Series = chart.addLineSeries({ color: 'rgba(129, 140, 248, 0.6)', lineWidth: 1.5 });
    ema12Series.setData(ema12 as LineData[]);

    const ema26Series = chart.addLineSeries({ color: 'rgba(232, 121, 249, 0.6)', lineWidth: 1.5 });
    ema26Series.setData(ema26 as LineData[]);

    // Panel terpisah untuk RSI
    const rsiPane = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'rsi_id',
      lastValueVisible: false,
    });
    rsiPane.setData(rsi.map(d => ({
      time: d.time as any,
      value: d.value,
      color: d.value > 70 ? 'rgba(239, 68, 68, 0.3)' : d.value < 30 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.2)'
    })) as HistogramData[]);

    chart.priceScale('rsi_id').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
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
      chartRef.current = null;
    };
  }, [ohlcData, signals, ema12, ema26, sma7, sma30, rsi]);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">Loading chart...</div>;
  if (!ohlcData) return <div className="flex items-center justify-center h-full text-gray-400">No data available for candlestick chart.</div>;

  return <div ref={chartContainerRef} className="w-full h-full" />;
};

const MemoizedCandlestickChart = memo(CandlestickChart, (prevProps, nextProps) => {
  if (prevProps.loading !== nextProps.loading) return false;
  if (prevProps.ohlcData?.length !== nextProps.ohlcData?.length) return false;
  if (prevProps.signals?.length !== nextProps.signals?.length) return false;
  return true; 
});

export default MemoizedCandlestickChart;
