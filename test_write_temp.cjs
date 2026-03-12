const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWrite() {
    console.log("Testing write to active_trades...");

    // Attempt to insert a dummy row (will likely fail if RLS is on or user_id is wrong, 
    // but at least we see the error type)
    const { data, error } = await supabase
        .from('active_trades')
        .insert([
            {
                user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
                coin_id: 'test',
                buy_price: 100,
                quantity: 1,
                is_simulation: true
            }
        ]);

    if (error) {
        console.log("Write Error Details:");
        console.log("Code:", error.code);
        console.log("Message:", error.message);
        console.log("Hint:", error.hint);
        console.log("Details:", error.details);
    } else {
        console.log("Write Succeeded! (Wait, how? RLS should block dummy ID)");
    }
}

testWrite();
