import CryptoJS from 'crypto-js';
import { IndodaxTicker, IndodaxUserInfo, IndodaxOrder } from '../types/indodax';

// ================================================================
// URL Detection: Dev -> Vite Proxy, Production -> Direct API
// ================================================================
const isDev = import.meta.env.DEV;

// Public API (Indodax Ticker, Order Book)
const PUBLIC_API_URL = isDev ? '/api-indodax-public' : 'https://indodax-proxy.ri2ami77.workers.dev/public';

// Private API (Trading, Info)
const TAPI_PROXY = isDev ? '/api-indodax-tapi' : 'https://indodax-proxy.ri2ami77.workers.dev/tapi';

/**
 * Generate HMAC-SHA512 signature untuk Private API Indodax
 */
export const generateSignature = (queryString: string, secretKey: string): string => {
  return CryptoJS.HmacSHA512(queryString, secretKey).toString();
};

/**
 * Helper with retry and direct fallback untuk Public API
 */
const fetchWithRetryAndFallback = async <T>(proxyUrl: string, directPath: string, retries = 2): Promise<T> => {
  const directUrl = `https://indodax.com/api${directPath}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data;
    } catch (error: any) {
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
  } catch (fallbackError: any) {
    console.error(`[Fallback Failed] direct API ${directUrl}:`, fallbackError.message);
    throw fallbackError;
  }
};

/**
 * Fetch data ticker publik dari Indodax
 */
export const fetchTicker = async (pair: string): Promise<IndodaxTicker | null> => {
  const cleanPair = pair.replace('_', '');
  try {
    const data = await fetchWithRetryAndFallback<{ ticker: IndodaxTicker }>(`${PUBLIC_API_URL}/ticker/${cleanPair}`, `/ticker/${cleanPair}`);
    return data.ticker || null;
  } catch (error: any) {
    console.warn(`Error fetching Indodax ticker for ${pair}:`, error.message);
    return null;
  }
};

/**
 * Fetch data order book untuk mengecek spread dan likuiditas
 */
export const fetchOrderBook = async (pair: string): Promise<any> => {
  const cleanPair = pair.replace('_', '');
  try {
    const data = await fetchWithRetryAndFallback<any>(`${PUBLIC_API_URL}/depth/${cleanPair}`, `/depth/${cleanPair}`);
    return data;
  } catch (error: any) {
    console.warn(`Error fetching Indodax depth for ${pair}:`, error.message);
    return null;
  }
};

/**
 * Fetch semua data ticker koin (Summaries) dari Indodax
 */
export const fetchSummaries = async (): Promise<any> => {
  try {
    const data = await fetchWithRetryAndFallback<any>(`${PUBLIC_API_URL}/summaries`, '/summaries');
    return data;
  } catch (error) {
    console.error('Error fetching Indodax summaries:', error);
    throw error;
  }
};

/**
 * Fetch data candlestick history dari Indodax TradingView API
 */
export const fetchChartHistory = async (symbol: string, tf: string, from: number, to: number): Promise<any> => {
  const proxyBase = PUBLIC_API_URL.replace('public', 'tradingview');
  const fromInt = Math.floor(from);
  const toInt = Math.floor(to);
  const proxyUrl = `${proxyBase}/history_v2?symbol=${symbol}&tf=${tf}&from=${fromInt}&to=${toInt}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`[Indodax] Rate limited (429) on chart data for ${symbol}.`);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.warn(`[Chart Proxy Failed] ${proxyUrl}: ${error.message}. Attempting direct fallback...`);
    const directUrl = `https://indodax.com/tradingview/history_v2?symbol=${symbol}&tf=${tf}&from=${fromInt}&to=${toInt}`;
    try {
      const response = await fetch(directUrl);
      if (!response.ok) throw new Error(`HTTP direct error! status: ${response.status}`);
      return await response.json();
    } catch (fallbackError: any) {
      console.error(`[Chart Fallback Failed] direct API ${directUrl}:`, fallbackError.message);
      return [];
    }
  }
};

