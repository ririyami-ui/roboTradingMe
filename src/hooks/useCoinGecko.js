import { useState, useEffect } from "react";
import axios from "axios";

const API_CACHE = new Map();

/**
 * A custom hook to fetch data from the CoinGecko API with caching.
 * @param {string} endpoint The API endpoint to fetch.
 * @param {object} params The query parameters for the request.
 * @returns {{data: any, loading: boolean, error: string | null}}
 */
export default function useCoinGecko(endpoint, params = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const paramString = new URLSearchParams(params).toString();
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
        // Selalu gunakan proxy Vite. Ini akan berfungsi di dev dan preview.
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

    // Use a small timeout to debounce multiple requests on initial load
    const timer = setTimeout(() => {
      fetchData();
    }, 50);

    return () => clearTimeout(timer);
  }, [endpoint, JSON.stringify(params)]); // Use JSON.stringify to depend on params object value

  return { data, loading, error };
}