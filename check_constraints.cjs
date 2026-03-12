const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
    console.log("Checking active_trades constraints...");

    // We can't query information_schema directly with anon key usually,
    // but we can try to trigger the error to see the message more clearly in Node
    const { data, error } = await supabase
        .from('active_trades')
        .upsert({
            user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
            coin_id: 'test_coin',
            buy_price: 100,
            quantity: 1
        }, { onConflict: 'user_id,coin_id' });

    if (error) {
        console.log("Error Status:", error.code);
        console.log("Error Message:", error.message);
        console.log("Error Details:", error.details);
        console.log("Error Hint:", error.hint);
    } else {
        console.log("Upsert succeeded (dummy data)!");
    }
}

checkConstraints();
