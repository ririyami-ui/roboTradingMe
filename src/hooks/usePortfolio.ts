import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { AuthUser } from "./useAuth";

export interface PortfolioItem {
    id: string;
    uid: string;
    coin_id: string;
    amount: number;
    avg_buy_price: number;
    created_at: string;
    updated_at: string;
}

export default function usePortfolio(user: AuthUser | null) {
  const [items, setItems] = useState<PortfolioItem[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchPortfolio = async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('uid', user.uid);

      if (data) setItems(data as PortfolioItem[]);
      if (error) console.error("Error fetching portfolio:", error);
    };

    fetchPortfolio();

    // Optional: Realtime subscription
    const subscription = supabase
      .channel('portfolios_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'portfolios', filter: `uid=eq.${user.uid}` },
        () => fetchPortfolio()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user?.uid]);

  return { items };
}
