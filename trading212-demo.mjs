import http from "node:http";

const PORT = Number(process.env.PORT || 3000);

const BASE_URL =
  process.env.T212_BASE_URL ||
  "https://demo.trading212.com/api/v0";

const API_KEY = process.env.T212_API_KEY || "";
const API_SECRET = process.env.T212_API_SECRET || "";
const BRIDGE_ACCESS_TOKEN = process.env.BRIDGE_ACCESS_TOKEN || "";

// SAFETY LOCK — DEMO / PRACTICE ONLY.
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

function trading212Headers() {
  const credentials = Buffer
    .from(`${API_KEY}:${API_SECRET}`)
    .toString("base64");

  return {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json"
  };
}

function authorized(req) {
  return (
    BRIDGE_ACCESS_TOKEN &&
    req.headers.authorization === `Bearer ${BRIDGE_ACCESS_TOKEN}`
  );
}

async function trading212Get(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: trading212Headers()
  });

  if (!response.ok) {
    throw new Error(`Trading 212 returned HTTP ${response.status}`);
  }

  return response.json();
}

async function getAccountSummary() {
  return trading212Get("/equity/account/summary");
}

async function getPositions() {
  return trading212Get("/equity/positions");
}

async function readJsonBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;

    if (body.length > 10000) {
      throw new Error("Request body too large");
    }
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

function makeTradePlan(input) {
  const ticker =
    typeof input.ticker === "string"
      ? input.ticker.trim().toUpperCase()
      : "";

  const side =
    typeof input.side === "string"
      ? input.side.trim().toUpperCase()
      : "";

  const quantity = Number(input.quantity);

  const errors = [];

  if (!ticker) {
    errors.push("ticker is required");
  }

  if (!["BUY", "SELL"].includes(side)) {
    errors.push("side must be BUY or SELL");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push("quantity must be greater than zero");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  return {
    valid: true,
    dryRun: true,
    environment: "DEMO / PRACTICE",
    orderType: "MARKET",
    ticker,
    side,
    quantity,
    message:
      "DRY RUN ONLY — no order has been sent to Trading 212."
  };
}

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

  try {
    await getAccountSummary();

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

    console.error(
      "Trading 212 DEMO connection failed:",
      status.error
    );
  }
}

await checkTrading212();

setInterval(checkTrading212, 5 * 60 * 1000);

http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    if (req.url === "/health" && req.method === "GET") {
      res.statusCode = status.connected ? 200 : 503;
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    if (req.url === "/account" && req.method === "GET") {
      if (!authorized(req)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Unauthorized" }, null, 2));
        return;
      }

      try {
        const account = await getAccountSummary();

        res.statusCode = 200;
        res.end(
          JSON.stringify(
            {
              environment: "DEMO / PRACTICE",
              account
            },
            null,
            2
          )
        );
      } catch (error) {
        res.statusCode = 502;
        res.end(
          JSON.stringify(
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(error)
            },
            null,
            2
          )
        );
      }

      return;
    }

    if (req.url === "/positions" && req.method === "GET") {
      if (!authorized(req)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Unauthorized" }, null, 2));
        return;
      }

      try {
        const positions = await getPositions();

        res.statusCode = 200;
        res.end(
          JSON.stringify(
            {
              environment: "DEMO / PRACTICE",
              positions
            },
            null,
            2
          )
        );
      } catch (error) {
        res.statusCode = 502;
        res.end(
          JSON.stringify(
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(error)
            },
            null,
            2
          )
        );
      }

      return;
    }

    if (req.url === "/plan" && req.method === "POST") {
      if (!authorized(req)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Unauthorized" }, null, 2));
        return;
      }

      try {
        const input = await readJsonBody(req);
        const plan = makeTradePlan(input);

        res.statusCode = plan.valid ? 200 : 400;
        res.end(JSON.stringify(plan, null, 2));
      } catch (error) {
        res.statusCode = 400;
        res.end(
          JSON.stringify(
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(error)
            },
            null,
            2
          )
        );
      }

      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify(
        {
          service: "Trading 212 Practice Bridge",
          environment: "DEMO ONLY",
          health: "GET /health",
          account: "GET /account",
          positions: "GET /positions",
          tradePlanner: "POST /plan",
          tradingEnabled: false
        },
        null,
        2
      )
    );
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`Practice bridge running on port ${PORT}`);
  });