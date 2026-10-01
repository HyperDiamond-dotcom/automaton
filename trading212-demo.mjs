import http from "node:http";

const PORT = Number(process.env.PORT || 3000);

const BASE_URL =
  process.env.T212_BASE_URL ||
  "https://demo.trading212.com/api/v0";

const API_KEY = process.env.T212_API_KEY || "";
const API_SECRET = process.env.T212_API_SECRET || "";

// SAFETY LOCK — this program will only talk to Trading 212 Demo.
if (BASE_URL !== "https://demo.trading212.com/api/v0") {
  throw new Error(
    "Safety lock: only the Trading 212 DEMO environment is permitted."
  );
}

let status = {
  connected: false,
  environment: "DEMO / PRACTICE",
  lastChecked: null,
  error: "Waiting for Trading 212 credentials"
};

async function checkTrading212() {
  if (!API_KEY || !API_SECRET) {
    status = {
      connected: false,
      environment: "DEMO / PRACTICE",
      lastChecked: new Date().toISOString(),
      error: "Trading 212 API credentials have not been configured"
    };
    return;
  }

  const credentials = Buffer
    .from(`${API_KEY}:${API_SECRET}`)
    .toString("base64");

  try {
    const response = await fetch(
      `${BASE_URL}/equity/account/summary`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Trading 212 returned HTTP ${response.status}`);
    }

    await response.json();

    status = {
      connected: true,
      environment: "DEMO / PRACTICE",
      lastChecked: new Date().toISOString(),
      error: null
    };

    console.log("Trading 212 DEMO connection verified");
  } catch (error) {
    status = {
      connected: false,
      environment: "DEMO / PRACTICE",
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };

    console.error("Trading 212 DEMO connection failed:", status.error);
  }
}

await checkTrading212();

setInterval(checkTrading212, 5 * 60 * 1000);

http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/health") {
      res.statusCode = status.connected ? 200 : 503;
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    res.end(
      JSON.stringify({
        service: "Trading 212 Practice Bridge",
        environment: "DEMO ONLY",
        health: "/health"
      })
    );
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`Practice bridge running on port ${PORT}`);
  });
