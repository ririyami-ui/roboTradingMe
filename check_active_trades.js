const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("Checking active_trades table...");
    const { data, error } = await supabase
        .from('active_trades')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching active_trades:", error);
    } else {
        console.log("Sample data / Columns:", data[0] ? Object.keys(data[0]) : "No data, but table exists.");

        // Also check if we can insert/upsert with is_simulation
        console.log("Attempting a dry-run select with is_simulation filter...");
        const { error: filterError } = await supabase
            .from('active_trades')
            .select('id')
            .eq('is_simulation', true)
            .limit(1);

        if (filterError) {
            console.error("Filter error (is_simulation likely missing):", filterError);
        } else {
            console.log("is_simulation column seems to exist.");
        }
    }
}

checkSchema();
