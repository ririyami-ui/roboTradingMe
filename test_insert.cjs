const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    console.log("Testing full insert into active_trades...");

    const testData = {
        user_id: "00000000-0000-0000-0000-000000000000",
        coin_id: "TEST_RETRY",
        buy_price: 1000,
        target_tp: 1100,
        target_sl: 900,
        highest_price: 1000,
        quantity: 0.1,
        is_simulation: true
    };

    const { data, error } = await supabase
        .from('active_trades')
        .insert([testData])
        .select();

    if (error) {
        console.error("❌ Insert failed:", error.message);
        console.log("Error details:", error);
    } else {
        console.log("✅ Insert succeeded:", data);
        // Cleanup
        await supabase.from('active_trades').delete().eq('coin_id', 'TEST_RETRY');
    }
}

testInsert();
