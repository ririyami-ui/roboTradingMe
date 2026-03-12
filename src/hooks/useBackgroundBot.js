import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { messaging } from '../firebase';
import { getToken } from 'firebase/messaging';

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
            .select('is_background_bot_enabled, last_coin_id, last_bot_mode, last_is_simulation, fcm_token')
            .eq('id', user.id)
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

        // 2. Get active trades for the monitor (signals live here)
        const { data: botConfigs } = await supabase
            .from('active_trades')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_simulation', currentIsSim); // Filter by current mode

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
    }, [user?.id]);

    const [hasFcmToken, setHasFcmToken] = useState(false);
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

            // Realtime configs listener (Monitor reading from active_trades)
            const configsChannel = supabase
                .channel('active_trades_bg_realtime')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'active_trades', filter: `user_id=eq.${user.id}` },
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
    }, [user?.id, fetchStatus]);

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
        if (!('Notification' in window)) {
            alert("Browser ini tidak mendukung notifikasi.");
            return 'denied';
        }

        const initialPermission = Notification.permission;
        console.log(`SaktiBot: Initial permission state: ${initialPermission}`);

        if (initialPermission === 'denied') {
            alert("Izin Notifikasi DIBLOKIR 🚫\n\nCara aktifkan:\n1. Klik ikon lonceng/gembok di sebelah alamat web.\n2. Pilih 'Setelan Situs' atau 'Izin'.\n3. Ubah Notifikasi menjadi 'Izinkan/Allow'.\n4. Refresh halaman.");
            return 'denied';
        }

        try {
            console.log('SaktiBot: Requesting notification permission...');
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            
            if (permission === 'denied') {
                alert("Izin ditolak. Silakan aktifkan manual melaui Setelan Situs (klik ikon gembok/lonceng di bar alamat browser).");
                return 'denied';
            }

            if (permission === 'granted' && messaging && user) {
                console.log('SaktiBot: Permission granted, fetching FCM token...');
                try {
                    const registration = await navigator.serviceWorker.ready;
                    const currentToken = await getToken(messaging, {
                        vapidKey: 'BEoJxyMCupwnzMhsmiTIX5jowY3fjzIooJbcyTkoPDHMrp8cgxuxmoxAu5w6uxs03aQztghrCozFtDbmy4gn1gw',
                        serviceWorkerRegistration: registration
                    });
                    
                    if (currentToken) {
                        console.log('FCM Token retrieved, saving to Supabase...');
                        const { error: upsertError } = await supabase
                            .from('profiles')
                            .upsert({
                                id: user.id,
                                fcm_token: currentToken,
                                updated_at: new Date().toISOString()
                            });
                        
                        if (upsertError) throw upsertError;

                        setHasFcmToken(true);
                        alert("Berhasil! 🚀 Perangkat Anda sudah terdaftar untuk notifikasi cloud.");
                    } else {
                        alert("Gagal mendapatkan token FCM. Browser mungkin membatasi push notification.");
                    }
                } catch (tokenErr) {
                    console.error("FCM Token Error:", tokenErr);
                    alert("Error Register Cloud: " + (tokenErr.message || "Unknown Error"));
                }
            }
            return permission;
        } catch (error) {
            console.error('An error occurred while requesting permission. ', error);
            alert("Gagal meminta izin: " + error.message);
            return 'denied';
        }
    };

    const testNotification = async () => {
        if (!user) return;
        
        console.log('SaktiBot: Sending test notification signal...');
        
        // 1. Foreground test (via Supabase Realtime)
        await supabase.from('bot_logs').insert({
            user_id: user.id,
            message: '🔔 TEST (Foreground): Aplikasi sedang terbuka.',
            type: 'buy'
        });

        // 2. Background test (via Edge Function -> FCM)
        // Refresh token status first
        let currentToken = null;
        const { data: profile } = await supabase
            .from('profiles')
            .select('fcm_token')
            .eq('id', user.id)
            .single();
        
        currentToken = profile?.fcm_token;

        // If missing, try to register now
        if (!currentToken && notificationPermission === 'granted') {
            console.log('SaktiBot: Token missing but permission granted. Attempting auto-registration...');
            const result = await requestNotificationPermission();
            if (result === 'granted') {
                // Fetch again after registration
                const { data: reProfile } = await supabase.from('profiles').select('fcm_token').eq('id', user.id).single();
                currentToken = reProfile?.fcm_token;
            }
        }

        if (currentToken) {
            console.log('SaktiBot: Triggering Background Push via Edge Function...');
            try {
                const { data, error } = await supabase.functions.invoke('background-trader', {
                    body: { 
                        test_push: true, 
                        fcm_token: currentToken 
                    }
                });
                
                if (error) throw error;
                
                if (data?.success) {
                    alert("Sinyal TEST dikirim! Tutup aplikasi sekarang untuk mencoba notifikasi background (FCM).");
                } else {
                    alert("Server gagal mengirim push: " + (data?.error || "Unknown Error"));
                }
            } catch (e) {
                console.error("FCM Test Trigger Fail:", e);
                alert("Gagal memicu Push Background: " + e.message);
            }
        } else {
            alert("Token FCM belum terdaftar. Silakan klik ikon 'Notif' atau lonceng kuning kembali untuk mendaftarkan perangkat ini.");
        }
    };

    const resetServiceWorker = async () => {
        if (!('serviceWorker' in navigator)) return;
        
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let registration of regs) {
                await registration.unregister();
            }
            
            // Clear caches
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let key of keys) {
                    await caches.delete(key);
                }
            }
            
            alert("Sistem berhasil direset! 🧹\n\nHalaman akan direfresh otomatis. Setelah itu, silakan klik tombol 'Notif/Daftar' lagi.");
            window.location.reload(true);
        } catch (e) {
            alert("Gagal mereset: " + e.message);
        }
    };

    return React.useMemo(() => ({
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
    }), [isEnabled, toggleBackgroundBot, configs, updateCoinConfig, updateMultipleConfigs, removeCoinConfig, logs, loading, notificationPermission, requestNotificationPermission, testNotification, hasFcmToken, fetchStatus, userPrefs, updateUserSettings]);
};
