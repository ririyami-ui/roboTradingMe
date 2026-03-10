import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export const useBackgroundBot = (user) => {
    const [isEnabled, setIsEnabled] = useState(false);
    const [configs, setConfigs] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchStatus = useCallback(async () => {
        if (!user) return;

        // 1. Get global bot status & preferences
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_background_bot_enabled, last_coin_id, last_bot_mode, last_is_simulation')
            .eq('id', user.id)
            .maybeSingle();

        if (profile) {
            setIsEnabled(profile.is_background_bot_enabled);
            setUserPrefs({
                coinId: profile.last_coin_id,
                botMode: profile.last_bot_mode,
                isSimulation: profile.last_is_simulation ?? true
            });
        }

        // 2. Get coin configs
        const { data: botConfigs } = await supabase
            .from('bot_configs')
            .select('*')
            .eq('user_id', user.id);

        if (botConfigs) setConfigs(botConfigs);

        // 3. Get logs
        const { data: botLogs } = await supabase
            .from('bot_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (botLogs) setLogs(botLogs);

        setLoading(false);
    }, [user]);

    const [userPrefs, setUserPrefs] = useState({ coinId: null, botMode: null, isSimulation: true });

    const updateUserSettings = async (prefs) => {
        if (!user) return;
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                ...prefs,
                updated_at: new Date().toISOString()
            });

        if (!error) {
            setUserPrefs(prev => ({ ...prev, ...prefs }));
        }
    };

    useEffect(() => {
        if (user) {
            fetchStatus();

            // Realtime logs listener
            const logsChannel = supabase
                .channel('bot_logs_realtime')
                .on('postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'bot_logs', filter: `user_id=eq.${user.id}` },
                    (payload) => {
                        const newLog = payload.new;
                        setLogs(prev => [newLog, ...prev].slice(0, 20));

                        // Trigger browser notification
                        if (Notification.permission === 'granted' && ['buy', 'sell', 'profit', 'loss'].includes(newLog.type.toLowerCase())) {
                            new Notification('🚀 Crypto Oracle Signal', {
                                body: newLog.message,
                                icon: '/pwa-192x192.png'
                            });
                        }
                    }
                )
                .subscribe();

            // Realtime profiles listener for cross-device sync
            const profileChannel = supabase
                .channel('profile_realtime')
                .on('postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
                    (payload) => {
                        const p = payload.new;
                        setIsEnabled(p.is_background_bot_enabled);
                        setUserPrefs({
                            coinId: p.last_coin_id,
                            botMode: p.last_bot_mode,
                            isSimulation: p.last_is_simulation ?? true
                        });
                    }
                )
                .subscribe();

            // Realtime configs listener (Monitor)
            const configsChannel = supabase
                .channel('bot_configs_realtime')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'bot_configs', filter: `user_id=eq.${user.id}` },
                    () => {
                        fetchStatus(); // Refresh all configs for the monitor
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(logsChannel);
                supabase.removeChannel(profileChannel);
                supabase.removeChannel(configsChannel);
            };
        }
    }, [user, fetchStatus]);

    const toggleBackgroundBot = async (val) => {
        if (!user) return;
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                is_background_bot_enabled: val,
                updated_at: new Date().toISOString()
            });

        if (!error) setIsEnabled(val);
    };

    const updateCoinConfig = async (coinId, tradeAmount) => {
        if (!user) return;
        const { error } = await supabase
            .from('bot_configs')
            .upsert({
                user_id: user.id,
                coin_id: coinId,
                trade_amount: tradeAmount,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,coin_id' }); // Note: unique index should exist on user_id, coin_id

        if (!error) fetchStatus();
    };

    const updateMultipleConfigs = async (coinIds, tradeAmount) => {
        if (!user || !coinIds.length) return;

        const updates = coinIds.map(coinId => ({
            user_id: user.id,
            coin_id: coinId,
            trade_amount: tradeAmount,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('bot_configs')
            .upsert(updates, { onConflict: 'user_id,coin_id' });

        if (!error) fetchStatus();
    };

    const removeCoinConfig = async (configId) => {
        const { error } = await supabase
            .from('bot_configs')
            .delete()
            .eq('id', configId);

        if (!error) fetchStatus();
    }

    const [notificationPermission, setNotificationPermission] = useState(Notification.permission);

    const requestNotificationPermission = async () => {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        return permission;
    };

    return {
        isEnabled,
        toggleBackgroundBot,
        configs,
        updateCoinConfig,
        updateMultipleConfigs,
        removeCoinConfig,
        logs,
        loading,
        notificationPermission,
        requestNotificationPermission,
        refresh: fetchStatus,
        userPrefs,
        updateUserSettings
    };
};
