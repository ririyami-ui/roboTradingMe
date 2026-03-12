const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseAnonKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTrades() {
    console.log("Checking active_trades table...");
    const { data, error } = await supabase
        .from('active_trades')
        .select('*');

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("No active trades found in the database.");
    } else {
        console.log(`Found ${data.length} active trades:`);
        data.forEach(t => {
            console.log(`- Coin: ${t.coin_id}, User: ${t.user_id}, Sim: ${t.is_simulation}, Created: ${t.created_at}`);
        });
    }
}

checkTrades();
