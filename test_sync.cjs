const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s"; // Anon key usually has enough perms if RLS is off or permissive
const supabase = createClient(supabaseUrl, supabaseKey);

// Use the user ID found earlier
const TEST_USER_ID = '703d52a1-1798-4f80-8b4f-a0fbae72b2f0';

async function testSync() {
    console.log("Starting Sync Test...");

    const testPayload = {
        id: TEST_USER_ID,
        trade_amount: 15000,
        take_profit: 3.5,
        stop_loss: 5.5,
        updated_at: new Date().toISOString()
    };

    console.log("Attempting to upsert test data...");
    const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(testPayload);

    if (upsertError) {
        console.error("Upsert Failed:", upsertError.message);
        if (upsertError.message.includes("column \"take_profit\" does not exist")) {
            console.log("NOTE: Columns take_profit/stop_loss might be missing from schema.");
        }
    } else {
        console.log("Upsert Succeeded!");
    }

    console.log("Retrieving data to verify...");
    const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', TEST_USER_ID)
        .single();

    if (fetchError) {
        console.error("Fetch Failed:", fetchError.message);
    } else {
        console.log("Retrieved Data:", {
            id: data.id,
            trade_amount: data.trade_amount,
            take_profit: data.take_profit,
            stop_loss: data.stop_loss,
            updated_at: data.updated_at
        });
        
        if (data.trade_amount === 15000) {
            console.log("SUCCESS: trade_amount synced correctly!");
        }
    }

    process.exit(0);
}

testSync();
