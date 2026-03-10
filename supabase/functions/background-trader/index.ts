// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
// @ts-ignore
import CryptoJS from "https://esm.sh/crypto-js@4.1.1"

const APP_SECRET = 'crypto-analyst-v1-secure-salt';

// --- UTILS ---
const decryptData = (ciphertext: string, userId: string) => {
    if (!ciphertext) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, `${APP_SECRET}-${userId}`);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        return '';
    }
};

// --- TECHNICAL INDICATORS ---
function calcEMA(values: number[], period: number): (number | null)[] {
    const k = 2 / (period + 1);
    const ema: (number | null)[] = [];
    let prev = values.slice(0, period).reduce((a: number, b: number) => a + b, 0) / period;
    for (let i = 0; i < period - 1; i++) ema.push(null);
    ema.push(prev);
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        ema.push(prev);
    }
    return ema;
}

function calcMACD(prices: number[]) {
    const ema12 = calcEMA(prices, 12);
    const ema26 = calcEMA(prices, 26);
    const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null ? v - ema26[i]! : null));
    const signalLine = calcEMA(macdLine.map(v => v === null ? 0 : v), 9).map((v, i) => macdLine[i] === null ? null : v);
    return { macdLine, signalLine };
}

function calcRSI(prices: number[], period = 14) {
    const rsi: (number | null)[] = new Array(prices.length).fill(null);
    if (prices.length <= period) return rsi;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change; else losses -= change;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
        rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    }
    return rsi;
}

