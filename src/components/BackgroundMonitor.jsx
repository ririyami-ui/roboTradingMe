import React, { useRef } from 'react';

const BackgroundMonitor = ({ configs, isEnabled, loading }) => {
    const scrollContainerRef = useRef(null);

    // Filter and sort to prioritize coins with active signals, limiting to top 4
    const activeConfigs = configs ? [...configs].sort((a, b) => {
        const scoreA = a.last_signal === 'BUY' ? 2 : (a.last_signal === 'SELL' ? 1 : 0);
        const scoreB = b.last_signal === 'BUY' ? 2 : (b.last_signal === 'SELL' ? 1 : 0);
        return scoreB - scoreA;
    }).slice(0, 4) : [];

    // Jika belum ada config, tampilkan skeleton/placeholder 4 kotak
    const displayCoins = activeConfigs.length > 0 ? activeConfigs : Array(4).fill(0).map((_, i) => ({
        coin_id: `INITIALIZING...`,
        last_signal: 'CONNECT',
        updated_at: new Date().toISOString()
    }));

    if (!isEnabled) return null;

    return (
        <div className="mt-4 border-t border-gray-700/50 pt-4 animate-in fade-in duration-700">
            <div className="flex justify-between items-center mb-3">
                <h5 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    Live Background Monitor
                </h5>
                <div className="flex items-center gap-3">
                    <span className="text-[9px] text-gray-500 font-mono">{activeConfigs.length > 0 ? `${activeConfigs.length} Coins Syncing` : 'Loading...'}</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => scrollContainerRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                            className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-cyan-900 border border-gray-700 hover:border-cyan-500/50 rounded-md text-gray-400 hover:text-cyan-400 transition-colors shadow-sm"
                            title="Scroll Left"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <button
                            onClick={() => scrollContainerRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                            className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-cyan-900 border border-gray-700 hover:border-cyan-500/50 rounded-md text-gray-400 hover:text-cyan-400 transition-colors shadow-sm"
                            title="Scroll Right"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar snap-x scroll-smooth"
            >
                {displayCoins.map((coin, idx) => (
                    <div
                        key={coin.coin_id === 'INITIALIZING...' ? `init-${idx}` : coin.coin_id}
                        className="flex-none w-[42%] md:w-[28%] lg:w-[23%] bg-gray-900/60 border border-gray-800 rounded-lg p-3 transition-all hover:border-cyan-500/30 group relative overflow-hidden h-32 flex flex-col justify-between shadow-lg snap-start"
                    >
                        {/* Background subtle glow if signal exists */}
                        {coin.last_signal === 'BUY' && <div className="absolute inset-0 bg-green-500/5 pointer-events-none animate-pulse"></div>}
                        {coin.last_signal === 'SELL' && <div className="absolute inset-0 bg-red-500/5 pointer-events-none"></div>}

                        <div className="flex justify-between items-start">
                            <span className="text-[11px] font-black text-white group-hover:text-cyan-400 transition-colors uppercase truncate mr-1">
                                {coin.coin_id}
                            </span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${coin.last_signal === 'BUY' ? 'bg-green-500/20 text-green-400' :
                                coin.last_signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                                    'bg-gray-800 text-gray-500'
                                }`}>
                                {coin.last_signal || 'INIT'}
                            </span>
                        </div>

                        <div className="mt-1 flex flex-col gap-1">
                            {/* Sentiment badge */}
                            <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${coin.market_sentiment?.includes('Active') ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' :
                                    coin.market_sentiment?.includes('Saturated') ? 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]' :
                                        'bg-gray-600'
                                    }`}></span>
                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">
                                    {coin.market_sentiment || 'Analysing...'}
                                </span>
                            </div>

                            {/* Advice text */}
                            <div className="text-[10px] text-cyan-500/80 font-medium italic border-l border-cyan-500/30 pl-2 py-0.5">
                                "{coin.advice || 'Gathering data...'}"
                            </div>
                        </div>

                        <div className="mt-1.5 flex justify-between items-end border-t border-gray-800/50 pt-1.5">
                            <div className="flex flex-col">
                                <span className="text-[7px] text-gray-600 uppercase font-black">Oracle Sync</span>
                                <span className="text-[9px] text-gray-500 font-mono">
                                    {new Date(coin.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className="text-[8px] text-gray-600 font-mono">
                                v2.1
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    height: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(31, 41, 55, 0.5);
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(34, 211, 238, 0.3);
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(34, 211, 238, 0.6);
                }
            `}} />
        </div>
    );
};

export default BackgroundMonitor;
