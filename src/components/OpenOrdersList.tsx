import React, { useState, useEffect, useCallback } from 'react';
import { fetchOpenOrders, cancelOrder } from '../utils/indodaxApi';
import { useIndodaxAuth } from '../hooks/useIndodaxAuth';

interface IndodaxOrder {
    order_id: string;
    type: 'buy' | 'sell';
    price: string;
    submit_time: string;
    finish_time: string;
    status: string;
    pair: string;
    remain_idr?: string;
    total_idr?: string;
    remain_btc?: string;
    total_btc?: string;
}

interface OpenOrdersListProps {
    coinId?: string; // Optional filter if needed in future
}

const OpenOrdersList: React.FC<OpenOrdersListProps> = () => {
    const { apiKey, secretKey, hasKeys } = useIndodaxAuth();
    const [orders, setOrders] = useState<IndodaxOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadOrders = useCallback(async () => {
        if (!hasKeys) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchOpenOrders(apiKey, secretKey);
            // Indodax returns { orders: { btc_idr: [...], ... } }
            if (data && data.orders) {
                const flatOrders: IndodaxOrder[] = [];
                Object.keys(data.orders).forEach(pair => {
                    const pairOrders = data.orders[pair] as any[];
                    pairOrders.forEach(order => {
                        flatOrders.push({ ...order, pair });
                    });
                });
                setOrders(flatOrders);
            } else {
                setOrders([]);
            }
        } catch (err: any) {
            setError(err.message || 'Gagal mengambil data order');
        } finally {
            setLoading(false);
        }
    }, [apiKey, secretKey, hasKeys]);

    useEffect(() => {
        loadOrders();
        const interval = setInterval(loadOrders, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [loadOrders]);

    const handleCancel = async (pair: string, orderId: string, type: 'buy' | 'sell') => {
        if (!window.confirm(`Batalkan pesanan ${type.toUpperCase()} #${orderId}?`)) return;
        
        try {
            await cancelOrder(apiKey, secretKey, pair, orderId, type);
            // Refresh list
            loadOrders();
        } catch (err: any) {
            alert(`Gagal membatalkan: ${err.message}`);
        }
    };

    if (!hasKeys) return <div className="p-4 text-center text-gray-500 text-xs italic">API Key diperlukan untuk melihat Open Orders.</div>;

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                    Open Orders (Indodax)
                </h3>
                <button 
                    onClick={() => loadOrders()} 
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Refresh Orders"
                    disabled={loading}
                >
                    <svg className={`w-3 h-3 text-gray-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            <div className="bg-black/40 rounded-lg p-2 flex-1 border border-gray-700/50 overflow-y-auto max-h-[200px] custom-scrollbar">
                {loading && orders.length === 0 ? (
                    <div className="flex justify-center items-center h-20">
                        <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 text-[10px] italic py-4">
                        <svg className="w-6 h-6 mb-1 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0l-8 4-8-4" /></svg>
                        Tidak ada pesanan terbuka
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {orders.map(order => {
                            const volume = order.type === 'buy' 
                                ? (order.remain_idr || order.total_idr) 
                                : (order.remain_btc || order.total_btc);
                            
                            return (
                                <div key={order.order_id} className="bg-gray-800/60 border border-gray-700/30 p-2 rounded flex justify-between items-center group hover:border-gray-600 transition-colors">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[9px] font-black px-1 rounded ${order.type === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                                {order.type.toUpperCase()}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-200">{order.pair.split('_')[0].toUpperCase()}</span>
                                        </div>
                                        <span className="text-[9px] text-gray-500 font-mono mt-0.5">#{order.order_id}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-[10px] font-bold text-white">Rp {parseFloat(order.price).toLocaleString('id-ID')}</div>
                                        <div className="text-[8.5px] text-gray-400">Vol: {volume ? parseFloat(volume).toFixed(4) : '0'}</div>
                                    </div>
                                    <button 
                                        onClick={() => handleCancel(order.pair, order.order_id, order.type)}
                                        className="ml-2 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                        title="Batalkan Order"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {error && <div className="mt-1 text-[8px] text-red-500 px-1 truncate">{error}</div>}
        </div>
    );
};

export default OpenOrdersList;
