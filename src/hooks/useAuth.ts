import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';

export interface AuthUser extends Partial<SupabaseUser> {
    displayName?: string;
    photoURL?: string;
    uid: string;
}

export const useAuth = () => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const mapUser = (supabaseUser: SupabaseUser | null): AuthUser | null => {
            if (!supabaseUser) return null;
            return {
                ...supabaseUser,
                displayName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0],
                photoURL: supabaseUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${supabaseUser.email}`,
                uid: supabaseUser.id
            };
        };

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(mapUser(session?.user ?? null));
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(mapUser(session?.user ?? null));
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
