export default {
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Key, Sign',
                },
            });
        }

        let targetUrl = '';
        let options = {
            method: request.method,
            headers: {
                'Access-Control-Allow-Origin': '*',
            }
        };

        const isGet = request.method === 'GET';
        const cache = caches.default;
        
        // Cache only GET requests
        if (isGet) {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                // Add header to indicate cache hit for debugging
                const newHeaders = new Headers(cachedResponse.headers);
                newHeaders.set('X-Proxy-Cache', 'HIT');
                return new Response(cachedResponse.body, {
                    status: cachedResponse.status,
                    statusText: cachedResponse.statusText,
                    headers: newHeaders
                });
            }
        }

        if (path.startsWith('/public/')) {
            const subPath = path.replace('/public/', '');
            targetUrl = `https://indodax.com/api/${subPath}${url.search}`;
        } else if (path.startsWith('/tradingview/')) {
            // Forward ke Indodax TradingView API
            // /tradingview/history_v2 -> indodax.com/tradingview/history_v2
            const subPath = path.replace('/tradingview/', '');
            targetUrl = `https://indodax.com/tradingview/${subPath}${url.search}`;
        } else if (path === '/tapi') {
            targetUrl = 'https://indodax.com/tapi';
            options.method = 'POST';
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.headers['Key'] = request.headers.get('Key') || '';
            options.headers['Sign'] = request.headers.get('Sign') || '';
            options.body = await request.text();
        } else {
            return new Response('Path not found', { status: 404 });
        }

        try {
            const response = await fetch(targetUrl, options);
            const data = await response.text();

            const finalResponse = new Response(data, {
                status: response.status,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                    'Cache-Control': isGet ? 'public, max-age=60' : 'no-cache',
                    'X-Proxy-Cache': 'MISS',
                },
            });

            // Cache successful GET responses for 60 seconds
            if (isGet && response.status === 200) {
                await cache.put(request, finalResponse.clone());
            }

            return finalResponse;
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                }
            });
        }
    },
};
