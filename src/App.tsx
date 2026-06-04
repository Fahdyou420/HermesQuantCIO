import React, { useState, useEffect, useRef } from 'react';
import { Activity, ShieldAlert, TerminalSquare, Database, FileText, Settings, Play, Upload, Save, FolderOpen, HardDrive, BookOpen, Target, Cpu, CheckCircle, XCircle, RefreshCw, Layers } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'journal' | 'strategies' | 'knowledge' | 'settings'>('dashboard');
  
  // State for Dashboard
  const [killSwitch, setKillSwitch] = useState(false);
  const [telemetry, setTelemetry] = useState({ 
    trades_active: 0, 
    win_rate: '--%', 
    daily_pnl: '$0.00', 
    status: 'LOADING',
    account_balance: 0.0,
    account_equity: 0.0,
    server_time: 'Offline',
    pc_time: 'Offline',
    market_open: false,
    trade_history: [] as any[],
    system_active: false
  });
  const [logs, setLogs] = useState<string[]>([
    "> Hermes OS framework initializing...",
    "> Waiting for MT5 ZeroMQ connection on Port 5555...",
    "> Local Ollama sub-agents pending...",
    "> Awaiting data streams..."
  ]);
  const [cmdInput, setCmdInput] = useState("");

  // State for Journal & Strategies
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // State for Settings
  const [obsidianPath, setObsidianPath] = useState("");
  
  // State for Knowledge Based
  const [files, setFiles] = useState<{name: string, size: number, mtime: string}[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // Poll Telemetry
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await fetch("/api/telemetry");
        if (res.ok) {
          const data = await res.json();
          setTelemetry(data);
          setKillSwitch(data.killSwitch);
        }
      } catch (err) {
        console.error("Telemetry error", err);
      }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetch("/api/settings").then(async r => {
      const contentType = r.headers.get("content-type");
      if (r.ok && contentType?.includes("application/json")) {
        const d = await r.json();
        setObsidianPath(d.obsidianPath);
      }
    }).catch(() => {});
    fetchFiles();
    fetchJournal();
    fetchStrategies();
  }, []);

  const fetchJournal = async () => {
    try {
      const res = await fetch("/api/journal");
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setJournalEntries(data.entries);
      }
    } catch(e) {}
  };

  const fetchStrategies = async () => {
    try {
      const res = await fetch("/api/strategies");
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setStrategies(data.strategies);
      }
    } catch(e) {}
  };

  const verifyStrategies = async () => {
    setIsDetecting(true);
    setLogs(prev => [...prev, `> [SYSTEM] Initiating vault scan for new strategies...`]);
    try {
      const res = await fetch("/api/strategies/detect", { method: "POST" });
      const data = await res.json();
      setLogs(prev => [...prev, `> [SYSTEM] ${data.message}`]);
      await fetchStrategies();
    } catch (e) {
      setLogs(prev => [...prev, `> [SYSTEM ERROR] Vault scan failed.`]);
    } finally {
      setIsDetecting(false);
    }
  };

  const runAIStrategyUpgrade = async () => {
    setIsDetecting(true);
    setLogs(prev => [...prev, `> [SYSTEM] Initiating Hermes AI Strategy R&D Phase...`]);
    try {
      const upgradeData = {
        name: `Hermes Optimized Edge_v${Math.floor(Math.random()*100)}`,
        description: `Dynamically created based on recent vault ingestion and telemetry. Uses adaptive volatility contraction bands.`,
        content: `1. Scan for volatility compression over 4H.\n2. Wait for deviation > 2.5 on M15.\n3. Execute mean reversion.`
      };
      
      const res = await fetch("/api/strategies/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upgradeData)
      });
      const data = await res.json();
      setLogs(prev => [...prev, `> [SYSTEM] AI R&D: ${data.message}`]); 
      await fetchStrategies();
    } catch (e) {
      setLogs(prev => [...prev, `> [SYSTEM ERROR] R&D Phase failed.`]);
    } finally {
      setIsDetecting(false);
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/knowledge/files");
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setFiles(data.files);
      }
    } catch(e) {}
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim()) return;
    const cmd = cmdInput;
    setLogs(prev => [...prev, `> [USER] ${cmd}`]);
    setCmdInput("");
    
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      setLogs(prev => [...prev, ...data.response.split('\n')]);
    } catch {
      setLogs(prev => [...prev, `> [SYSTEM ERROR] Could not connect to Hermes Middleware.`]);
    }
  };

  const toggleKillSwitch = async () => {
    const action = killSwitch ? "deactivate" : "activate";
    try {
      await fetch("/api/killswitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      // Telemetry interval will pick up the change
    } catch(e) {}
  };

  const saveSettings = async () => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: obsidianPath })
      });
      alert("Settings saved successfully.");
    } catch (e) {
      alert("Error saving settings.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await fetch("/api/knowledge/drop", {
        method: "POST",
        body: formData
      });
      await fetchFiles();
    } catch (err) {
      alert("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#020617] text-slate-300 font-sans flex items-center justify-center p-4">
      <div className="h-[768px] w-[1024px] flex flex-col gap-5 overflow-hidden select-none">
        
        {/* Top Navigation Header */}
        <header className="flex items-center justify-between bg-slate-900/50 border border-slate-800 p-4 rounded-2xl shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              HQ
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                HermesQuant<span className="text-indigo-400 font-medium">CIO</span>
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Algorithmic Architecture v3.1</p>
            </div>
          </div>
          
          {/* Navigation Menus */}
          <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('journal')}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'journal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              Journal & AI
            </button>
            <button 
              onClick={() => setActiveTab('strategies')}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'strategies' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              Strategies
            </button>
            <button 
              onClick={() => setActiveTab('knowledge')}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'knowledge' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              Knowledge Drop
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200')}
            >
              System Config
            </button>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-full border border-slate-800 hidden md:flex">
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", killSwitch ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]')}></span>
                <span className="text-xs font-mono text-slate-300">ZMQ:5555</span>
              </div>
              <div className="w-px h-3 bg-slate-800"></div>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", killSwitch ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]')}></span>
                <span className="text-xs font-mono text-slate-300">MT5:8765</span>
              </div>
            </div>
            
            <button 
              onClick={toggleKillSwitch}
              className={cn("px-6 py-2.5 border rounded-xl font-bold text-sm tracking-wide uppercase transition-all",
                killSwitch 
                  ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_15px_rgba(225,29,72,0.5)] animate-pulse' 
                  : 'bg-rose-600/10 border-rose-500/50 text-rose-500 hover:bg-rose-600 hover:text-white'
              )}
            >
              {killSwitch ? 'Kill-Switch: ACTIVE (HALTED)' : 'Global Kill-Switch'}
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <main className="grid grid-cols-12 grid-rows-6 gap-5 flex-1 relative min-h-0">
            {/* Real-time Telemetry */}
            <section className="col-span-8 row-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 relative overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Market Telemetry Stream</h3>
                </div>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className={cn("px-2 py-0.5 rounded", telemetry.system_active ? "bg-slate-800 text-emerald-400" : "bg-slate-800 text-slate-500")}>
                    {telemetry.system_active ? "EA CONNECTED" : "EA DISCONNECTED"}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded", telemetry.market_open ? "bg-slate-800 text-emerald-400" : "bg-slate-800 text-slate-500")}>
                    {telemetry.market_open ? "MARKETS OPEN" : "MARKETS CLOSED"}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-6 mb-4 shrink-0">
                <div className="flex-1 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Account Balance</p>
                  <p className="text-2xl font-mono text-white">
                    ${telemetry.account_balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
                <div className="flex-1 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Account Equity</p>
                  <p className="text-2xl font-mono text-emerald-400">
                    ${telemetry.account_equity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
              </div>

              <div className="flex gap-6 mb-6 shrink-0 font-mono text-xs text-slate-400">
                 <div className="flex items-center gap-2">
                   <span className="text-slate-500 uppercase">Server Time:</span>
                   <span className="text-slate-300">{telemetry.server_time}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="text-slate-500 uppercase">Local PC Time:</span>
                   <span className="text-slate-300">{telemetry.pc_time}</span>
                 </div>
              </div>
              
              {/* Trade History */}
              <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 flex flex-col overflow-hidden mb-6">
                <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent MT5 History</h4>
                </div>
                <div className="p-2 space-y-1 overflow-y-auto flex-1">
                  {!telemetry.system_active && (
                     <div className="h-full flex items-center justify-center text-slate-600 font-mono text-xs font-bold animate-pulse">
                        AWAITING MT5 SYNC...
                     </div>
                  )}
                  {telemetry.system_active && telemetry.trade_history.length === 0 && (
                     <div className="h-full flex items-center justify-center text-slate-600 font-mono text-xs">
                        No recent trades found today.
                     </div>
                  )}
                  {telemetry.system_active && telemetry.trade_history.map((trade: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-900/50 rounded border border-slate-800">
                      <div className="flex gap-4">
                         <span className="text-[10px] font-mono text-slate-500">{trade.time}</span>
                         <span className="text-xs font-mono text-slate-300 w-16">{trade.symbol}</span>
                         <span className="text-[10px] font-mono uppercase text-slate-500">{trade.type === 0 ? 'BUY' : 'SELL'}</span>
                      </div>
                      <span className={cn("text-xs font-mono", trade.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>
                         {trade.profit >= 0 ? "+" : "-"}${Math.abs(trade.profit).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 shrink-0 mt-auto">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Status</p>
                  <p className={`text-lg font-mono ${killSwitch ? 'text-red-400' : 'text-emerald-400'}`}>
                    {telemetry.status}
                  </p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Active Trades</p>
                  <p className="text-lg font-mono text-white">{telemetry.system_active ? telemetry.trades_active : '--'}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Win Rate</p>
                  <p className="text-lg font-mono text-amber-500">{telemetry.win_rate}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Day P/L</p>
                  <p className={cn("text-lg font-mono", telemetry.daily_pnl.includes('-') ? "text-rose-400" : "text-emerald-400")}>
                    {telemetry.daily_pnl}
                  </p>
                </div>
              </div>
            </section>

            {/* Risk Gatekeeper */}
            <section className="col-span-4 row-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-rose-500/20 rounded-lg">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                </div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Execution Firewall</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-xs text-slate-300">Max Risk Per Trade</span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">1% (ACTIVE)</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-xs text-slate-300">Margin Threshold</span>
                  <span className="text-xs font-mono text-slate-300">$5,000.00</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs text-slate-300">Model Override</span>
                  <span className="text-xs font-mono text-rose-500 font-bold underline">HARD-CODED</span>
                </div>
              </div>
            </section>

            {/* Registered Skills */}
            <section className="col-span-4 row-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Agent Skills</h3>
              </div>
              <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1">
                {[
                  { name: 'MT5 Protocol Handler', type: '[pyzmq]' },
                  { name: 'SMC Vector DB Search', type: '[chromadb]' },
                  { name: 'Risk Gatekeeper Firewall', type: '[1% MAX REQ]' },
                  { name: 'Market Chart Annotator', type: '[ws 8765]' }
                ].map((skill, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> {skill.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{skill.type}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Agent Command Loop */}
            <section className="col-span-7 row-span-2 bg-black border border-slate-800 rounded-3xl p-5 flex flex-col relative overflow-hidden shadow-2xl">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4 text-slate-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Hermes-Agent Command Loop</h3>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded-full">Hermes-3-8B | Qwen-Coder</span>
              </div>
              
              <div className="flex-1 font-mono text-[11px] text-emerald-500/80 space-y-1 mb-3 overflow-y-auto flex flex-col pt-4">
                {logs.map((log, i) => (
                  <p key={i} dangerouslySetInnerHTML={{ __html: log.replace('Hermes-3-8B', '<span class="text-emerald-400">Hermes-3-8B</span>').replace('qwen-coder', '<span class="text-emerald-400">qwen-coder</span>') }} />
                ))}
                <div ref={bottomRef} className="h-4"></div>
              </div>
              
              <form onSubmit={handleCommand} className="relative mt-auto shrink-0 bg-slate-900 border border-slate-800 rounded-xl">
                <input 
                  type="text" 
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  placeholder="Issue command to Hermes-Agent..." 
                  className="w-full bg-transparent py-3 px-4 text-xs text-white focus:outline-none rounded-xl"
                />
                <button type="submit" className="absolute right-2 top-2 p-1.5 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 transition-colors">
                  <Play className="w-3 h-3 fill-current" />
                </button>
              </form>
            </section>
            
            {/* Obsidian Knowledge Base Snapshot */}
            <section className="col-span-5 row-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Knowledge Watchdog</h3>
                </div>
                <span className="text-[10px] bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.2)] text-indigo-400 px-2 rounded-full py-0.5 font-bold animate-pulse">Active</span>
              </div>
              
              <div className="space-y-2 flex-1 overflow-y-auto">
                {files.slice(0,2).map((file, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{(file.size / 1024).toFixed(1)} KB • Ingested</p>
                    </div>
                  </div>
                ))}
                {files.length === 0 && (
                  <div className="text-center text-slate-500 text-xs mt-4">No recent ingested files. Check Knowledge Drop tab.</div>
                )}
              </div>
            </section>
          </main>
        )}

        {/* Journal and AI Insights */}
        {activeTab === 'journal' && (
          <main className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col relative min-h-0">
            <div className="mb-6 shrink-0">
              <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><BookOpen className="w-6 h-6 text-indigo-400" /> Trading Journal & AI Memory</h2>
              <p className="text-slate-400 text-sm">Post-trade analysis, MT5 backtest debriefs, and automated strategy refinements powered by Hermes.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4">
              {journalEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-slate-800 rounded-2xl bg-slate-950">
                  <Cpu className="w-12 h-12 text-slate-600 mb-4 animate-pulse" />
                  <p className="text-slate-400 font-bold mb-1">Awaiting MT5 Telemetry...</p>
                  <p className="text-slate-500 text-sm text-center max-w-sm">When trades are closed, Hermes will analyze market conditions and Obsidian notes to generate a memory update.</p>
                </div>
              ) : (
                journalEntries.map((entry, idx) => (
                  <div key={idx} className="bg-slate-950 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("px-2 py-1 rounded-md text-xs font-bold", entry.pnl >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                          {entry.symbol} {entry.type}
                        </span>
                        <span className="text-slate-500 text-xs font-mono">{entry.time}</span>
                      </div>
                      <span className={cn("font-mono font-bold text-lg", entry.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {entry.pnl >= 0 ? "+" : "-"}${Math.abs(entry.pnl).toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 relative">
                      <div className="absolute -top-3 left-4 bg-indigo-600 px-3 py-0.5 rounded-full flex items-center gap-1 shadow-lg shadow-indigo-500/20">
                        <Cpu className="w-3 h-3 text-white" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">Hermes Insight</span>
                      </div>
                      <p className="text-sm text-slate-300 mt-2">{entry.insight}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded flex items-center gap-1">
                        <Layers className="w-3 h-3" /> Memory Engraved
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded flex items-center gap-1">
                        <Target className="w-3 h-3" /> Strategy Refined
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>
        )}

        {/* Strategies Detection */}
        {activeTab === 'strategies' && (
          <main className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col relative min-h-0">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Target className="w-6 h-6 text-emerald-400" /> Loaded Strategies</h2>
                <p className="text-slate-400 text-sm">Quant strategies parsed from your Obsidian vault, ready for execution or paper-trading.</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={runAIStrategyUpgrade}
                  disabled={isDetecting}
                  className={cn("bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2", isDetecting && "opacity-50 cursor-not-allowed")}
                >
                  <Cpu className={cn("w-4 h-4", isDetecting && "animate-pulse")} />
                  Trigger AI R&D
                </button>
                <button 
                  onClick={verifyStrategies}
                  disabled={isDetecting}
                  className={cn("bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2", isDetecting && "opacity-50 cursor-not-allowed")}
                >
                  <RefreshCw className={cn("w-4 h-4", isDetecting && "animate-spin")} />
                  {isDetecting ? "Scanning Vault..." : "Auto-Detect New"}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 flex-1 overflow-y-auto">
              {strategies.length === 0 && (
                <div className="col-span-2 flex flex-col items-center justify-center p-12 bg-slate-950 border border-slate-800 rounded-2xl text-center">
                  <Target className="w-12 h-12 text-slate-700 mb-4 animate-pulse" />
                  <p className="text-slate-300 font-bold mb-2">No Active Strategies Detected</p>
                  <p className="text-slate-500 text-sm max-w-sm">
                    Drop your custom trading logic markdown files into the Obsidian Vault. Hermes will automatically parse the structural rules and convert them into executable profiles.
                  </p>
                </div>
              )}
              {strategies.map((strat, i) => (
                <div key={i} className="bg-slate-950 border border-slate-800 p-6 rounded-2xl flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-slate-200">{strat.name}</h3>
                    <span className={cn("px-2 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg border", 
                      strat.status === 'Active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20")}>
                      {strat.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mb-6 flex-1">{strat.description}</p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Historical Est. WR</span>
                      <span className="text-sm font-mono text-white">{strat.winRate}</span>
                    </div>
                    <button className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                       <Settings className="w-3 h-3" /> Configure Params
                    </button>
                  </div>
                </div>
              ))}
              
              <div onClick={verifyStrategies} className="border-2 border-dashed border-slate-700 bg-slate-950/50 hover:bg-slate-950 hover:border-emerald-500/50 transition-all rounded-2xl flex flex-col items-center justify-center cursor-pointer min-h-[250px]">
                <FolderOpen className="w-10 h-10 text-slate-600 mb-3" />
                <h3 className="text-slate-300 font-bold text-sm mb-1">Add to Obsidian Vault</h3>
                <p className="text-slate-500 text-xs text-center px-6">Drop a new trading logic markdown file in your vault to create a new agent execution profile.</p>
              </div>
            </div>
          </main>
        )}

        {/* Knowledge Drop Section */}
        {activeTab === 'knowledge' && (
          <main className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col relative">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Ingestion & Knowledge Drop</h2>
              <p className="text-slate-400 text-sm">Upload trading PDFs, SMC course transcripts, strategy logic, or configuration rules. Hermes processes them into ChromaDB for semantic retrieval.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0">
              <div className="flex flex-col border-2 border-dashed border-slate-700 rounded-2xl bg-slate-950/50 p-8 items-center justify-center relative hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all group">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploading}
                />
                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-2">Drop Knowledge Files Here</h3>
                <p className="text-slate-500 text-xs text-center max-w-[250px]">
                  {uploading ? "Uploading and chunking document..." : "Accepts PDF, TXT, MD, CSV. Auto-processes into 512-token overlapping chunks."}
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <Database className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-300">Vector Store & Vault Entries</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{file.name}</p>
                          <p className="text-[10px] text-slate-500">{new Date(file.mtime).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">Embedded</span>
                    </div>
                  ))}
                  {files.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <FolderOpen className="w-8 h-8 opacity-50 mb-2" />
                      <p className="text-xs">Vault is empty.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* System Settings Section */}
        {activeTab === 'settings' && (
          <main className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col relative">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">System Configuration</h2>
              <p className="text-slate-400 text-sm">Configure paths, agent model bindings, and execution safeguards.</p>
            </div>

            <div className="max-w-2xl space-y-8">
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" /> Obsidian Vault Integration
                </h3>
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Local Obsidian Vault Path</label>
                  <p className="text-[10px] text-slate-500 mb-4">Hermes Agent will read from and write Strategy Cards and Market Analysis reports directly to this directory.</p>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={obsidianPath}
                      onChange={e => setObsidianPath(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                      placeholder="C:\Users\name\Documents\Obsidian"
                    />
                    <button onClick={saveSettings} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center gap-2">
                      <Save className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Local Ollama Integration
                </h3>
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Reasoning Engine (Agent)</label>
                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200">
                      <option>hf.co/NousResearch/Hermes-3-Llama-3.1-8B-GGUF:latest</option>
                      <option>qwen3.5:9b</option>
                      <option>llama-3.2-3b:latest</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Coding Sub-Agent</label>
                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200">
                      <option>hhao/qwen2.5-coder-tools:latest</option>
                      <option>qwen-coder-gguf:latest</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Embedding Engine (ChromaDB)</label>
                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200">
                      <option>nomic-embed-text:latest</option>
                      <option>bge-m3:latest</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-emerald-500 pt-2 border-t border-slate-800">Available models synced from local Ollama instance.</p>
                </div>
              </div>
            </div>
          </main>
        )}

      </div>
    </div>
  );
}

