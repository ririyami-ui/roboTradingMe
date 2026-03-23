import { useState, useEffect } from "react";
import axios from "axios";

const API_CACHE = new Map<string, any>();
const COINCAP_BASE_URL = '/api-coincap';

/**
 * A custom hook to fetch data from the CoinCap API 2.0 with caching.
 * @param {string} endpoint The API endpoint to fetch (e.g., 'assets', 'assets/bitcoin/history').
 * @param {Record<string, string | number | boolean>} params The query parameters for the request.
 * @returns {{data: T | null, loading: boolean, error: string | null}}
 */
export default function useCoinCap<T = any>(endpoint: string, params: Record<string, string | number | boolean> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const paramString = new URLSearchParams(params as Record<string, string>).toString();
    const cacheKey = `${endpoint}?${paramString}`;

    const fetchData = async () => {
      if (API_CACHE.has(cacheKey)) {
        setData(API_CACHE.get(cacheKey));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await axios.get(`${COINCAP_BASE_URL}/${endpoint}`, { params });
        const responseData = response.data.data;
        API_CACHE.set(cacheKey, responseData);
        setData(responseData);
      } catch (err) {
        console.error("CoinCap API Fetch Error:", err);
        setError("Failed to fetch data from CoinCap.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

  }, [endpoint, JSON.stringify(params)]);

  return { data, loading, error };
}
