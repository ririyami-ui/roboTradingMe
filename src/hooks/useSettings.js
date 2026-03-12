// src/hooks/useSettings.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { encryptData, decryptData } from '../utils/encryption';

/**
 * Hook to manage user settings synced with Supabase PostgreSQL.
 * Handles encryption of sensitive API keys.
 */
export const useSettings = (user) => {
    const [settings, setSettings] = useState({
        apiKey: '',
        secretKey: '',
        geminiKey: '',
        tradeAmount: 50000,
        takeProfit: 2.5,
        stopLoss: 4.5,
        isSimulation: true,
        isLoaded: false,
        isSyncing: false
    });

    // 1. Initial Load and Subscription
    useEffect(() => {
        if (!user) return;

        setSettings(s => ({ ...s, isSyncing: true }));

        const fetchSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (data) {
                    // Decrypt sensitive keys
                    const decryptedApiKey = decryptData(data.api_key, user.id);
                    const decryptedSecretKey = decryptData(data.secret_key, user.id);
                    const decryptedGeminiKey = decryptData(data.gemini_key, user.id);

                    setSettings({
                        apiKey: decryptedApiKey || '',
                        secretKey: decryptedSecretKey || '',
                        geminiKey: decryptedGeminiKey || '',
                        tradeAmount: data.trade_amount || 50000,
                        takeProfit: data.take_profit || 2.5,
                        stopLoss: data.stop_loss || 4.5,
                        isSimulation: data.is_simulation !== undefined ? data.is_simulation : true,
                        isLoaded: true,
                        isSyncing: false
                    });
                } else {
                    setSettings(s => ({ ...s, isLoaded: true, isSyncing: false }));
                    if (error && error.code !== 'PGRST116') {
                        console.error("Error fetching settings:", error);
                    }
                }
            } catch (err) {
                console.error("Exception in fetchSettings:", err);
                setSettings(s => ({ ...s, isLoaded: true, isSyncing: false }));
            }
        };

        fetchSettings();

        // Optional: Realtime subscription
        const subscription = supabase
            .channel(`profile_${user.id}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
                (payload) => {
                    const data = payload.new;
                    const decryptedApiKey = decryptData(data.api_key, user.id);
                    const decryptedSecretKey = decryptData(data.secret_key, user.id);
                    const decryptedGeminiKey = decryptData(data.gemini_key, user.id);

                    setSettings(prev => ({
                        ...prev,
                        apiKey: decryptedApiKey || prev.apiKey,
                        secretKey: decryptedSecretKey || prev.secretKey,
                        geminiKey: decryptedGeminiKey || prev.geminiKey,
                        tradeAmount: data.trade_amount || prev.tradeAmount,
                        takeProfit: data.take_profit || prev.takeProfit,
                        stopLoss: data.stop_loss || prev.stopLoss,
                        isSimulation: data.is_simulation !== undefined ? data.is_simulation : prev.isSimulation,
                        isSyncing: false
                    }));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user?.id]);

    // 2. Save Settings to Supabase
    const saveSettings = useCallback(async (newSettings) => {
        if (!user) {
            // If not logged in, just update state locally
            setSettings(prev => ({ ...prev, ...newSettings }));
            return;
        }

        setSettings(s => ({ ...s, ...newSettings, isSyncing: true }));

        try {
            // Encrypt sensitive keys before saving
            const encryptedData = {
                id: user.id,
                api_key: encryptData(newSettings.apiKey, user.id),
                secret_key: encryptData(newSettings.secretKey, user.id),
                gemini_key: encryptData(newSettings.geminiKey, user.id),
                trade_amount: newSettings.tradeAmount,
                is_simulation: newSettings.isSimulation,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(encryptedData);

            if (error) throw error;

            // Also sync to localStorage for fallback
            localStorage.setItem('indodax_api_key', newSettings.apiKey || '');
            localStorage.setItem('indodax_secret_key', newSettings.secretKey || '');
            if (newSettings.geminiKey) {
                localStorage.setItem('gemini_api_key', newSettings.geminiKey);
            }

        } catch (error) {
            console.error("Failed to save settings to Supabase:", error);
            // Revert syncing state
        } finally {
            setSettings(s => ({ ...s, isSyncing: false }));
        }
    }, [user?.id]);

    return {
        ...settings,
        saveSettings
    };
};