// --- INDODAX API ---
const privateApiRequest = async (method: string, apiKey: string, secretKey: string, params = {}) => {
    const payload = {
        method,
        nonce: Date.now(),
        ...params,
    };

    const queryString = Object.keys(payload)
        .sort()
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent((payload as any)[key])}`)
        .join('&');

    const signature = CryptoJS.HmacSHA512(queryString, secretKey).toString();

    const response = await fetch('https://indodax.com/tapi', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Key': apiKey,
            'Sign': signature,
        },
        body: queryString,
    });

    const data = await response.json();
    if (data.success !== 1) throw new Error(data.error || 'Indodax TAPI Error');
    return data.return;
};

// --- MAIN HANDLER ---
// @ts-ignore
serve(async (req: Request) => {
    // @ts-ignore
    const supabase = createClient(
        // @ts-ignore
        Deno.env.get('SUPABASE_URL') ?? '',
        // @ts-ignore
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    try {
        // 1. Get all users who have background analysis enabled
        const { data: activeProfiles, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_background_bot_enabled', true);

        if (profileError) throw profileError;
        if (!activeProfiles || activeProfiles.length === 0) {
            return new Response(JSON.stringify({ success: true, message: 'No active analysis profiles' }), { headers: { "Content-Type": "application/json" } });
        }

        const results = [];

        for (const profile of activeProfiles) {
            const user_id = profile.id;
            const apiKey = decryptData(profile.api_key, user_id);
            const secretKey = decryptData(profile.secret_key, user_id);

            // 2. Fetch coins this user wants analyzed 24/7
            const [{ data: userConfigs }, { data: activeOpenPos }] = await Promise.all([
                supabase.from('bot_configs').select('*').eq('user_id', user_id),
                supabase.from('active_trades').select('*').eq('user_id', user_id)
            ]);

            if (!userConfigs || userConfigs.length === 0) continue;

            const configsToProcess = userConfigs;

            // 3. Process each config (Oracle Analysis + Safeguard Check)
            await Promise.all(configsToProcess.map(async (config: any) => {
                const coin_id = config.coin_id;
                try {
                    const [base, target] = coin_id.toUpperCase().split('-');
                    const symbol = target ? base + target : base + 'IDR';

                    // 4. Fetch price history (15m TF)
                    const to = Math.floor(Date.now() / 1000);
                    const from = to - (15 * 60 * 300); // 300 candles
                    const chartRes = await fetch(`https://indodax.com/tradingview/history_v2?symbol=${symbol}&tf=15&from=${from}&to=${to}`);
                    const chartDataArray = await chartRes.json();

                    if (!chartDataArray || !Array.isArray(chartDataArray) || chartDataArray.length < 50) return;

                    const prices: number[] = chartDataArray.map((d: any) => typeof d.Close === 'string' ? parseFloat(d.Close) : d.Close);
                    const latestPrice = prices[prices.length - 1];

                    // 5. Technical Analysis (MACD + RSI + Volatility)
                    const rsiArr = calcRSI(prices, 14);
                    const rsiVal = rsiArr[rsiArr.length - 1] || 50;

                    const { macdLine, signalLine } = calcMACD(prices);
                    const currentMacd = macdLine[macdLine.length - 1] || 0;
                    const currentMacdSignal = signalLine[signalLine.length - 1] || 0;
                    const prevMacd = macdLine[macdLine.length - 2] || 0;
                    const prevMacdSignal = signalLine[signalLine.length - 2] || 0;

                    const recentPrices = prices.slice(-10);
                    const volatilityPercent = ((Math.max(...recentPrices) - Math.min(...recentPrices)) / Math.min(...recentPrices)) * 100;

                    // 6. Market Sentiment & Oracle Advice Logic
                    let sentiment = 'Active';
                    let advice = 'Hold';
                    let signal = 'HOLD';

                    // Detect Sentiment
                    if (rsiVal > 70) {
                        sentiment = 'Saturated (OB)';
                        advice = 'Rest (Overbought)';
                    } else if (rsiVal < 30) {
                        sentiment = 'Saturated (OS)';
                        advice = 'Watch (Oversold)';
                    } else if (volatilityPercent < 0.2) {
                        sentiment = 'Stagnant';
                        advice = 'Rest (Low Vol)';
                    } else {
                        sentiment = 'Active';
                        advice = 'Trade';
                    }

                    // Signal Logic (Oracle suggestion)
                    const isMacdBullish = prevMacd <= prevMacdSignal && currentMacd > currentMacdSignal;
                    const isMacdBearish = prevMacd >= prevMacdSignal && currentMacd < currentMacdSignal;

                    if (isMacdBullish && rsiVal < 65) signal = 'BUY';
                    else if (isMacdBearish || rsiVal > 75) signal = 'SELL';

                    // 7. POSITION SAFEGUARD CHECK (Offline SL/TP)
                    const activePos = activeOpenPos?.find((p: any) => p.coin_id === coin_id);
                    if (activePos) {
                        let hitReason = '';
                        if (latestPrice >= activePos.target_tp) hitReason = 'profit';
                        if (latestPrice <= activePos.target_sl) hitReason = 'loss';

                        if (hitReason) {
                            try {
                                const isSim = activePos.is_simulation === true;
                                const pnl = (((latestPrice - activePos.buy_price) / activePos.buy_price) * 100).toFixed(2);

                                if (!isSim && apiKey && secretKey) {
                                    const pair = coin_id.toLowerCase().replace('-', '_');
                                    // Exec REAL SELL
                                    await privateApiRequest('trade', apiKey, secretKey, {
                                        pair,
                                        type: 'sell',
                                        price: latestPrice,
                                        [base.toLowerCase()]: activePos.quantity
                                    });
                                }

                                // Log exit (mark as Virtual if simulation)
                                await supabase.from('bot_logs').insert({
                                    user_id,
                                    message: `[SAFEGUARD] ${isSim ? 'VIRTUAL ' : ''}${hitReason.toUpperCase()} hit! ${isSim ? 'Closed' : 'Sold'} ${base}/${target} @ Rp ${latestPrice.toLocaleString()}. Benefit: ${pnl}%`,
                                    type: hitReason
                                });

                                // Cleanup
                                await supabase.from('active_trades').delete().eq('id', activePos.id);
                            } catch (sellErr: any) {
                                console.error(`Safeguard SELL/Exit fail for ${coin_id}:`, sellErr.message);
                            }
                        }
                    }

                    // 8. Log Oracle signals
                    if (signal !== 'HOLD' && signal !== config.last_signal) {
                        await supabase.from('bot_logs').insert({
                            user_id,
                            message: `[ORACLE] ${signal} hint on ${base}/${target}. Market is ${sentiment}. Recommendation: ${advice}`,
                            type: signal.toLowerCase()
                        });
                    }

                    // 9. Update database with fresh Oracle insights
                    await supabase
                        .from('bot_configs')
                        .update({
                            last_signal: signal,
                            market_sentiment: sentiment,
                            advice: advice,
                            updated_at: new Date().toISOString()
                        })
                        .eq('user_id', user_id)
                        .eq('coin_id', coin_id);

                    results.push({ coin_id, signal, sentiment, advice });

                } catch (e: any) {
                    console.error(`Error analyzing ${coin_id}:`, e.message);
                }
            }));
        }

        return new Response(JSON.stringify({ success: true, processed: results.length }), { headers: { "Content-Type": "application/json" } })
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } })
    }
})
