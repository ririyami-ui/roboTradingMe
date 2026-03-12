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
import MarketPulse from './components/MarketPulse';

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
  const [isScannerActive, setIsScannerActive] = useState(() => localStorage.getItem('lastBotMode') === 'scanner');
  const [isSimulation, setIsSimulation] = useState(() => localStorage.getItem('lastIsSimulation') !== 'false');
  const [activeTab, setActiveTab] = useState('radar'); // [NEW] Mobile Navigation Tab

  const period = activePeriod.period;

  const { categorizedCoins, allCoins, loading: coinListLoading } = useCoinList();
  const bgBotProps = useBackgroundBot(user);
  const { userPrefs, updateUserSettings } = bgBotProps;
  const { loading, ohlcData, signals, latestSignal, ema12, ema26, sma7, sma30, rsi } = useChartAnalytics({ coinId, period });

  const { analysis, isAnalyzing, error: analysisError, getAnalysis, clearAnalysis } = useGeminiAnalysis();

  // Guard to prevent "bouncing" when local state is ahead of cloud state
  const isSyncingRef = React.useRef(false);
  const isFirstSyncRef = React.useRef(true);

  // Sync Cloud Settings
  React.useEffect(() => {
    // If we just manually triggered a sync, don't let stale cloud data pull us back
    if (isSyncingRef.current) {
      return;
    }

    if (userPrefs.coinId && userPrefs.coinId !== coinId && isFirstSyncRef.current) {
      setCoinId(userPrefs.coinId);
    }

    if (userPrefs.botMode && isFirstSyncRef.current) {
      const isScanner = userPrefs.botMode === 'scanner';
      if (isScanner !== isScannerActive) {
        setIsScannerActive(isScanner);
        localStorage.setItem('lastBotMode', userPrefs.botMode);
      }
    }

    if (userPrefs.isSimulation !== undefined && userPrefs.isSimulation !== isSimulation && isFirstSyncRef.current) {
      setIsSimulation(userPrefs.isSimulation);
      localStorage.setItem('lastIsSimulation', userPrefs.isSimulation.toString());
    }

    // After first load from cloud, we stop forcing these values to allow local UI changes
    if (!bgBotProps.loading && isFirstSyncRef.current && userPrefs.coinId) {
      console.log("SaktiBot: Initial cloud sync completed.");
      isFirstSyncRef.current = false;
    }
  }, [userPrefs, bgBotProps.loading]);

  // Handle mode changes locally and sync to cloud
  const handleModeChange = async (isScanner) => {
    isSyncingRef.current = true;
    setIsScannerActive(isScanner);
    const modeStr = isScanner ? 'scanner' : 'single';
    localStorage.setItem('lastBotMode', modeStr);

    try {
      await updateUserSettings({ last_bot_mode: modeStr });
    } finally {
      // Small delay to let Supabase state settle if needed
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    }
  };

  const handleSimToggle = async (val) => {
    isSyncingRef.current = true;
    setIsSimulation(val);
    localStorage.setItem('lastIsSimulation', val.toString());

    try {
      await updateUserSettings({ last_is_simulation: val });
    } finally {
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    }
  };

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
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-md shadow-lg p-3 sm:p-4 flex justify-between items-center px-4 sm:px-6 border-b border-gray-800">
        <div className="flex items-center gap-2 sm:gap-3">
          <img src="/logo.png" alt="SaktiBot Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
          <h1 className="text-xl sm:text-2xl font-black text-cyan-400 tracking-tighter uppercase italic">SaktiBot <span className="text-white not-italic font-light hidden xs:inline">Trade</span></h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-white">{user.displayName}</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest">{user.email}</span>
          </div>
          <img src={user.photoURL} alt="Profile" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-gray-700 shadow-sm" title={user.displayName} />
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
        <MarketPulse />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Mobile Logic: Only show sections matching activeTab, but Desktop shows everything */}
          
          {/* Kolom Kiri: Kontrol & Analisis */}
          <div className={`${activeTab === 'market' || activeTab === 'control' ? 'flex' : 'hidden'} lg:flex lg:col-span-1 flex-col gap-6`}>
            {/* Fastest Movers (24h) */}
            <div className={activeTab === 'market' ? 'block' : 'hidden lg:block'}>
              <FastMovementList onCoinSelect={handleCoinSelection} />
            </div>

            {/* Card: Kontrol Pilihan */}
            <div className={activeTab === 'control' ? 'block' : 'hidden lg:block'}>
              {coinListLoading ? (
                <ControlSkeleton />
              ) : (
                <div className="bg-gray-800 rounded-xl shadow-md p-5 border border-gray-700/50">
                  <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2">Kontrol</h2>
                  <div className="space-y-4">
                    {!isScannerActive && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label htmlFor="coin-search" className="text-[10px] font-bold uppercase text-gray-500">Cari</label>
                          <input
                            id="coin-search"
                            type="text"
                            placeholder="Cari..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-gray-700/50 border border-gray-600 rounded-md px-2 py-1 text-xs text-white focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor="coin-select" className="text-[10px] font-bold uppercase text-gray-500">Pilih</label>
                          <select
                            id="coin-select"
                            value={coinId}
                            onChange={(e) => setCoinId(e.target.value)}
                            className="bg-gray-700/50 border border-gray-600 rounded-md px-2 py-1 text-xs text-white focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full"
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
                    )}
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
            </div>
          </div>

          {/* Kolom Kanan: Grafik */}
          <div className={`${activeTab === 'radar' || activeTab === 'control' ? 'block' : 'hidden'} lg:block lg:col-span-3 bg-gray-800 rounded-xl shadow-lg p-2 h-[350px] lg:h-[480px] overflow-hidden relative border border-gray-700/50`}>
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
        <div className={`${activeTab === 'radar' ? 'block' : 'hidden'} lg:block mt-8`}>
          <OpportunityRadar onCoinSelect={handleCoinSelection} />
        </div>

        <div className={`${activeTab === 'activity' || activeTab === 'control' ? 'block' : 'hidden'} lg:block mt-6`}>
          <TradingBotPanel
            coinId={coinId}
            setCoinId={setCoinId}
            currentSignal={latestSignal}
            onLogout={logout}
            onScannerStatusChange={setIsScannerActive}
            isSimulation={isSimulation}
            isScannerActive={isScannerActive}
            onSimToggle={handleSimToggle}
            onModeChange={handleModeChange}
            isMinimal={activeTab === 'control'} // Minimal on 'Bot' tab to avoid overlap with Logs tab
          />
        </div>

        {/* Baris Baru: Informasi Koin Trending */}
        <div className={`${activeTab === 'market' ? 'block' : 'hidden'} lg:block`}>
          <TrendingCoins onCoinSelect={handleCoinSelection} />
          <MarketMovers onCoinSelect={handleCoinSelection} />
        </div>
      </main>

      {/* [NEW] Bottom Navigation for Mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-lg border-t border-gray-800 px-6 py-2 flex justify-between items-center z-50">
        <button 
          onClick={() => setActiveTab('radar')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'radar' ? 'text-cyan-400' : 'text-gray-500'}`}
        >
          <span className="text-xl">📡</span>
          <span className="text-[10px] font-bold uppercase">Radar</span>
        </button>
        <button 
          onClick={() => setActiveTab('market')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'market' ? 'text-cyan-400' : 'text-gray-500'}`}
        >
          <span className="text-xl">📊</span>
          <span className="text-[10px] font-bold uppercase">Pasar</span>
        </button>
        <button 
          onClick={() => setActiveTab('activity')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'activity' ? 'text-cyan-400' : 'text-gray-500'}`}
        >
          <span className="text-xl">📜</span>
          <span className="text-[10px] font-bold uppercase">Log</span>
        </button>
        <button 
          onClick={() => setActiveTab('control')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'control' ? 'text-cyan-400' : 'text-gray-500'}`}
        >
          <span className="text-xl">⚙️</span>
          <span className="text-[10px] font-bold uppercase">Bot</span>
        </button>
      </nav>

      {/* Extra spacing at the bottom for mobile to prevent content overlap with nav */}
      <div className="h-20 lg:hidden"></div>

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
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
