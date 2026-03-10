import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';

/**
 * Hook untuk mengelola penyimpanan dan pengambilan Indodax API Key dan Secret Key.
 * Mendukung sinkronisasi Cloud (Firestore) jika user login, atau localStorage sebagai fallback.
 */
export const useIndodaxAuth = () => {
    const { user } = useAuth();
    const cloudSettings = useSettings(user);

    // State lokal untuk sinkronisasi instan sebelum cloud melapor balik (jika perlu)
    const [localKeys, setLocalKeys] = useState({
        apiKey: '',
        secretKey: '',
        geminiKey: ''
    });

    // Sinkronkan state lokal saat cloud settings dimuat
    useEffect(() => {
        if (cloudSettings.isLoaded) {
            setLocalKeys({
                apiKey: cloudSettings.apiKey,
                secretKey: cloudSettings.secretKey,
                geminiKey: cloudSettings.geminiKey
            });
        } else {
            // Fallback ke localStorage jika belum login/belum sinkron
            const storedApiKey = localStorage.getItem('indodax_api_key');
            const storedSecretKey = localStorage.getItem('indodax_secret_key');
            const storedGeminiKey = localStorage.getItem('gemini_api_key');

            if (storedApiKey || storedSecretKey) {
                setLocalKeys({
                    apiKey: storedApiKey || '',
                    secretKey: storedSecretKey || '',
                    geminiKey: storedGeminiKey || ''
                });
            }
        }
    }, [cloudSettings.isLoaded, cloudSettings.apiKey, cloudSettings.secretKey, cloudSettings.geminiKey]);

    // Fungsi untuk menyimpan key
    const saveKeys = (newApiKey, newSecretKey, newGeminiKey) => {
        const payload = {
            apiKey: newApiKey,
            secretKey: newSecretKey,
            geminiKey: newGeminiKey || localKeys.geminiKey,
            tradeAmount: cloudSettings.tradeAmount,
            isSimulation: cloudSettings.isSimulation
        };

        // Simpan ke Cloud jika user ada
        if (user) {
            cloudSettings.saveSettings(payload);
        } else {
            // Fallback localStorage
            localStorage.setItem('indodax_api_key', newApiKey);
            localStorage.setItem('indodax_secret_key', newSecretKey);
            if (newGeminiKey !== undefined) localStorage.setItem('gemini_api_key', newGeminiKey);
        }

        setLocalKeys(prev => ({
            ...prev,
            apiKey: newApiKey,
            secretKey: newSecretKey,
            geminiKey: newGeminiKey !== undefined ? newGeminiKey : prev.geminiKey
        }));
    };

    // Fungsi untuk menghapus key
    const clearKeys = () => {
        if (user) {
            cloudSettings.saveSettings({
                apiKey: '',
                secretKey: '',
                geminiKey: '',
                tradeAmount: 50000,
                isSimulation: true
            });
        }

        localStorage.removeItem('indodax_api_key');
        localStorage.removeItem('indodax_secret_key');
        localStorage.removeItem('gemini_api_key');

        setLocalKeys({
            apiKey: '',
            secretKey: '',
            geminiKey: ''
        });
    };

    return {
        apiKey: localKeys.apiKey,
        secretKey: localKeys.secretKey,
        geminiKey: localKeys.geminiKey,
        hasKeys: !!(localKeys.apiKey && localKeys.secretKey),
        isReady: cloudSettings.isLoaded,
        isSyncing: cloudSettings.isSyncing,
        saveKeys,
        clearKeys
    };
};
