// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export const useAuth = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const mapUser = (supabaseUser) => {
            if (!supabaseUser) return null;
            return {
                ...supabaseUser,
                displayName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0],
                photoURL: supabaseUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${supabaseUser.email}`,
                uid: supabaseUser.id // Syncing uid property if any component uses it
            };
        };

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(mapUser(session?.user));
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(mapUser(session?.user));
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const loginWithGoogle = async () => {
        try {
            setLoading(true);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account',
                    },
                    redirectTo: `${window.location.origin}/`
                },
            });
            if (error) throw error;
        } catch (error) {
            console.error("Login Error:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    return {
        user,
        loading,
        loginWithGoogle,
        logout
    };
};
