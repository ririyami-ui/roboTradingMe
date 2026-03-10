import React, { useState } from 'react';
import CandlestickChart from './components/CandlestickChart';
import axios from 'axios';
import { useChartAnalytics } from './hooks/useChartAnalytics';
import { useCoinList } from './hooks/useCoinList';
import { ControlSkeleton, AnalysisSkeleton } from './components/SkeletonLoader';
import { useGeminiAnalysis } from './hooks/useGeminiAnalysis';
import MarketMovers from './components/MarketMovers';
import TrendingCoins from './components/TrendingCoins';
import PwaPrompt from './components/PwaPrompt';
import ReactMarkdown from 'react-markdown';
import TradingBotPanel from './components/TradingBotPanel';
import Login from './components/Login';
import { useAuth } from './hooks/useAuth';
import OpportunityRadar from './components/OpportunityRadar';
import FastMovementList from './components/FastMovementList';
import { useBackgroundBot } from './hooks/useBackgroundBot';

const TIME_PERIODS = [
  { label: '5m', period: '5' },
  { label: '15m', period: '15' },
  { label: '1h', period: '60' },
  { label: '4h', period: '240' }, // TradingView API often accepts 240 for 4 hours
  { label: '1D', period: '1D' },
  { label: '3D', period: '3D' },
  { label: '1W', period: '1W' },
];

