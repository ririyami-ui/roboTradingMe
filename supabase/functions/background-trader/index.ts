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

// --- FCM NOTIFICATIONS (HTTP v1 without fat SDKs) ---
// Base64Url encoding helper
function base64url(source: Uint8Array | string): string {
    let encoded = typeof source === 'string' ? btoa(source) : btoa(String.fromCharCode.apply(null, Array.from(source)));
    return encoded.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Minimal JWT signer for Google OAuth2
async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
    const creds = JSON.parse(serviceAccountJson);
    
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedClaim = base64url(JSON.stringify(claim));
    const signatureInput = `${encodedHeader}.${encodedClaim}`;

    // Import the private key format PKCS8
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = creds.private_key.substring(pemHeader.length, creds.private_key.length - pemFooter.length).replace(/\n/g, "");
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const encoder = new TextEncoder();
    const signatureBytes = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        encoder.encode(signatureInput)
    );

    const jwt = `${signatureInput}.${base64url(new Uint8Array(signatureBytes))}`;

    // Exchange JWT for Access Token
    const authRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });

    const authData = await authRes.json();
    if (!authData.access_token) throw new Error("Failed to get FCM token: " + JSON.stringify(authData));
    return authData.access_token;
}

async function sendPushNotification(fcmToken: string, title: string, body: string, serviceAccountJson: string, projectId: string) {
    if (!fcmToken) return { success: false, error: "Missing FCM Token" };
    if (!serviceAccountJson) return { success: false, error: "Missing Firebase Service Account Secret (Check FIREBASE_EDGE or FIREBASE_SERVICE_ACCOUNT in Supabase)" };
    
    try {
        const accessToken = await getFcmAccessToken(serviceAccountJson);
        const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
        
        const res = await fetch(fcmUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                message: {
                    token: fcmToken,
                    notification: {
                        title: title,
                        body: body
                    },
                    data: {
                        title: title,
                        body: body,
                        url: 'https://cryptoanalyzer-2de3a.web.app/'
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            icon: 'pwa-192x192',
                            color: '#111827',
                            sound: 'default',
                            click_action: 'https://cryptoanalyzer-2de3a.web.app/'
                        }
                    },
                    webpush: {
                        headers: {
                            Urgency: 'high'
                        },
                        notification: {
                            icon: '/pwa-192x192.png',
                            badge: '/pwa-192x192.png',
                            vibrate: [200, 100, 200],
                            requireInteraction: true
                        },
                        fcm_options: {
                            link: 'https://cryptoanalyzer-2de3a.web.app/'
                        }
                    }
                }
            })
        });
        
        const result = await res.json();
        if (!res.ok) {
            console.error(`[FCM] Google API Error:`, result);
            return { success: false, error: result.error?.message || "Google API Error" };
        }

        console.log(`[FCM] Push sent to ${fcmToken.substring(0, 10)}...: ${title}`);
        return { success: true };
    } catch (e: any) {
        console.error(`[FCM] Internal Push failed:`, e.message);
        return { success: false, error: e.message };
    }
}

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

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- MAIN HANDLER ---
// @ts-ignore
serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // @ts-ignore
    const supabase = createClient(
        // @ts-ignore
        Deno.env.get('SUPABASE_URL') ?? '',
        // @ts-ignore
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Firebase Service Account configuration (Get this from Supabase Secrets later)
    // @ts-ignore
    const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? Deno.env.get('FIREBASE_EDGE') ?? '';
    // @ts-ignore
    const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'cryptoanalyzer-2de3a';

    // --- NEW: Test Push Endpoint Logic ---
    if (req.method === 'POST') {
        try {
            const body = await req.json();
            if (body.test_push && body.fcm_token) {
                console.log(`[TEST] Received request for test push to token: ${body.fcm_token.substring(0, 10)}...`);
                const pushRes = await sendPushNotification(
                    body.fcm_token, 
                    '🚀 SaktiBot: Test Notifikasi Background', 
                    'Ini adalah pesan tes. Jika Anda melihat ini, berarti notifikasi background PWA Anda sudah AKTIF!', 
                    FIREBASE_SERVICE_ACCOUNT, 
                    FIREBASE_PROJECT_ID
                );
                
                return new Response(JSON.stringify({ 
                    success: pushRes.success, 
                    message: pushRes.success ? 'Test push signal accepted' : 'Test push signal failed',
                    error: pushRes.error
                }), { 
                    headers: { ...corsHeaders, "Content-Type": "application/json" } 
                });
            }
        } catch (e: any) {
            console.error("Test Push Error:", e);
            return new Response(JSON.stringify({ success: false, error: e.message }), { 
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
    }

    try {
        // 1. Get all users who have background analysis enabled
        const { data: activeProfiles, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_background_bot_enabled', true);

        if (profileError) throw profileError;
        if (!activeProfiles || activeProfiles.length === 0) {
            return new Response(JSON.stringify({ success: true, message: 'No active analysis profiles' }), { 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }

        const results = [];

        for (const profile of activeProfiles) {
            const user_id = profile.id;
            const apiKey = decryptData(profile.api_key, user_id);
            const secretKey = decryptData(profile.secret_key, user_id);
            const fcmToken = profile.fcm_token; // The new push token

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

                    // 7. POSITION SAFEGUARD CHECK (Offline TP / Hard SL / Trailing SL)
                    const activePos = activeOpenPos?.find((p: any) => p.coin_id === coin_id);
                    if (activePos) {
                        let hitReason = '';
                        let shouldUpdateHighestPrice = false;
                        const currentHighest = activePos.highest_price || activePos.buy_price;

                        // a. Update Highest Price for Trailing SL
                        if (latestPrice > currentHighest) {
                            shouldUpdateHighestPrice = true;
                        }

                        // b. Trailing Stop Loss Logic (Default 3% drop from peak)
                        const trailingPercent = 3.0;
                        const dynamicSL = (shouldUpdateHighestPrice ? latestPrice : currentHighest) * (1 - (trailingPercent / 100));

                        // Trailing SL hits if price drops below dynamic SL AND we are in profit zone (at least 1% up)
                        const isTrailingHit = latestPrice <= dynamicSL && currentHighest > (activePos.buy_price * 1.01);

                        if (latestPrice >= activePos.target_tp) hitReason = 'profit';
                        else if (latestPrice <= activePos.target_sl) hitReason = 'loss';
                        else if (isTrailingHit) hitReason = 'trailing_sl';

                        if (hitReason) {
                            try {
                                const isSim = activePos.is_simulation === true;
                                const pnl = (((latestPrice - activePos.buy_price) / activePos.buy_price) * 100).toFixed(2);

                                if (!isSim && apiKey && secretKey) {
                                    const pair = coin_id.toLowerCase().replace('-', '_');

                                    // [FIX 1] Attempt to Cancel Any Existing Stop Loss Orders first to release frozen balance
                                    try {
                                        // To be perfectly safe, we ask Indodax for all open orders of this pair for this user
                                        const openOrdersRes = await privateApiRequest('openOrders', apiKey, secretKey, { pair });
                                        if (openOrdersRes && openOrdersRes.orders && openOrdersRes.orders.length > 0) {
                                            for (const order of openOrdersRes.orders) {
                                                if (order.type === 'sell') {
                                                     await privateApiRequest('cancelOrder', apiKey, secretKey, {
                                                         pair,
                                                         order_id: order.order_id,
                                                         type: 'sell'
                                                     });
                                                }
                                            }
                                        }
                                    } catch (cancelErr: any) {
                                        console.warn(`[Safeguard] Could not clear open orders for ${pair}: ${cancelErr.message}`);
                                    }

                                    // [FIX 2] Wait 1.5s for Indodax to refund the balance
                                    await new Promise(res => setTimeout(res, 1500));

                                    // [FIX 3] Exec REAL SELL with proper indodax parameter formatting
                                    const sellParams: any = {
                                        pair,
                                        type: 'sell',
                                        price: latestPrice,
                                    };
                                    sellParams[base.toLowerCase()] = activePos.quantity; // Indodax reqs 'btc', 'eth', etc as the amount key

                                    await privateApiRequest('trade', apiKey, secretKey, sellParams);
                                }

                                // Log exit
                                const logMsg = `[SAFEGUARD] ${isSim ? 'VIRTUAL ' : ''}${hitReason.toUpperCase()} hit! ${isSim ? 'Closed' : 'Sold'} ${base}/${target} @ Rp ${latestPrice.toLocaleString()}. Benefit: ${pnl}%`;
                                
                                await supabase.from('bot_logs').insert({
                                    user_id,
                                    message: logMsg,
                                    type: hitReason.includes('profit') || (parseFloat(pnl) > 0) ? 'profit' : 'loss'
                                });

                                // Dispatch FCM Push Warning for Safeguard triggers
                                if (fcmToken && FIREBASE_SERVICE_ACCOUNT) {
                                    const notifTitle = `Trade ${isSim ? 'Simulasi ' : ''}Ditutup! (${hitReason.toUpperCase()})`;
                                    await sendPushNotification(fcmToken, notifTitle, logMsg, FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID);
                                }

                                // Cleanup
                                await supabase.from('active_trades').delete().eq('id', activePos.id);
                            } catch (sellErr: any) {
                                console.error(`Safeguard SELL/Exit fail for ${coin_id}:`, sellErr.message);
                            }
                        } else if (shouldUpdateHighestPrice) {
                            // Just update the peak in database so Radar UX shows it
                            await supabase.from('active_trades')
                                .update({ highest_price: latestPrice, updated_at: new Date().toISOString() })
                                .eq('id', activePos.id);
                        }
                    }

                    // 8. Log Oracle signals
                    if (signal !== 'HOLD' && signal !== config.last_signal) {
                        const oracleMsg = `[ORACLE] ${signal} hint on ${base}/${target}. Market is ${sentiment}. Recommendation: ${advice}`;
                        await supabase.from('bot_logs').insert({
                            user_id,
                            message: oracleMsg,
                            type: signal.toLowerCase()
                        });

                        // Dispatch FCM Push Alert for Trade Opportunities
                        if (fcmToken && FIREBASE_SERVICE_ACCOUNT) {
                            const notifTitle = `SaktiBot Oracle: ${signal} ${base}/${target}`;
                            await sendPushNotification(fcmToken, notifTitle, oracleMsg, FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID);
                        }
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
