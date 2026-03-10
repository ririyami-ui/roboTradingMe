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

        if (path.startsWith('/public/')) {
            // Forward ke Indodax Public API (GET)
            // indodax-proxy.dev/public/ticker/btc_idr -> indodax.com/api/ticker/btc_idr
            const subPath = path.replace('/public/', '');
            targetUrl = `https://indodax.com/api/${subPath}${url.search}`;
        } else if (path === '/tapi') {
            // Forward ke Indodax Private API (POST)
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

            return new Response(data, {
                status: response.status,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }
    },
};
