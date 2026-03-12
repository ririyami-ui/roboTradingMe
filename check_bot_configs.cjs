const { createClient } = require('@supabase/supabase-js');

// Use hardcoded values from .env for the script to avoid dotenv issues
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfigs() {
    console.log("Checking bot_configs table...");
    const { data, error } = await supabase
        .from('bot_configs')
        .select('*')
        .limit(5);

    if (error) {
        console.error("Error fetching bot_configs:", error);
    } else {
        console.log("Data found:", data.length);
        if (data.length > 0) {
            console.log("Sample row:", data[0]);
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("Table is empty.");
        }
    }
}

checkConfigs();