/**
 * Mendapatkan persentase perubahan harga Bitcoin (BTC/IDR) dalam 24 jam terakhir.
 */
export const fetchBitcoin24hChange = async (): Promise<number> => {
  try {
    const summaries = await fetchSummaries();
    if (summaries && summaries.prices_24h && summaries.prices_24h.btcidr) {
      const p24 = parseFloat(summaries.prices_24h.btcidr);
      const tickers = summaries.tickers || {};
      const current = parseFloat(tickers.btc_idr?.last || 0);
      
      if (p24 > 0 && current > 0) {
        return ((current - p24) / p24) * 100;
      }
    }
    return 0;
  } catch (err: any) {
    console.warn("Gagal mengambil status Bitcoin:", err.message);
    return 0;
  }
};

let lastNonce = parseInt(sessionStorage.getItem('indodax_last_nonce') || '0', 10);
let privateApiLock = Promise.resolve();

/**
 * Helper function untuk melakukan request ke Private API
 */
const privateApiRequest = async <T>(method: string, apiKey: string, secretKey: string, params: any = {}, retryCount = 0): Promise<T> => {
  if (!apiKey || !secretKey) {
    throw new Error('API Key dan Secret Key dibutuhkan untuk request private.');
  }

  await privateApiLock;
  privateApiLock = privateApiLock.then(() => new Promise(res => setTimeout(res, 2000)));

  let now = Date.now();
  if (now <= lastNonce) {
    lastNonce++;
  } else {
    lastNonce = now;
  }
  sessionStorage.setItem('indodax_last_nonce', String(lastNonce));

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
      if (errorMsg.includes('Nonce must be greater than') && retryCount < 3) {
        const match = errorMsg.match(/greater than (\d+)/);
        if (match) {
          const serverNonce = parseInt(match[1], 10);
          lastNonce = serverNonce + 1;
          sessionStorage.setItem('indodax_last_nonce', String(lastNonce));
          return privateApiRequest<T>(method, apiKey, secretKey, params, retryCount + 1);
        }
      }

      const err: any = new Error(errorMsg);
      err.isApiError = true;
      throw err;
    }

    return data.return;
  } catch (error: any) {
    if (!error.isApiError && retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return privateApiRequest<T>(method, apiKey, secretKey, params, retryCount + 1);
    }
    throw error;
  }
};

export const getUserInfo = async (apiKey: string, secretKey: string): Promise<IndodaxUserInfo> => {
  return await privateApiRequest<IndodaxUserInfo>('getInfo', apiKey, secretKey);
};

export const tradeOrder = async (apiKey: string, secretKey: string, pair: string, type: string, price: number, amount: number, extraParams: any = {}): Promise<any> => {
  const params: any = { pair, type, price, ...extraParams };
  const [coin, fiat] = pair.split('_');

  if (type === 'buy') {
    params[fiat] = amount;
  } else if (type === 'sell') {
    params[coin] = amount;
  }

  const MIN_IDR_ORDER = 10000;
  if (type === 'buy' && amount < MIN_IDR_ORDER) {
    throw new Error(`Jumlah beli terlalu kecil: Rp ${amount.toLocaleString('id-ID')}`);
  }

  return await privateApiRequest<any>('trade', apiKey, secretKey, params);
};

export const cancelOrder = async (apiKey: string, secretKey: string, pair: string, order_id: string | number, type: string): Promise<any> => {
  return await privateApiRequest<any>('cancelOrder', apiKey, secretKey, { pair, order_id, type });
};

export const fetchOpenOrders = async (apiKey: string, secretKey: string, pair = ''): Promise<IndodaxOrder[]> => {
  const params: any = {};
  if (pair) params.pair = pair;
  const data = await privateApiRequest<{ orders: IndodaxOrder[] }>('openOrders', apiKey, secretKey, params);
  // Return empty array if no orders found (Indodax sometimes returns null or undefined if empty)
  return (data as any).orders || [];
};
// Refresh 03/17/2026 00:21:40
