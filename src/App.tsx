import React, { useState, useEffect, useRef } from 'react';
import CandlestickChart from './components/CandlestickChart';
import axios from 'axios';
import { 
  useChartAnalytics, 
  useCoinList, 
  useGeminiAnalysis, 
  useAuth, 
  useBackgroundBot,
  useMarketPulse 
} from './hooks';
import { ControlSkeleton } from './components/SkeletonLoader';
import MarketMovers from './components/MarketMovers';
import TrendingCoins from './components/TrendingCoins';
import PwaPrompt from './components/PwaPrompt';
import ReactMarkdown from 'react-markdown';
import TradingBotPanel from './components/TradingBotPanel';
import Login from './components/Login';
import OpportunityRadar from './components/OpportunityRadar';
import FastMovementList from './components/FastMovementList';
import MarketPulse from './components/MarketPulse';


interface TimePeriod {
  label: string;
  period: string;
}

const TIME_PERIODS: TimePeriod[] = [
  { label: '5m', period: '5' },
  { label: '15m', period: '15' },
  { label: '1h', period: '60' },
  { label: '4h', period: '240' },
  { label: '1D', period: '1D' },
  { label: '3D', period: '3D' },
  { label: '1W', period: '1W' },
];

function App() {
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  const [coinId, setCoinId] = useState('bitcoin');
  const [activePeriod, setActivePeriod] = useState<TimePeriod>(TIME_PERIODS[1]); // 15m
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerActive, setIsScannerActive] = useState(() => localStorage.getItem('lastBotMode') === 'scanner');
  const [isSimulation, setIsSimulation] = useState(() => localStorage.getItem('lastIsSimulation') !== 'false');
  const [activeTab, setActiveTab] = useState('radar');

  const period = activePeriod.period;

  const { categorizedCoins, allCoins, loading: coinListLoading } = useCoinList();
  const bgBotProps = useBackgroundBot(user);
  const { userPrefs, updateUserSettings } = bgBotProps;
  
  const { loading, ohlcData, signals, latestSignal, ema12, ema26, sma7, sma30, rsi } = useChartAnalytics({ 
    coinId, 
    period,
    strategy: userPrefs?.botMode || 'SCALPING' // Corrected mapping if needed, userPrefs.botMode or tradingStrategy
  });

  const { analysis, isAnalyzing, getAnalysis, clearAnalysis } = useGeminiAnalysis();

  const isSyncingRef = useRef(false);
  const isFirstSyncRef = useRef(true);

  useEffect(() => {
    if (isSyncingRef.current) return;

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

    if (!bgBotProps.loading && isFirstSyncRef.current && userPrefs.coinId) {
      isFirstSyncRef.current = false;
    }
  }, [userPrefs, bgBotProps.loading, coinId, isScannerActive, isSimulation]);

  const handleModeChange = async (isScanner: boolean) => {
    isSyncingRef.current = true;
    setIsScannerActive(isScanner);
    const modeStr = isScanner ? 'scanner' : 'single';
    localStorage.setItem('lastBotMode', modeStr);

    try {
      await updateUserSettings({ botMode: modeStr });
    } finally {
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    }
  };

  const handleSimToggle = async (val: boolean) => {
    isSyncingRef.current = true;
    setIsSimulation(val);
    localStorage.setItem('lastIsSimulation', val.toString());

    try {
      await updateUserSettings({ isSimulation: val });
    } finally {
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={loginWithGoogle} />;
  }

  const filteredCoins = allCoins.filter(coin =>
    coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coin.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCoinSelection = (newCoinId: string) => {
    setCoinId(newCoinId);
    setSearchTerm('');
    updateUserSettings({ coinId: newCoinId });
  };

  const handleGetAnalysis = async () => {
    if (!ohlcData || ohlcData.length === 0) return;

    try {
      const rateResponse = await axios.get('/api-coingecko/simple/price', {
        params: { ids: 'bitcoin', vs_currencies: 'usd,idr' },
      });
      const btcPrices = rateResponse.data.bitcoin;
      const usdToIdrRate = btcPrices.idr / btcPrices.usd;

      getAnalysis({ prices: ohlcData.map(d => d.close), coinName: coinId, usdToIdrRate });
    } catch (error) {
      console.error("Failed to fetch USD to IDR rate:", error);
      getAnalysis({ prices: ohlcData.map(d => d.close), coinName: coinId, usdToIdrRate: 15500 }); // Default fallback
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
          <div className={`${activeTab === 'market' || activeTab === 'control' ? 'flex' : 'hidden'} lg:flex lg:col-span-1 flex-col gap-6`}>
            <div className={activeTab === 'market' ? 'block' : 'hidden lg:block'}>
              <FastMovementList onCoinSelect={handleCoinSelection} />
            </div>

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
                    {/* Added AI Analysis Button */}
                    <button 
                      onClick={handleGetAnalysis}
                      disabled={isAnalyzing}
                      className="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all active:scale-95"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          Menganalisis...
                        </>
                      ) : (
                        <>
                          <span>✨</span> Analisis AI
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

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
            isMinimal={activeTab === 'control'}
          />
        </div>

        <div className={`${activeTab === 'market' ? 'block' : 'hidden'} lg:block`}>
          <TrendingCoins onCoinSelect={handleCoinSelection} />
          <MarketMovers onCoinSelect={handleCoinSelection} />
        </div>
      </main>

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

      <div className="h-20 lg:hidden"></div>

      {analysis && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full border border-gray-700 flex flex-col max-h-[85vh]">
            <div className="prose prose-invert max-w-none p-6 overflow-y-auto">
              <ReactMarkdown>
                {analysis}
              </ReactMarkdown>
            </div>
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
