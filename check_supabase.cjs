const { createClient } = require('@supabase/supabase-js');

// Use hardcoded values from .env for the script to avoid dotenv issues
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
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

        // Check for specific columns
        if (data[0]) {
            console.log("Columns found:", Object.keys(data[0]));
        } else {
            // Try to insert one and see what happens (dry-run style)
            console.log("Table is empty. Checking is_simulation existence...");
            const { error: filterError } = await supabase
                .from('active_trades')
                .select('id')
                .eq('is_simulation', true)
                .limit(1);

            if (filterError) {
                console.error("is_simulation check failed:", filterError.message);
            } else {
                console.log("is_simulation column exists.");
            }
        }
    }
}

checkSchema();
