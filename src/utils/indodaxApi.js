import CryptoJS from 'crypto-js';

// ================================================================
// URL Detection: Dev -> Vite Proxy, Production -> Direct API
// ================================================================
const isDev = import.meta.env.DEV;

// Public API (Indodax Ticker, Order Book)
// Dev: Vite proxy | Production: Cloudflare Worker subpath /public/
const PUBLIC_API_URL = isDev ? '/api-indodax-public' : 'https://indodax-proxy.ri2ami77.workers.dev/public';

// Private API (Trading, Info)
// Dev: Vite proxy | Production: Cloudflare Worker subpath /tapi
const TAPI_PROXY = isDev ? '/api-indodax-tapi' : 'https://indodax-proxy.ri2ami77.workers.dev/tapi';

/**
 * Generate HMAC-SHA512 signature untuk Private API Indodax
 */
export const generateSignature = (queryString, secretKey) => {
  return CryptoJS.HmacSHA512(queryString, secretKey).toString();
};

/**
 * Helper with retry and direct fallback untuk Public API
 */
const fetchWithRetryAndFallback = async (proxyUrl, directPath, retries = 2) => {
  const directUrl = `https://indodax.com/api${directPath}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.warn(`[Proxy Request Failed] ${proxyUrl}: ${error.message}. Retrying ${i + 1}/${retries}...`);
      if (i === retries) break;
      await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
    }
  }

  // Fallback to direct API if proxy fails
  console.warn(`[Fallback] Attempting direct fetch to ${directUrl}...`);
  try {
    const response = await fetch(directUrl);
    if (!response.ok) throw new Error(`HTTP direct error! status: ${response.status}`);
    return await response.json();
  } catch (fallbackError) {
    console.error(`[Fallback Failed] direct API ${directUrl}:`, fallbackError.message);
    throw fallbackError;
  }
};

/**
 * Fetch data ticker publik dari Indodax
 * @param {string} pair - Contoh: 'btc_idr', 'eth_idr'
 */
export const fetchTicker = async (pair) => {
  try {
    const data = await fetchWithRetryAndFallback(`${PUBLIC_API_URL}/ticker/${pair}`, `/ticker/${pair}`);
    return data.ticker || null;
  } catch (error) {
    console.warn(`Error fetching Indodax ticker for ${pair}:`, error.message);
    return null;
  }
};

/**
 * Fetch data order book untuk mengecek spread dan likuiditas
 * @param {string} pair - Contoh: 'btc_idr'
 */
export const fetchOrderBook = async (pair) => {
  try {
    const data = await fetchWithRetryAndFallback(`${PUBLIC_API_URL}/depth/${pair}`, `/depth/${pair}`);
    return data;
  } catch (error) {
    console.warn(`Error fetching Indodax depth for ${pair}:`, error.message);
    return null;
  }
};

/**
 * Fetch semua data ticker koin (Summaries) dari Indodax
 */
export const fetchSummaries = async () => {
  try {
    const data = await fetchWithRetryAndFallback(`${PUBLIC_API_URL}/summaries`, '/summaries');
    return data;
  } catch (error) {
    console.error('Error fetching Indodax summaries:', error);
    throw error;
  }
};

/**
 * Mendapatkan persentase perubahan harga Bitcoin (BTC/IDR) dalam 24 jam terakhir.
 * Digunakan sebagai indikator "Global Cooldown" (Bitcoin Guard).
 * @returns {Promise<number>} Persentase perubahan (misal: -5.2)
 */
export const fetchBitcoin24hChange = async () => {
  try {
    const summaries = await fetchSummaries();
    if (summaries && summaries.prices_24h && summaries.prices_24h.btcidr) {
      const p24 = parseFloat(summaries.prices_24h.btcidr);
      const tickers = summaries.tickers || {};
      const current = parseFloat(tickers.btc_idr?.last || 0);
      
      if (p24 > 0 && current > 0) {
        const change = ((current - p24) / p24) * 100;
        return change;
      }
    }
    return 0;
  } catch (err) {
    console.warn("Gagal mengambil status Bitcoin:", err.message);
    return 0;
  }
};

let lastNonce = 0;
let privateApiLock = Promise.resolve(); // Global lock to throttle TAPI requests

/**
 * Helper function untuk melakukan request ke Private API
 */
const privateApiRequest = async (method, apiKey, secretKey, params = {}, retryCount = 0) => {
  if (!apiKey || !secretKey) {
    throw new Error('API Key dan Secret Key dibutuhkan untuk request private.');
  }

  // GLOBAL THROTTLE: Tunggu giliran agar antar request TAPI ada jeda minimal 1.5 detik
  // Ini krusial untuk mencegah 429 Too Many Requests dari IP proxy.
  await privateApiLock;
  privateApiLock = privateApiLock.then(() => new Promise(res => setTimeout(res, 1500)));

  // Pastikan Nonce selalu bertambah dan sinkron dengan waktu milidetik
  // Indodax membutuhkan nonce unik bertambah besar setiap request.
  let now = Date.now();
  if (now <= lastNonce) {
    lastNonce++;
  } else {
    lastNonce = now;
  }

  const currentNonce = lastNonce;

  const payload = {
    method,
    nonce: currentNonce,
    ...params,
  };

  const queryString = Object.keys(payload)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(payload[key])}`)
    .join('&');

  const signature = generateSignature(queryString, secretKey);

  try {
    const response = await fetch(TAPI_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Key': apiKey,
        'Sign': signature,
      },
      body: queryString,
    });

    const data = await response.json();

    // Log diagnostic info (redacted keys for safety)
    if (data.success !== 1) {
        console.error(`[Indodax TAPI Diagnostic] Method: ${method}, Success: ${data.success}, Error: ${data.error || 'Unknown'}`);
    } else {
        // console.log(`[Indodax TAPI Diagnostic] Method: ${method} succeeded.`);
    }

    if (data.success !== 1) {
      const errorMsg = data.error || 'Indodax API Error';

      // AUTO-FIX NONCE: Jika error nonce, ambil angka yang diminta server dan coba lagi
      if (errorMsg.includes('Nonce must be greater than') && retryCount < 3) {
        const match = errorMsg.match(/greater than (\d+)/);
        if (match) {
          console.warn(`[Indodax] Fixing Nonce: Server requested > ${match[1]}. Retrying...`);
          lastNonce = parseInt(match[1]) + 1;
          return privateApiRequest(method, apiKey, secretKey, params, retryCount + 1);
        }
      }

      const err = new Error(errorMsg);
      err.isApiError = true;
      throw err;
    }

    return data.return;
  } catch (error) {
    if (!error.isApiError && retryCount < 3) {
      console.warn(`[Indodax TAPI] Network error on ${method}: ${error.message}. Retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return privateApiRequest(method, apiKey, secretKey, params, retryCount + 1);
    }
    if (retryCount >= 3) {
      console.error(`Indodax Private API (${method}) error after retries:`, error);
    }
    throw error;
  }
};

/**
 * Mendapatkan informasi saldo akun (User Info)
 */
export const getUserInfo = async (apiKey, secretKey) => {
  return await privateApiRequest('getInfo', apiKey, secretKey);
};

/**
 * Mengeksekusi order beli atau jual
 * @param {string} pair - Contoh: 'btc_idr'
 * @param {string} type - 'buy' atau 'sell'
 * @param {number} price - Harga beli/jual (IDR)
 * @param {number} amount - Jumlah Kripto (sell) atau Rupiah (buy)
 * @param {object} extraParams - Parameter tambahan (misal: { order_type: 'stoplimit', stop_price: 10000 })
 */
export const tradeOrder = async (apiKey, secretKey, pair, type, price, amount, extraParams = {}) => {
  const params = {
    pair,
    type,
    price,
    ...extraParams
  };

  const [coin, fiat] = pair.split('_');

  if (type === 'buy') {
    params[fiat] = amount;
  } else if (type === 'sell') {
    params[coin] = amount;
  }

  // [GUARD] Validasi minimum order sebelum dikirim ke Indodax
  // Indodax mensyaratkan minimum order ~Rp 10.000 untuk hampir semua pair
  const MIN_IDR_ORDER = 10000;
  if (type === 'buy' && parseFloat(amount) < MIN_IDR_ORDER) {
    const errMsg = `Jumlah beli terlalu kecil: Rp ${parseFloat(amount).toLocaleString('id-ID')} (minimum Rp ${MIN_IDR_ORDER.toLocaleString('id-ID')})`;
    console.warn(`[tradeOrder GUARD] ${errMsg}`);
    throw new Error(errMsg);
  }

  return await privateApiRequest('trade', apiKey, secretKey, params);
};

/**
 * Membatalkan order yang sedang terbuka
 * @param {string} pair - Contoh: 'btc_idr'
 * @param {number} order_id - ID pesanan yang ingin dibatalkan
 * @param {string} type - 'buy' atau 'sell'
 */
export const cancelOrder = async (apiKey, secretKey, pair, order_id, type) => {
  return await privateApiRequest('cancelOrder', apiKey, secretKey, {
    pair,
    order_id,
    type
  });
};

/**
 * Mendapatkan daftar order yang sedang terbuka (Open Orders)
 * @param {string} pair - Opsional, biarkan kosong untuk semua pair
 */
export const fetchOpenOrders = async (apiKey, secretKey, pair = '') => {
  const params = {};
  if (pair) params.pair = pair;
  return await privateApiRequest('openOrders', apiKey, secretKey, params);
};
