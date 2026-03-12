const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
    console.log("Checking profiles table...");
    const { data, error } = await supabase
        .from('profiles')
        .select('*');

    if (error) {
        console.error("Profiles Error:", error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log("Profiles table is empty.");
    } else {
        console.log("Found profiles:", data.length);
        data.forEach(p => {
            console.log(`User: ${p.id}, BotEnabled: ${p.is_background_bot_enabled}, LastCoin: ${p.last_coin_id}, LastSim: ${p.last_is_simulation}`);
        });
    }
}

checkProfiles();
