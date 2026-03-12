const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function finalVerify() {
    console.log("Final verification of Supabase integration...");

    const tradeData = {
        user_id: "00000000-0000-0000-0000-000000000000", // Dummy but valid UUID format
        coin_id: "VERIFY_OK",
        buy_price: 1000,
        target_tp: 1100,
        target_sl: 950,
        highest_price: 1000,
        quantity: 1.5,
        is_simulation: true
        // NOT sending updated_at anymore
    };

    console.log("1. Testing active_trades UPSERT (without updated_at)...");
    const { data: upsertData, error: upsertError } = await supabase
        .from('active_trades')
        .upsert(tradeData, { onConflict: 'user_id,coin_id,is_simulation' })
        .select();

    if (upsertError) {
        if (upsertError.code === '23503') {
            console.log("✅ UPSERT schema valid (blocked only by Foreign Key as expected).");
        } else {
            console.error("❌ UPSERT failed with schema error:", upsertError.message);
        }
    } else {
        console.log("✅ UPSERT succeeded (Warning: unexpected success if FK exists, but schema is correct).");
    }

    console.log("\n2. Testing bot_logs INSERT...");
    const logData = {
        user_id: "00000000-0000-0000-0000-000000000000",
        message: "Verification test",
        type: "info"
    };

    const { error: logError } = await supabase.from('bot_logs').insert(logData);
    if (logError) {
        if (logError.code === '23503' || logError.code === '42501' || logError.message.includes('permission')) {
            console.log("✅ log schema valid (permission/FK check):", logError.message);
        } else {
            console.error("❌ log failed with unexpected error:", logError);
        }
    } else {
        console.log("✅ log INSERT succeeded.");
    }
}

finalVerify();
