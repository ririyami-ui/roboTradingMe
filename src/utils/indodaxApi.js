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
 * Fetch data ticker publik dari Indodax
 * @param {string} pair - Contoh: 'btc_idr', 'eth_idr'
 */
export const fetchTicker = async (pair) => {
  try {
    const response = await fetch(`${PUBLIC_API_URL}/ticker/${pair}`);
    if (!response.ok) return null;
    const data = await response.json();
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
    const response = await fetch(`${PUBLIC_API_URL}/depth/${pair}`);
    if (!response.ok) return null;
    const data = await response.json();
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
    const response = await fetch(`${PUBLIC_API_URL}/summaries`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Indodax summaries:', error);
    throw error;
  }
};

let lastNonce = 0;

/**
 * Helper function untuk melakukan request ke Private API
 */
const privateApiRequest = async (method, apiKey, secretKey, params = {}, retryCount = 0) => {
  if (!apiKey || !secretKey) {
    throw new Error('API Key dan Secret Key dibutuhkan untuk request private.');
  }

  // Pastikan Nonce selalu bertambah meskipun request dikirim dalam milidetik yang sama
  const now = Date.now();
  if (now <= lastNonce) {
    lastNonce++;
  } else {
    lastNonce = now;
  }

  const payload = {
    method,
    nonce: lastNonce,
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

      throw new Error(errorMsg);
    }

    return data.return;
  } catch (error) {
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
