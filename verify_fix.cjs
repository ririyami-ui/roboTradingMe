const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s"; // Anon key
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyFix() {
    console.log("🚀 Verifying Supabase fix...");

    // 1. Try to insert a log (Testing 403 / RLS on bot_logs)
    const { error: logErr } = await supabase.from('bot_logs').insert({
        message: "SaktiBot: Verification test after SQL fix",
        type: 'info'
    });

    if (logErr) {
        console.error("❌ Bot Logs still failing:", logErr.message);
    } else {
        console.log("✅ Bot Logs working!");
    }

    // 2. Try an upsert on active_trades (Testing 400 / Constraints & RLS)
    const { error: tradeErr } = await supabase.from('active_trades').upsert({
        user_id: '00000000-0000-0000-0000-000000000000',
        coin_id: 'VERIFY_TEST',
        buy_price: 1234,
        quantity: 1,
        is_simulation: true
    }, { onConflict: 'user_id,coin_id,is_simulation' });

    if (tradeErr) {
        console.error("❌ Active Trades still failing:", tradeErr.message);
    } else {
        console.log("✅ Active Trades working!");

        // Cleanup test data
        await supabase.from('active_trades').delete().eq('coin_id', 'VERIFY_TEST');
    }
}

verifyFix();
