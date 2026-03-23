import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { encryptData, decryptData } from '../utils/encryption'; // Refresh
import { AuthUser } from './useAuth';

export interface Settings {
    apiKey: string;
    secretKey: string;
    geminiKey: string;
    tradeAmount: number;
    takeProfit: number;
    stopLoss: number;
    isSimulation: boolean;
    isBotActive: boolean;
    tradingStrategy: string;
    dailyLossLimit: number;
    lossCooldownAt: number;
    isScannerActive: boolean;
    isLoaded: boolean;
    isSyncing: boolean;
}

/**
 * Hook to manage user settings synced with Supabase PostgreSQL.
 * Handles encryption of sensitive API keys.
 */
export const useSettings = (user: AuthUser | null) => {
    const [settings, setSettings] = useState<Settings>({
        apiKey: '',
        secretKey: '',
        geminiKey: '',
        tradeAmount: 100000,
        takeProfit: 2.5,
        stopLoss: 1.5,
        isSimulation: true,
        isBotActive: true,
        tradingStrategy: 'SCALPING',
        dailyLossLimit: 3.0,
        lossCooldownAt: 0,
        isScannerActive: false,
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
                    .eq('id', user.uid)
                    .maybeSingle();

                if (data) {
                    // Decrypt sensitive keys
                    const decryptedApiKey = decryptData(data.api_key, user.uid);
                    const decryptedSecretKey = decryptData(data.secret_key, user.uid);
                    const decryptedGeminiKey = decryptData(data.gemini_key, user.uid);

                    const finalSettings = {
                        apiKey: decryptedApiKey || '',
                        secretKey: decryptedSecretKey || '',
                        geminiKey: decryptedGeminiKey || '',
                        tradeAmount: data.trade_amount || 50000,
                        takeProfit: data.take_profit || 1.5,
                        stopLoss: data.stop_loss || 1.0,
                        isSimulation: data.last_is_simulation !== undefined ? data.last_is_simulation : true,
                        isBotActive: data.is_background_bot_enabled !== undefined ? data.is_background_bot_enabled : true,
                        tradingStrategy: data.trading_strategy || 'SCALPING',
                        dailyLossLimit: data.daily_loss_limit || 5.0,
                        lossCooldownAt: data.loss_cooldown_at ? new Date(data.loss_cooldown_at).getTime() : 0,
                        isScannerActive: !!data.is_scanner_active,
                        isLoaded: true,
                        isSyncing: false
                    };
                    setSettings(finalSettings);
                    // Update Local Backup whenever we get fresh DB data
                    localStorage.setItem(`saktibot_settings_backup_${user.uid}`, JSON.stringify(finalSettings));
                } else {
                    // FALLBACK: Load from localStorage if DB is empty
                    const localBackup = localStorage.getItem(`saktibot_settings_backup_${user.uid}`);
                    if (localBackup) {
                        try {
                            const parsed = JSON.parse(localBackup);
                            setSettings({ ...parsed, isLoaded: true, isSyncing: false });
                            console.log("[SETTINGS] Loaded from LocalStorage fallback.");
                        } catch (e) {
                            setSettings(s => ({ ...s, isLoaded: true, isSyncing: false }));
                        }
                    } else {
                        setSettings(s => ({ ...s, isLoaded: true, isSyncing: false }));
                    }

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
            .channel(`profile_${user.uid}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.uid}` },
                (payload) => {
                    const data = payload.new as any;
                    const decryptedApiKey = decryptData(data.api_key, user.uid);
                    const decryptedSecretKey = decryptData(data.secret_key, user.uid);
                    const decryptedGeminiKey = decryptData(data.gemini_key, user.uid);

                    setSettings(prev => ({
                        ...prev,
                        apiKey: decryptedApiKey || prev.apiKey,
                        secretKey: decryptedSecretKey || prev.secretKey,
                        geminiKey: decryptedGeminiKey || prev.geminiKey,
                        tradeAmount: data.trade_amount || prev.tradeAmount,
                        takeProfit: data.take_profit || prev.takeProfit,
                        stopLoss: data.stop_loss || prev.stopLoss,
                        isSimulation: data.last_is_simulation !== undefined ? data.last_is_simulation : prev.isSimulation,
                        isBotActive: data.is_background_bot_enabled !== undefined ? data.is_background_bot_enabled : prev.isBotActive,
                        tradingStrategy: data.trading_strategy || prev.tradingStrategy,
                        dailyLossLimit: data.daily_loss_limit !== undefined ? data.daily_loss_limit : prev.dailyLossLimit,
                        lossCooldownAt: data.loss_cooldown_at ? new Date(data.loss_cooldown_at).getTime() : prev.lossCooldownAt,
                        isScannerActive: data.is_scanner_active !== undefined ? data.is_scanner_active : prev.isScannerActive,
                        isSyncing: false
                    }));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user?.uid]);

    // 2. Save Settings to Supabase
    const saveSettings = useCallback(async (newSettings: Partial<Settings>) => {
        if (!user) {
            // If not logged in, just update state locally
            setSettings(prev => ({ ...prev, ...newSettings }));
            return;
        }

        setSettings(s => ({ ...s, ...newSettings, isSyncing: true }));

        try {
            // Build the update payload dynamically to avoid overwriting with empty defaults
            const updateData: any = {
                id: user.uid,
                updated_at: new Date().toISOString()
            };

            // Only add fields that are explicitly changed or we are sure we want to persist
            if (newSettings.apiKey !== undefined) updateData.api_key = encryptData(newSettings.apiKey, user.uid);
            if (newSettings.secretKey !== undefined) updateData.secret_key = encryptData(newSettings.secretKey, user.uid);
            if (newSettings.geminiKey !== undefined) updateData.gemini_key = encryptData(newSettings.geminiKey, user.uid);
            
            if (newSettings.tradeAmount !== undefined) updateData.trade_amount = newSettings.tradeAmount;
            if (newSettings.takeProfit !== undefined) updateData.take_profit = newSettings.takeProfit;
            if (newSettings.stopLoss !== undefined) updateData.stop_loss = newSettings.stopLoss;
            if (newSettings.isSimulation !== undefined) updateData.last_is_simulation = newSettings.isSimulation;
            if (newSettings.isBotActive !== undefined) updateData.is_background_bot_enabled = newSettings.isBotActive;
            if (newSettings.tradingStrategy !== undefined) updateData.trading_strategy = newSettings.tradingStrategy;
            if (newSettings.dailyLossLimit !== undefined) updateData.daily_loss_limit = newSettings.dailyLossLimit;

            if (newSettings.lossCooldownAt !== undefined) {
                updateData.loss_cooldown_at = newSettings.lossCooldownAt === 0 ? null : new Date(newSettings.lossCooldownAt).toISOString();
            }

            if (newSettings.isScannerActive !== undefined) updateData.is_scanner_active = newSettings.isScannerActive;

            const { error } = await supabase
                .from('profiles')
                .upsert(updateData);

            if (error) throw error;

            // Also sync to localStorage for persistent fallback
            const localPayload = {
                ...settings,
                ...newSettings,
                isLoaded: true,
                isSyncing: false
            };
            localStorage.setItem(`saktibot_settings_backup_${user.uid}`, JSON.stringify(localPayload));

            // Keep individual keys for compatibility
            localStorage.setItem('indodax_api_key', newSettings.apiKey || settings.apiKey);
            localStorage.setItem('indodax_secret_key', newSettings.secretKey || settings.secretKey);
            if (newSettings.geminiKey || settings.geminiKey) {
                localStorage.setItem('gemini_api_key', newSettings.geminiKey || settings.geminiKey);
            }

        } catch (error: any) {
            console.error("Failed to save settings to Supabase:", error);
            if (error.code) {
                console.error(`Error Code: ${error.code}, Message: ${error.message}`);
            }
        } finally {
            setSettings(s => ({ ...s, isSyncing: false }));
        }
    }, [user?.uid, settings]);

    return {
        ...settings,
        saveSettings
    };
};
