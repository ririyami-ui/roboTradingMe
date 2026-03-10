// src/hooks/usePortfolio.js
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function usePortfolio(user) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user) return;

    const fetchPortfolio = async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('uid', user.id);

      if (data) setItems(data);
      if (error) console.error("Error fetching portfolio:", error);
    };

    fetchPortfolio();

    // Optional: Realtime subscription
    const subscription = supabase
      .channel('portfolios_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'portfolios', filter: `uid=eq.${user.id}` },
        () => fetchPortfolio()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user?.id]);

  return { items };
}
