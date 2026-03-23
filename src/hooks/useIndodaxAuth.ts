import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';

interface LocalValues {
    apiKey: string;
    secretKey: string;
    geminiKey: string;
    tradingStrategy: string;
    takeProfit: number;
    stopLoss: number;
    tradeAmount: number;
    dailyLossLimit: number;
}

/**
 * Hook untuk mengelola penyimpanan dan pengambilan Indodax API Key dan Secret Key.
 * Mendukung sinkronisasi Cloud (Firestore) jika user login, atau localStorage sebagai fallback.
 */
export const useIndodaxAuth = () => {
    const { user } = useAuth();
    const cloudSettings = useSettings(user);

    // State lokal untuk kunci API (karena melibatkan enkripsi/localstorage)
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('indodax_api_key') || '');
    const [secretKey, setSecretKey] = useState(() => localStorage.getItem('indodax_secret_key') || '');
    const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');

    // Sinkronkan state lokal saat cloud settings dimuat
    useEffect(() => {
        if (cloudSettings.isLoaded) {
            if (cloudSettings.apiKey || cloudSettings.secretKey) {
                setApiKey(cloudSettings.apiKey || '');
                setSecretKey(cloudSettings.secretKey || '');
                setGeminiKey(cloudSettings.geminiKey || '');
            }
        }
    }, [cloudSettings.isLoaded, cloudSettings.apiKey, cloudSettings.secretKey, cloudSettings.geminiKey]);

    // Fungsi untuk menyimpan key
    const saveKeys = (newApiKey: string, newSecretKey: string, newGeminiKey?: string, extraSettings: any = {}) => {
        const payload = {
            apiKey: newApiKey,
            secretKey: newSecretKey,
            geminiKey: newGeminiKey !== undefined ? newGeminiKey : geminiKey,
            ...extraSettings
        };

        // Simpan ke Cloud jika user ada
        if (user) {
            cloudSettings.saveSettings(payload);
        }
        
        // Selalu simpan ke localStorage sebagai cadangan instan
        localStorage.setItem('indodax_api_key', newApiKey);
        localStorage.setItem('indodax_secret_key', newSecretKey);
        if (newGeminiKey !== undefined) localStorage.setItem('gemini_api_key', newGeminiKey);

        setApiKey(newApiKey);
        setSecretKey(newSecretKey);
        if (newGeminiKey !== undefined) setGeminiKey(newGeminiKey);
    };

    // Fungsi untuk menghapus key
    const clearKeys = () => {
        if (user) {
            cloudSettings.saveSettings({
                apiKey: '',
                secretKey: '',
                geminiKey: '',
                tradeAmount: 50000,
                tradingStrategy: 'SCALPING',
                takeProfit: 1.5,
                stopLoss: 1.0,
                dailyLossLimit: 5.0
            });
        }
        localStorage.removeItem('indodax_api_key');
        localStorage.removeItem('indodax_secret_key');
        localStorage.removeItem('gemini_api_key');
        setApiKey('');
        setSecretKey('');
        setGeminiKey('');
    };

    return {
        apiKey,
        secretKey,
        geminiKey,
        // Forward trading settings directly from cloudSettings
        tradingStrategy: cloudSettings.tradingStrategy || 'SCALPING',
        takeProfit: cloudSettings.takeProfit || 1.5,
        stopLoss: cloudSettings.stopLoss || 1.0,
        tradeAmount: cloudSettings.tradeAmount || 50000,
        dailyLossLimit: cloudSettings.dailyLossLimit || 5.0,
        hasKeys: !!(apiKey && secretKey),
        isReady: cloudSettings.isLoaded,
        isSyncing: cloudSettings.isSyncing,
        saveKeys,
        clearKeys
    };
};
