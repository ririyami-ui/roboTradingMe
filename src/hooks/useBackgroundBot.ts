import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { messaging } from '../firebase';
import { getToken } from 'firebase/messaging';
import { AuthUser } from './useAuth';

export interface BotConfig {
    id: string;
    user_id: string;
    coin_id: string;
    trade_amount: number;
    updated_at: string;
    is_simulation?: boolean;
}

export interface BotLog {
    id: string;
    user_id: string;
    message: string;
    type: string;
    created_at: string;
}

export interface UserPrefs {
    coinId: string | null;
    botMode: string | null;
    isSimulation: boolean;
}

export const useBackgroundBot = (user: AuthUser | null) => {
    const [isEnabled, setIsEnabled] = useState(false);
    const [configs, setConfigs] = useState<BotConfig[]>([]);
    const [logs, setLogs] = useState<BotLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasFcmToken, setHasFcmToken] = useState(false);
    const [userPrefs, setUserPrefs] = useState<UserPrefs>({ coinId: null, botMode: null, isSimulation: true });
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'default');

    const fetchStatus = useCallback(async () => {
        if (!user) return;

        // 1. Get global bot status & preferences
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_background_bot_enabled, last_coin_id, last_bot_mode, last_is_simulation, fcm_token')
            .eq('id', user.uid)
            .maybeSingle();

        let currentIsSim = true;
        if (profile) {
            setIsEnabled(profile.is_background_bot_enabled);
            setHasFcmToken(!!profile.fcm_token);
            currentIsSim = profile.last_is_simulation ?? true;
            setUserPrefs({
                coinId: profile.last_coin_id,
                botMode: profile.last_bot_mode,
                isSimulation: currentIsSim
            });
        }

        // 2. Get active trades for the monitor
        const { data: botConfigs } = await supabase
            .from('active_trades')
            .select('*')
            .eq('user_id', user.uid)
            .eq('is_simulation', currentIsSim);

        if (botConfigs) setConfigs(botConfigs as BotConfig[]);

        // 3. Get logs
        const { data: botLogs } = await supabase
            .from('bot_logs')
            .select('*')
            .eq('user_id', user.uid)
            .order('created_at', { ascending: false })
            .limit(20);

        if (botLogs) setLogs(botLogs as BotLog[]);

        setLoading(false);
    }, [user?.uid]);

    const updateUserSettings = async (prefs: Partial<UserPrefs>) => {
        if (!user) return;
        const mappedPrefs = {
            last_coin_id: prefs.coinId,
            last_bot_mode: prefs.botMode,
            last_is_simulation: prefs.isSimulation
        };
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: user.uid,
                ...mappedPrefs,
                updated_at: new Date().toISOString()
            });

        if (!error) {
            setUserPrefs(prev => ({ ...prev, ...prefs }));
        }
    };

    useEffect(() => {
        if (user) {
            fetchStatus();

            const logsChannel = supabase
                .channel('bot_logs_realtime')
                .on('postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'bot_logs', filter: `user_id=eq.${user.uid}` },
                    (payload) => {
                        const newLog = payload.new as BotLog;
                        setLogs(prev => [newLog, ...prev].slice(0, 20));

                        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && ['buy', 'sell', 'profit', 'loss'].includes(newLog.type.toLowerCase())) {
                            new Notification('🚀 Crypto Oracle Signal', {
                                body: newLog.message,
                                icon: '/pwa-192x192.png'
                            });
                        }
                    }
                )
                .subscribe();

            const profileChannel = supabase
                .channel('profile_realtime')
                .on('postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.uid}` },
                    (payload) => {
                        const p = payload.new as any;
                        setIsEnabled(p.is_background_bot_enabled);
                        setUserPrefs({
                            coinId: p.last_coin_id,
                            botMode: p.last_bot_mode,
                            isSimulation: p.last_is_simulation ?? true
                        });
                    }
                )
                .subscribe();

            const configsChannel = supabase
                .channel('active_trades_bg_realtime')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'active_trades', filter: `user_id=eq.${user.uid}` },
                    () => {
                        fetchStatus();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(logsChannel);
                supabase.removeChannel(profileChannel);
                supabase.removeChannel(configsChannel);
            };
        }
    }, [user?.uid, fetchStatus]);

    const toggleBackgroundBot = async (val: boolean) => {
        if (!user) return;
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: user.uid,
                is_background_bot_enabled: val,
                updated_at: new Date().toISOString()
            });

        if (!error) setIsEnabled(val);
    };

    const updateCoinConfig = async (coinId: string, tradeAmount: number) => {
        if (!user) return;
        const { error } = await supabase
            .from('bot_configs')
            .upsert({
                user_id: user.uid,
                coin_id: coinId,
                trade_amount: tradeAmount,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,coin_id' });

        if (!error) fetchStatus();
    };

    const updateMultipleConfigs = async (coinIds: string[], tradeAmount: number) => {
        if (!user || !coinIds.length) return;

        const updates = coinIds.map(coinId => ({
            user_id: user.uid,
            coin_id: coinId,
            trade_amount: tradeAmount,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('bot_configs')
            .upsert(updates, { onConflict: 'user_id,coin_id' });

        if (!error) fetchStatus();
    };

    const removeCoinConfig = async (configId: string) => {
        const { error } = await supabase
            .from('bot_configs')
            .delete()
            .eq('id', configId);

        if (!error) fetchStatus();
    };

    const requestNotificationPermission = async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            alert("Browser ini tidak mendukung notifikasi.");
            return 'denied';
        }

        const initialPermission = Notification.permission;
        if (initialPermission === 'denied') {
            alert("Izin Notifikasi DIBLOKIR 🚫\n\nCara aktifkan manual di setelan browser.");
            return 'denied';
        }

        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            
            if (permission === 'granted' && messaging && user) {
                try {
                    const registration = await navigator.serviceWorker.ready;
                    const currentToken = await getToken(messaging, {
                        vapidKey: 'BEoJxyMCupwnzMhsmiTIX5jowY3fjzIooJbcyTkoPDHMrp8cgxuxmoxAu5w6uxs03aQztghrCozFtDbmy4gn1gw',
                        serviceWorkerRegistration: registration
                    });
                    
                    if (currentToken) {
                        await supabase
                            .from('profiles')
                            .upsert({
                                id: user.uid,
                                fcm_token: currentToken,
                                updated_at: new Date().toISOString()
                            });
                        setHasFcmToken(true);
                        alert("Berhasil! Perangkat terdaftar.");
                    }
                } catch (tokenErr: any) {
                    console.error("FCM Token Error:", tokenErr);
                }
            }
            return permission;
        } catch (error: any) {
            console.error('Permission error', error);
            return 'denied';
        }
    };

    const testNotification = async () => {
        if (!user) return;
        await supabase.from('bot_logs').insert({
            user_id: user.uid,
            message: '🔔 TEST (Foreground): Aplikasi sedang terbuka.',
            type: 'buy'
        });

        const { data: profile } = await supabase
            .from('profiles')
            .select('fcm_token')
            .eq('id', user.uid)
            .maybeSingle();
        
        const currentToken = profile?.fcm_token;
        if (currentToken) {
            try {
                const { error } = await supabase.functions.invoke('background-trader', {
                    body: { test_push: true, fcm_token: currentToken }
                });
                if (!error) alert("Sinyal TEST dikirim!");
            } catch (e: any) { alert("Error: " + e.message); }
        } else {
            alert("Token FCM belum terdaftar.");
        }
    };

    const resetServiceWorker = async () => {
        if (!('serviceWorker' in navigator)) return;
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let registration of regs) {
                await registration.unregister();
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let key of keys) {
                    await caches.delete(key);
                }
            }
            alert("Sistem direset! Refresh halaman.");
            window.location.reload();
        } catch (e: any) { alert("Error: " + e.message); }
    };

    const result = useMemo(() => ({
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
        testNotification,
        resetServiceWorker,
        hasFcmToken,
        refresh: fetchStatus,
        userPrefs,
        updateUserSettings
    }), [isEnabled, configs, logs, loading, notificationPermission, hasFcmToken, userPrefs, fetchStatus]);

    return result;
};
