const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log("Inspecting columns of active_trades...");

    // Attempting to get some data to see the structure, 
    // or just using an rpc if available, but usually we can't do that with anon key.
    // Instead, I'll try to find a valid insert by trial and error or looking at error messages.

    const { data, error } = await supabase
        .from('active_trades')
        .insert([{}]); // This will definitely fail and tell us which column is missing first.

    if (error) {
        console.log("Error during empty insert:", error.message);
    }

    // Let's try to query one existing row to see the keys
    const { data: rows } = await supabase.from('active_trades').select('*').limit(1);
    if (rows && rows.length > 0) {
        console.log("Sample Row Columns:", Object.keys(rows[0]));
    } else {
        console.log("No rows found to sample.");
    }
}

inspectSchema();
