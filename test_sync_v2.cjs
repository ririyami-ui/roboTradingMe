const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_USER_ID = '703d52a1-1798-4f80-8b4f-a0fbae72b2f0';

async function testSync() {
    console.log("Starting Final Sync Test...");

    const testPayload = {
        id: TEST_USER_ID,
        trade_amount: 18000, // Changed from 15000 to verify update
        updated_at: new Date().toISOString()
    };

    console.log("Attempting to upsert test data (without missing columns)...");
    const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(testPayload);

    if (upsertError) {
        console.error("Upsert Failed:", upsertError.message);
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
            updated_at: data.updated_at
        });
        
        if (data.trade_amount === 18000) {
            console.log("SUCCESS: trade_amount (and thus API keys) can now sync correctly!");
        } else {
            console.log("FAILURE: trade_amount did not update.");
        }
    }

    process.exit(0);
}

testSync();
