import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function PwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('Service Worker registered:', r);
    },
    onRegisterError(error) {
      console.log('Service Worker registration error:', error);
    },
  });

  useEffect(() => {
    const handler = (e) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Show the install button
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  if (needRefresh) {
    return (
      <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 bg-gray-900/95 backdrop-blur-md border border-cyan-500/50 text-white p-5 rounded-2xl shadow-2xl z-[100] flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/20 p-2 rounded-xl">
            <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg leading-tight">Update Tersedia!</h3>
            <p className="text-sm text-gray-400">Versi terbaru sudah siap untuk Anda gunakan.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={() => setNeedRefresh(false)}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Nanti saja
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-5 rounded-xl shadow-lg shadow-cyan-600/20 transition-all active:scale-95"
          >
            Perbarui Sekarang
          </button>
        </div>
      </div>
    );
  }

  if (showInstall) {
    return (
      <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 bg-gray-900/95 backdrop-blur-md border border-cyan-500/50 text-white p-5 rounded-2xl shadow-2xl z-[100] flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/20 p-2 rounded-xl">
            <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg leading-tight">Pasang Aplikasi</h3>
            <p className="text-sm text-gray-400">Akses SaktiBot Trade langsung dari layar utama Anda.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={() => setShowInstall(false)}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Abaikan
          </button>
          <button
            onClick={handleInstallClick}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-5 rounded-xl shadow-lg shadow-cyan-600/20 transition-all active:scale-95"
          >
            Instal Sekarang
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default PwaPrompt;