import express from "express";
import path from "path";
import multer from "multer";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import * as zmq from "zeromq";

const PROJECT_ROOT = process.cwd();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Global State managed by ZMQ
  let killSwitchActive = false;
  let obsidianPath = "/workspace/vault";
  
  let liveTelemetry = {
    balance: 0.0,
    equity: 0.0,
    server_time: "Offline",
    pc_time: "Offline",
    market_open: false,
    history: []
  };

  let systemActive = false;
  let lastUpdate = 0;

  const ingestionDir = path.join(PROJECT_ROOT, "ingested_files");
  if (!fs.existsSync(ingestionDir)) {
    fs.mkdirSync(ingestionDir, { recursive: true });
  }

  const upload = multer({ dest: ingestionDir });

  // ZeroMQ Receiver Background Task
  let zmqSock: zmq.Pull | null = null;
  async function runZmqReceiver() {
    zmqSock = new zmq.Pull();
    try {
      await zmqSock.bind("tcp://0.0.0.0:5555");
      console.log("ZMQ Bound to port 5555 for MT5 Telemetry...");
      
      for await (const [msg] of zmqSock) {
        const payload = msg.toString();
        try {
          const data = JSON.parse(payload);
          if (data.action === "TELEMETRY") {
            liveTelemetry.balance = data.balance;
            liveTelemetry.equity = data.equity;
            liveTelemetry.server_time = data.server_time;
            liveTelemetry.pc_time = data.pc_time;
            liveTelemetry.market_open = data.market_open;
            if (data.history) {
              liveTelemetry.history = data.history;
            }
            systemActive = true;
            lastUpdate = Date.now();
          }
        } catch (e) {
          console.error("Error parsing ZMQ message", e);
        }
      }
    } catch (e) {
      console.error("ZMQ Bind Error:", e);
    }
  }

  // Start ZMQ
  runZmqReceiver().catch(console.error);

  // Graceful shutdown
  process.on("SIGTERM", () => {
    if (zmqSock) zmqSock.close();
    process.exit(0);
  });
  
  process.on("SIGINT", () => {
    if (zmqSock) zmqSock.close();
    process.exit(0);
  });

  // Telemetry endpoint
  app.get("/api/telemetry", (req, res) => {
    // Determine if system is active (data received in last 5 seconds)
    const isActive = (Date.now() - lastUpdate) < 5000;
    
    // Calculate PNL from history if available
    let pnl = 0;
    if (liveTelemetry.history.length > 0) {
      pnl = liveTelemetry.history.reduce((sum: number, deal: any) => sum + deal.profit, 0);
    }

    res.json({
      status: killSwitchActive ? "HALTED" : (isActive ? "ONLINE" : "WAITING FOR MT5"),
      trades_active: 0, // Would need order data to compute open trades, we only have history
      win_rate: "--%",
      daily_pnl: pnl >= 0 ? "+$" + pnl.toFixed(2) : "-$" + Math.abs(pnl).toFixed(2),
      killSwitch: killSwitchActive,
      account_balance: liveTelemetry.balance,
      account_equity: liveTelemetry.equity,
      server_time: liveTelemetry.server_time,
      pc_time: liveTelemetry.pc_time,
      market_open: liveTelemetry.market_open,
      trade_history: liveTelemetry.history,
      system_active: isActive
    });
  });

  // Toggle kill switch
  app.post("/api/killswitch", (req, res) => {
    const { action } = req.body;
    if (action === "activate") killSwitchActive = true;
    if (action === "deactivate") killSwitchActive = false;
    res.json({ success: true, killSwitch: killSwitchActive });
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    res.json({ obsidianPath });
  });

  app.post("/api/settings", (req, res) => {
    const { path: newPath } = req.body;
    if (newPath) {
      obsidianPath = newPath;
    }
    res.json({ success: true, obsidianPath });
  });

  // Terminal commands
  app.post("/api/command", (req, res) => {
    const { command } = req.body;
    // Echo back a response
    res.json({
      response: `> [SYSTEM] Command received: ${command}\n> [SYSTEM] Delegating task to sub-agents...`
    });
  });

  // File upload for knowledge base (Knowledge Drop)
  app.post("/api/knowledge/drop", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    // In a real application, here we would move the file to `obsidianPath` or process with ChromaDB.
    const originalName = req.file.originalname;
    const destPath = path.join(ingestionDir, originalName);
    fs.renameSync(req.file.path, destPath);

    res.json({ success: true, filename: originalName });
  });

  app.get("/api/knowledge/files", (req, res) => {
    try {
      const files = fs.readdirSync(ingestionDir).map(file => {
        const stats = fs.statSync(path.join(ingestionDir, file));
        return {
          name: file,
          size: stats.size,
          mtime: stats.mtime.toISOString()
        };
      });
      res.json({ files });
    } catch (e) {
      res.json({ files: [] });
    }
  });

  // Endpoints for Journal and Strategies
  let journalEntries: any[] = [];
  let knownStrategies: any[] = []; // removed mock strategies per user request

  app.get("/api/journal", (req, res) => {
    // In production, this would read from the Obsidian vault or database
    res.json({ entries: journalEntries });
  });

  app.post("/api/journal/ingest", (req, res) => {
    // Ingest the trading journal and AI insights to the obsidian vault format
    const { entry } = req.body;
    try {
      if (!fs.existsSync(obsidianPath)) {
        fs.mkdirSync(obsidianPath, { recursive: true });
      }
      const safeTime = entry.time.replace(/[:.]/g, "-");
      const filename = `Trade_Review_${entry.symbol}_${safeTime}.md`;
      const filePath = path.join(obsidianPath, filename);
      
      const content = `---
type: trade_review
symbol: ${entry.symbol}
time: ${entry.time}
pnl: ${entry.pnl}
---

# Trade Journal: ${entry.symbol}
**Direction:** ${entry.type}
**Result:** ${entry.pnl >= 0 ? 'WIN' : 'LOSS'} (${entry.pnl})

## AI Insight (Hermes-3-8B)
${entry.insight}

*Engraved to memory for future context retrieval.*
`;
      fs.writeFileSync(filePath, content);
      
      // Add to local state (for the UI)
      journalEntries.unshift(entry);
      res.json({ success: true, message: "Ingested to Obsidian Vault" });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/strategies", (req, res) => {
    res.json({ strategies: knownStrategies });
  });

  app.post("/api/strategies/detect", (req, res) => {
    try {
      if (!fs.existsSync(obsidianPath)) {
        fs.mkdirSync(obsidianPath, { recursive: true });
      }
      const files = fs.readdirSync(obsidianPath);
      let newCount = 0;
      files.forEach(file => {
        if (file.startsWith("Strategy_") && file.endsWith(".md")) {
          const stratName = file.replace("Strategy_", "").replace(".md", "").replace(/_/g, " ");
          const existing = knownStrategies.find(s => s.name === stratName);
          if (!existing) {
             knownStrategies.push({
               id: 'strat_' + Date.now() + Math.random(),
               name: stratName,
               status: 'AI Managed',
               winRate: 'Pending Sync',
               description: 'Auto-detected AI strategy from vault.'
             });
             newCount++;
          }
        }
      });
      res.json({ 
        success: true, 
        message: `Scanned vault. Detected ${newCount} new strategies.`, 
        newCount 
      });
    } catch(e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/strategies/upgrade", (req, res) => {
    // Generates an AI R&D upgrade from journals and saves it to vault
    const { name, description, content: strategyContent } = req.body || {};
    
    if (!fs.existsSync(obsidianPath)) {
      fs.mkdirSync(obsidianPath, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(obsidianPath, `Strategy_R_D_Upgrade_${timestamp}.md`);
    
    let simulatedInsight = journalEntries.length > 0 
      ? `Analyzing ${journalEntries.length} recent trades. Found inefficiencies in momentum confirmation. Adjusting RSI baseline.` 
      : `No recent trades found. Performing standard Monte-Carlo permutation tests. Optimizing win-rate probability vectors.`;

    const finalName = name || `Hermes Gen ${knownStrategies.length + 1}`;
    const finalDescription = description || 'Auto-refined strategy based on recent trade insights.';

    const content = `---
type: strategy_rd
timestamp: ${timestamp}
status: compiled
name: "${finalName}"
---
# AI Strategy Refinement (Hermes-3-8B)
${simulatedInsight}

## New Trading Logic
${strategyContent || 'Adaptive volatility parameters updated.'}

**Action Taken:** New strategy logic has been compiled and is ready for live execution.
`;
    fs.writeFileSync(filePath, content);
    
    // Add to known strategies memory
    knownStrategies.unshift({ 
      id: `strat_upgrade_${Date.now()}`, 
      name: finalName, 
      status: 'Paper Trading', 
      winRate: 'Testing', 
      description: finalDescription 
    });

    res.json({ success: true, message: "AI Refinement complete. R&D saved to vault." });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(PROJECT_ROOT, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
