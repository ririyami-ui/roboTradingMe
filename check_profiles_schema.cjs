const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking profiles table schema...");
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    if (error) {
        console.error("Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("Columns found:", Object.keys(data[0]));
        console.log("Sample Data:", data[0]);
    } else {
        console.log("Profiles table is empty. Trying to list columns via common fields check...");
        const fields = ['api_key', 'secret_key', 'gemini_key', 'trade_amount', 'is_simulation', 'id', 'last_is_simulation'];
        for (const field of fields) {
            const { error: fieldError } = await supabase.from('profiles').select(field).limit(1);
            if (fieldError) {
                console.log(`Column [${field}] Does NOT exist.`);
            } else {
                console.log(`Column [${field}] EXISTS.`);
            }
        }
    }
    process.exit(0);
}
check();
