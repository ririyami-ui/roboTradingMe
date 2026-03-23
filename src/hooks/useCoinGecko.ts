import { useState, useEffect } from "react";
import axios from "axios";

const API_CACHE = new Map<string, any>();

/**
 * A custom hook to fetch data from the CoinGecko API with caching.
 * @param {string} endpoint The API endpoint to fetch.
 * @param {Record<string, string | number | boolean>} params The query parameters for the request.
 * @returns {{data: T | null, loading: boolean, error: string | null}}
 */
export default function useCoinGecko<T = any>(endpoint: string, params: Record<string, string | number | boolean> = {}) {
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
        const baseUrl = '/api-coingecko';
        const response = await axios.get(`${baseUrl}/${endpoint}`, { params });

        API_CACHE.set(cacheKey, response.data);
        setData(response.data);
      } catch (err) {
        console.error("API Fetch Error:", err);
        setError("Failed to fetch data from CoinGecko.");
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchData();
    }, 50);

    return () => clearTimeout(timer);
  }, [endpoint, JSON.stringify(params)]);

  return { data, loading, error };
}
