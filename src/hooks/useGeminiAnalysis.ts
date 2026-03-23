import { useState } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useIndodaxAuth } from './useIndodaxAuth';

interface GetAnalysisParams {
  prices: number[];
  coinName: string;
  usdToIdrRate: number;
}

export function useGeminiAnalysis() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { geminiKey } = useIndodaxAuth();

  const getAnalysis = async ({ prices, coinName, usdToIdrRate }: GetAnalysisParams) => {
    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const apiKey = geminiKey || (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key belum diatur di menu Settings atau di file .env.");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

      const recentPrices = prices.slice(-50);

      const prompt = `
        Anda adalah seorang analis teknikal aset kripto profesional dengan fokus pada market Indonesia seperti Indodax.
        Kurs 1 USD saat ini adalah sekitar Rp ${Math.round(usdToIdrRate)}.
        Berdasarkan 50 data harga penutupan terakhir untuk ${coinName} (dalam USD) berikut: ${recentPrices.join(", ")}.
        
        Berikan analisis teknikal yang ringkas dan akurat dalam Bahasa Indonesia, seolah-olah Anda memberikan nasihat untuk trader di Indodax.
        
        Analisis Anda harus mencakup:
        1.  **Ringkasan Tren**: Jelaskan tren harga terkini (Uptrend, Downtrend, atau Sideways).
        2.  **Support & Resistance (dalam Rupiah)**: Identifikasi level support dan resistance potensial. **Sangat penting: Konversikan semua nilai harga ke dalam Rupiah (IDR) menggunakan kurs yang diberikan.** Format harga dalam Rupiah (contoh: Rp 1.120.000.000).
        3.  **Perkiraan Aksi (dalam Rupiah)**: Berikan perkiraan titik masuk (area beli) si titik keluar (area jual/take-profit) yang masuk akal. **Konversikan juga semua nilai harga ini ke dalam Rupiah (IDR).** Jelaskan alasan singkat di baliknya.
        4.  **Rekomendasi Aksi**: Berdasarkan analisis tren saat ini, berikan rekomendasi jelas dalam satu kata: **BELI**, **TAHAN (HOLD)**, atau **JUAL**.
        
        Format respons Anda dalam Markdown agar mudah dibaca. Pastikan tidak ada baris teks atau kode yang sangat panjang yang bisa menyebabkan scroll horizontal.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const analysisText = response.text();

      setAnalysis(analysisText);
    } catch (err: any) {
      console.error("Error fetching Gemini analysis:", err);
      setError(err.message || "Failed to get analysis. Please try again later.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    analysis,
    isAnalyzing,
    error,
    getAnalysis,
    clearAnalysis: () => setAnalysis(null)
  };
}
