const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://tbshgmyibtunhwlygqgg.supabase.co";
const supabaseKey = "sb_publishable_9LvXlDwtYqNnZbzVbPJN8A_Y2KeX75s";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTotalCounts() {
    console.log("Checking total row counts...");

    const { count: activeCount, error: activeErr } = await supabase
        .from('active_trades')
        .select('*', { count: 'exact', head: true });

    const { count: historyCount, error: historyErr } = await supabase
        .from('trade_history')
        .select('*', { count: 'exact', head: true });

    const { count: logCount, error: logErr } = await supabase
        .from('bot_logs')
        .select('*', { count: 'exact', head: true });

    if (activeErr) console.error("Active Trades Error:", activeErr.message);
    else console.log("Total Active Trades in DB (all users):", activeCount);

    if (historyErr) console.error("History Error:", historyErr.message);
    else console.log("Total History Rows in DB (all users):", historyCount);

    if (logErr) console.error("Logs Error:", logErr.message);
    else console.log("Total Logs in DB (all users):", logCount);
}

checkTotalCounts();
