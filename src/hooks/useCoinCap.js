import { useState, useEffect } from "react";
import axios from "axios";

const API_CACHE = new Map();
const COINCAP_BASE_URL = '/api-coincap';

/**
 * A custom hook to fetch data from the CoinCap API 2.0 with caching.
 * @param {string} endpoint The API endpoint to fetch (e.g., 'assets', 'assets/bitcoin/history').
 * @param {object} params The query parameters for the request.
 * @returns {{data: any, loading: boolean, error: string | null}}
 */
export default function useCoinCap(endpoint, params = {}) {
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
        // Gunakan cara standar Axios. Proxy Vite akan menangani ini dengan benar.
        const response = await axios.get(`${COINCAP_BASE_URL}/${endpoint}`, { params });
        
        // Data dari CoinCap ada di dalam properti `data`
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

  }, [endpoint, JSON.stringify(params)]); // Use JSON.stringify to depend on params object value

  return { data, loading, error };
}