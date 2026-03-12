const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseAnonKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkLogs() {
    console.log("Checking recent bot_logs...");
    const { data, error } = await supabase
        .from('bot_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching logs:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("No bot logs found.");
    } else {
        console.log(`Recent bot logs:`);
        data.forEach(l => {
            console.log(`[${l.created_at}] User: ${l.user_id}, Type: ${l.type}, Msg: ${l.message}`);
        });
    }
}

checkLogs();