function App() {
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  const [coinId, setCoinId] = useState('bitcoin');
  const [activePeriod, setActivePeriod] = useState(TIME_PERIODS.find(p => p.label === '15m'));
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerActive, setIsScannerActive] = useState(false);

  const period = activePeriod.period;

  const { categorizedCoins, allCoins, loading: coinListLoading } = useCoinList();
  const { userPrefs, updateUserSettings } = useBackgroundBot(user);
  const { loading, ohlcData, signals, latestSignal, ema12, ema26, sma7, sma30, rsi } = useChartAnalytics({ coinId, period });

  const { analysis, isAnalyzing, error: analysisError, getAnalysis, clearAnalysis } = useGeminiAnalysis();

  // Sync Cloud CoinId
  React.useEffect(() => {
    if (userPrefs.coinId && userPrefs.coinId !== coinId) {
      setCoinId(userPrefs.coinId);
    }
  }, [userPrefs.coinId]);

  // Loading state for Auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Login Gate
  if (!user) {
    return <Login onLogin={loginWithGoogle} />;
  }

  // Filter koin berdasarkan input pencarian
  const filteredCoins = allCoins.filter(coin =>
    coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coin.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fungsi untuk menangani pemilihan koin dari komponen anak
  const handleCoinSelection = (newCoinId) => {
    setCoinId(newCoinId);
    setSearchTerm(''); // Kosongkan pencarian agar dropdown kembali ke mode kategori
    updateUserSettings({ last_coin_id: newCoinId });
  };

  // Fungsi untuk mengambil kurs dan memicu analisis Gemini
  const handleGetAnalysis = async () => {
    if (!ohlcData || ohlcData.length === 0) return;

    try {
      // Ambil harga bitcoin dalam USD dan IDR untuk menghitung kurs
      const rateResponse = await axios.get('/api-coingecko/simple/price', {
        params: { ids: 'bitcoin', vs_currencies: 'usd,idr' },
      });
      const btcPrices = rateResponse.data.bitcoin;
      const usdToIdrRate = btcPrices.idr / btcPrices.usd;

      getAnalysis({ prices: ohlcData.map(d => d.close), coinName: coinId, usdToIdrRate });
    } catch (error) {
      console.error("Failed to fetch USD to IDR rate:", error);
      // Lanjutkan analisis tanpa kurs jika gagal
      getAnalysis({ prices: ohlcData.map(d => d.close), coinName: coinId, usdToIdrRate: null });
    }
  };

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans">
      <PwaPrompt />
      <header className="bg-gray-800/30 backdrop-blur-sm shadow-lg p-4 flex justify-between items-center px-6">
        <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">Crypto Signal Analyzer</h1>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-white">{user.displayName}</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest">{user.email}</span>
          </div>
          <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-gray-700 shadow-sm" title={user.displayName} />
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Kolom Kiri: Kontrol & Analisis */}
          <div className="lg:col-span-1 flex flex-col gap-6">

            {/* Card: Kontrol Pilihan */}
            {coinListLoading ? (
              <ControlSkeleton />
            ) : (
              <div className="bg-gray-800 rounded-xl shadow-md p-5 border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2">Controls</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="coin-search" className="text-[10px] font-bold uppercase text-gray-500">Search</label>
                      <input
                        id="coin-search"
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={isScannerActive}
                        className={`bg-gray-700/50 border border-gray-600 rounded-md px-2 py-1 text-xs text-white focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full ${isScannerActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="coin-select" className="text-[10px] font-bold uppercase text-gray-500">Select</label>
                      <select
                        id="coin-select"
                        value={coinId}
                        onChange={(e) => setCoinId(e.target.value)}
                        disabled={isScannerActive}
                        className={`bg-gray-700/50 border border-gray-600 rounded-md px-2 py-1 text-xs text-white focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full ${isScannerActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {searchTerm ? (
                          filteredCoins.map(coin => (
                            <option key={coin.id} value={coin.id}>{coin.symbol?.toUpperCase() || coin.name}</option>
                          ))
                        ) : (
                          Object.entries(categorizedCoins).map(([category, coins]) => (
                            <optgroup key={category} label={category} className="bg-gray-800 text-gray-400">
                              {coins.map(coin => (
                                <option key={coin.id} value={coin.id}>{coin.symbol?.toUpperCase() || coin.name}</option>
                              ))}
                            </optgroup>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-gray-500">Timeline</label>
                    <div className="flex overflow-x-auto gap-1 pb-1 custom-scrollbar">
                      {TIME_PERIODS.map((period) => (
                        <button
                          key={period.label}
                          onClick={() => setActivePeriod(period)}
                          className={`px-2 py-1 text-[10px] rounded transition-colors whitespace-nowrap ${activePeriod.label === period.label ? 'bg-cyan-500 text-gray-900 font-bold' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                          {period.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fastest Movers (1h) - Back in Sidebar */}
            <FastMovementList onCoinSelect={handleCoinSelection} />

          </div>

          {/* Kolom Kanan: Grafik */}
          <div className="lg:col-span-3 bg-gray-800 rounded-xl shadow-lg p-2 h-[350px] lg:h-[480px] overflow-hidden relative border border-gray-700/50">
            <CandlestickChart
              loading={loading}
              ohlcData={ohlcData}
              signals={signals}
              ema12={ema12}
              ema26={ema26}
              sma7={sma7}
              sma30={sma30}
              rsi={rsi}
            />
          </div>
        </div>

        {/* NEW: Opportunity Radar (Live Signals) */}
        <div className="mt-8">
          <OpportunityRadar onCoinSelect={handleCoinSelection} />
        </div>

        <div className="mt-6">
          <TradingBotPanel
            coinId={coinId}
            setCoinId={setCoinId}
            currentSignal={latestSignal}
            onLogout={logout}
            onScannerStatusChange={setIsScannerActive}
          />
        </div>

        {/* Baris Baru: Informasi Koin Trending */}
        <TrendingCoins onCoinSelect={handleCoinSelection} />

        {/* Baris Baru: Top Gainers & Losers */}
        <MarketMovers onCoinSelect={handleCoinSelection} />
      </main>

      {/* Modal untuk menampilkan hasil analisis Gemini */}
      {analysis && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          {/* Kartu Analisis dengan batasan tinggi dan layout flex */}
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full border border-gray-700 flex flex-col max-h-[85vh]">
            {/* Area konten yang bisa di-scroll */}
            <div className="prose prose-invert max-w-none p-6 overflow-y-auto">
              <ReactMarkdown>
                {analysis}
              </ReactMarkdown>
            </div>
            {/* Area tombol yang tetap di bawah */}
            <div className="p-6 border-t border-gray-700">
              <button onClick={clearAnalysis} className="bg-cyan-500 text-gray-900 font-bold py-2 px-4 rounded-lg w-full hover:bg-cyan-400 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
