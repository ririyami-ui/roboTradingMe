const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseAnonKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
    console.log("Checking first row of active_trades to see column names...");
    // We try to get one row regardless of user_id to see the schema
    const { data, error } = await supabase
        .from('active_trades')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching schema:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("No rows found in active_trades. Checking trade_history instead...");
        const { data: hData, error: hError } = await supabase
            .from('trade_history')
            .select('*')
            .limit(1);

        if (hData && hData.length > 0) {
            console.log("Found history row structure:", Object.keys(hData[0]));
        } else {
            console.log("Both tables are empty or inaccessible.");
        }
    } else {
        console.log("Found trade row structure:", Object.keys(data[0]));
        console.log("Example row:", data[0]);
    }
}

checkSchema();
