const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Fetching one row from profiles to check columns...");
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    if (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
    if (data && data.length > 0) {
        console.log("Columns found in profiles:");
        console.log(JSON.stringify(Object.keys(data[0]), null, 2));
    } else {
        console.log("No data in profiles table.");
        // Try to insert a dummy row or just use an alternative method if possible
        // But for now, let's just see if we can get any info.
    }
    process.exit(0);
}
check();
