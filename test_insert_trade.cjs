require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testInsert() {
    console.log("Mencoba login atau auth...");
    // Create a dummy user session or insert without it to check RLS (Row Level Security)
    // Actually, we don't have the user's password here. We can just run a server-side check using service_role key if available, but we only have anon_key.
    
    // Let's just check the RLS policies or try a generic insert
    const { data: dbTrade, error: upsertError } = await supabase
        .from('active_trades')
        .upsert({
            user_id: '11111111-1111-1111-1111-111111111111', // dummy uuid
            coin_id: 'test_idr',
            buy_price: 100,
            target_tp: 110,
            target_sl: 90,
            highest_price: 100,
            quantity: 1,
            is_simulation: true
        })
        .select()
        .maybeSingle();
        
    console.log("Insert result:", dbTrade);
    console.log("Insert error:", upsertError);
}

testInsert();
