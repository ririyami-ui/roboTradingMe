const functions = require("firebase-functions");
const fetch = require("node-fetch");

// ============================================================
// HELPER: Generic Proxy Function
// ============================================================
const createProxy = (targetBase, pathPrefix = "") => {
    return functions.https.onRequest(async (req, res) => {
        // CORS headers for browser access
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Key, Sign");

        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        try {
            // Strip the function name/path prefix from the URL
            let subPath = req.path || "/";
            const targetUrl = `${targetBase}${pathPrefix}${subPath}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`;

            const headers = { ...req.headers };
            // Remove headers that cause issues when forwarding
            delete headers.host;
            delete headers.connection;
            delete headers["content-length"];

            const fetchOptions = {
                method: req.method,
                headers: headers,
            };

            if (req.method === "POST") {
                // Forward body for POST requests (Indodax TAPI)
                const rawBody = await getRawBody(req);
                fetchOptions.body = rawBody;
            }

            const response = await fetch(targetUrl, fetchOptions);
            const data = await response.text();

            res.status(response.status);
            response.headers.forEach((value, name) => {
                if (!["content-encoding", "transfer-encoding", "connection"].includes(name.toLowerCase())) {
                    res.set(name, value);
                }
            });
            res.send(data);
        } catch (error) {
            console.error("Proxy Error:", error);
            res.status(500).json({ error: "Proxy Error", message: error.message });
        }
    });
};

// Helper to get raw POST body
const getRawBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
};

// ============================================================
// EXPORT: API Proxy Functions
// ============================================================

// Proxy: Indodax Private API (Trading, Balance)
exports.apiIndodaxTapi = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Key, Sign");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    try {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Key": req.headers["key"] || req.headers["Key"] || "",
            "Sign": req.headers["sign"] || req.headers["Sign"] || "",
        };

        const rawBody = await getRawBody(req);

        const response = await fetch("https://indodax.com/tapi", {
            method: "POST",
            headers: headers,
            body: rawBody,
        });

        const data = await response.text();
        res.status(response.status).set("Content-Type", "application/json").send(data);
    } catch (error) {
        console.error("Indodax TAPI Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error", message: error.message });
    }
});

// Proxy: Indodax Public API (Ticker, Order Book)
exports.apiIndodaxPublic = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    try {
        const targetUrl = `https://indodax.com/api${req.path}`;
        const response = await fetch(targetUrl);
        const data = await response.text();
        res.status(response.status).set("Content-Type", "application/json").send(data);
    } catch (error) {
        console.error("Indodax Public Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error", message: error.message });
    }
});

// Proxy: CoinGecko API (Market Data)
exports.apiCoingecko = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    try {
        const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
        const targetUrl = `https://api.coingecko.com/api/v3${req.path}${query}`;
        const response = await fetch(targetUrl, {
            headers: { "accept": "application/json" }
        });
        const data = await response.text();
        res.status(response.status).set("Content-Type", "application/json").send(data);
    } catch (error) {
        console.error("CoinGecko Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error", message: error.message });
    }
});

// Proxy: CryptoCompare API (Historical Price Data)
exports.apiCryptocompare = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    try {
        const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
        const targetUrl = `https://min-api.cryptocompare.com${req.path}${query}`;
        const response = await fetch(targetUrl, {
            headers: { "accept": "application/json" }
        });
        const data = await response.text();
        res.status(response.status).set("Content-Type", "application/json").send(data);
    } catch (error) {
        console.error("CryptoCompare Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error", message: error.message });
    }
});
