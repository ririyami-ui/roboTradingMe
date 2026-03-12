const { createClient } = require('@supabase/supabase-js');

// Use hardcoded values from .env for the script to avoid dotenv issues
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s"; // Anon Key
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInsertError() {
    console.log("Simulating an insert to bot_configs to check for RLS errors...");
    const { data, error } = await supabase
        .from('bot_configs')
        .insert([{ user_id: 'a9deea76-47b2-4d23-bd73-3067dbf5dbe8', coin_id: 'btc-idr', trade_amount: 100000 }]);

    if (error) {
        console.error("Insert failed:", error.message);
    } else {
        console.log("Insert succeeded!");
    }
}

checkInsertError();
