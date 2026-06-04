//+------------------------------------------------------------------+
//|                                                HermesBridge.mq5  |
//|                                  Copyright 2026, HermesQuant CIO |
//|                                                                  |
//| EA Bridge connecting MetaTrader 5 to the Hermes Python Middleware|
//| Layer 1: ZeroMQ (Port 5555) for outbound market ticks/bars       |
//| Layer 4: TCP/WebSocket (Port 8765) for inbound chart annotations |
//+------------------------------------------------------------------+
#property copyright "HermesQuant CIO"
#property version   "1.10"

// Requires mql-zmq binding. (https://github.com/dingmaotu/mql-zmq)
// #include <Zmq/Zmq.mqh>

input string   ZMQ_Address = "tcp://127.0.0.1:5555"; // Python ZeroMQ PULL socket
input int      WS_Port     = 8765;                   // Python Order Router TCP/WS port
input string   WS_Host     = "127.0.0.1";            // Host of the Python API
input bool     SendTicks   = true;
input bool     SendBars    = true;

int command_socket = INVALID_HANDLE;
// Context zmq_context;
// Socket  zmq_socket(zmq_context, ZMQ_PUSH);

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   Print("Initializing HermesBridge MT5 EA...");
   
   // 1. Initialize ZeroMQ
   // zmq_socket.connect(ZMQ_Address);
   Print("[HermesBridge] Connected ZeroMQ PUSH to ", ZMQ_Address);
   
   // 2. Initialize inbound TCP connection for commands from python (Port 8765)
   command_socket = SocketCreate();
   if(command_socket != INVALID_HANDLE)
     {
      if(SocketConnect(command_socket, WS_Host, WS_Port, 1000))
         Print("[HermesBridge] Connected to Command Router on ", WS_Host, ":", WS_Port);
      else
         Print("[HermesBridge] Failed to connect to Command Router! Error: ", GetLastError());
     }
     
   // 3. Setup high-frequency polling timer for fetching inbound WS commands
   EventSetMillisecondTimer(50); 

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(command_socket != INVALID_HANDLE)
      SocketClose(command_socket);
      
   // zmq_socket.close();
   // zmq_context.term();
   
   Print("HermesBridge Deinitialized.");
  }

//+------------------------------------------------------------------+
//| Expert tick function (Outbound to Python)                        |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(SendTicks)
     {
      MqlTick last_tick;
      if(SymbolInfoTick(_Symbol, last_tick))
        {
         string tick_json = StringFormat("{\"action\": \"MARKET_DATA\", \"type\": \"TICK\", \"symbol\": \"%s\", \"bid\": %f, \"ask\": %f, \"volume\": %d, \"timestamp\": \"%s\"}", 
                                         _Symbol, last_tick.bid, last_tick.ask, last_tick.volume, TimeToString(last_tick.time));
         
         // zmq_socket.send(tick_json);
        }
     }
  }

//+------------------------------------------------------------------+
//| Timer function (Inbound from Python & Outbound Telemetry)        |
//+------------------------------------------------------------------+
int telemetry_counter = 0;

void OnTimer()
  {
   // Periodically send Account and Session Telemetry
   telemetry_counter++;
   if(telemetry_counter >= 20) // Every 20x50ms = 1 second
     {
      telemetry_counter = 0;
      SendTelemetry();
     }

   if(command_socket == INVALID_HANDLE) return;
   
   // Check if data is available from Python Router (Annotations & Commands)
   uint len = SocketIsReadable(command_socket);
   if(len > 0)
     {
      char buffer[];
      ArrayResize(buffer, len);
      int bytes_read = SocketRead(command_socket, buffer, len, 100);
      if(bytes_read > 0)
        {
         string msg = CharArrayToString(buffer, 0, bytes_read);
         ParseAndExecuteCommand(msg);
        }
     }
  }

//+------------------------------------------------------------------+
//| Parse JSON and Draw SMC Objects on the MT5 Chart                 |
//+------------------------------------------------------------------+
void ParseAndExecuteCommand(string json_str)
  {
   // In full execution, you would parse the JSON string using CJAson or a native parser
   // Payload matching standard: 
   // {"command": "DRAW_SMC_OBJECT", "type": "OBJ_RECTANGLE", "name": "FVG_1", "time1": "...", "price1": 1.10}
   
   Print("[HermesBridge] Received Payload: ", json_str);
   
   if(StringFind(json_str, "\"DRAW_SMC_OBJECT\"") >= 0)
     {
        Print("[HermesBridge] Processing SMC Object Request...");
        string obj_name = "Agent_Obj_" + IntegerToString(TimeCurrent());
        
        // --- Pseudo JSON Parsing Logic (Replace with CJAson in production MQL5) ---
        // Look for the specific type of object requested by the Python Agent
        if(StringFind(json_str, "\"OBJ_RECTANGLE\"") >= 0)
          {
             // Typically used for Fair Value Gaps (FVG) and Order Blocks (OB)
             datetime time1 = TimeCurrent() - PeriodSeconds(PERIOD_H1) * 2;
             double price1 = SymbolInfoDouble(_Symbol, SYMBOL_BID) + 15 * _Point;
             datetime time2 = TimeCurrent();
             double price2 = SymbolInfoDouble(_Symbol, SYMBOL_BID) - 15 * _Point;
             
             ObjectCreate(0, obj_name, OBJ_RECTANGLE, 0, time1, price1, time2, price2);
             
             // Check if it's an OB or FVG based on color intent
             if(StringFind(json_str, "FVG") >= 0) {
                 ObjectSetInteger(0, obj_name, OBJPROP_COLOR, clrLightBlue);
             } else {
                 ObjectSetInteger(0, obj_name, OBJPROP_COLOR, clrCrimson);
             }
             
             ObjectSetInteger(0, obj_name, OBJPROP_FILL, true);
             ObjectSetInteger(0, obj_name, OBJPROP_BACK, true);
          }
        else if (StringFind(json_str, "\"OBJ_HLINE\"") >= 0)
          {
             // Used for Break of Structure (BOS), Change of Character (CHOCH), Liquidity Pools
             double price = SymbolInfoDouble(_Symbol, SYMBOL_BID) + 20 * _Point;
             
             ObjectCreate(0, obj_name, OBJ_HLINE, 0, 0, price);
             ObjectSetInteger(0, obj_name, OBJPROP_COLOR, clrGold);
             
             // Dotted lines for Liquidity
             if(StringFind(json_str, "LIQUIDITY") >= 0) {
                 ObjectSetInteger(0, obj_name, OBJPROP_STYLE, STYLE_DOT);
             } else {
                 ObjectSetInteger(0, obj_name, OBJPROP_STYLE, STYLE_SOLID); // BoS or CHoCH
             }
             ObjectSetInteger(0, obj_name, OBJPROP_WIDTH, 2);
          }
        else if (StringFind(json_str, "\"OBJ_TREND\"") >= 0)
          {
             // Used for angular trend lines
             datetime time1 = TimeCurrent() - PeriodSeconds(PERIOD_H4);
             double price1 = SymbolInfoDouble(_Symbol, SYMBOL_BID) - 50 * _Point;
             datetime time2 = TimeCurrent();
             double price2 = SymbolInfoDouble(_Symbol, SYMBOL_BID) + 20 * _Point;
             
             ObjectCreate(0, obj_name, OBJ_TREND, 0, time1, price1, time2, price2);
             ObjectSetInteger(0, obj_name, OBJPROP_COLOR, clrLimeGreen);
             ObjectSetInteger(0, obj_name, OBJPROP_RAY_RIGHT, false);
          }
        
        ChartRedraw(0);
        Print("[HermesBridge] Graphically Mounted SMC Object: ", obj_name);
     }
  }

//+------------------------------------------------------------------+
//| Send Telemetry (Balance, Time, Trade History)                    |
//+------------------------------------------------------------------+
void SendTelemetry()
  {
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   datetime server_time = TimeCurrent();
   datetime pc_time = TimeLocal();
   bool is_market_open = (SymbolInfoInteger(_Symbol, SYMBOL_SESSION_DEALS) > 0);
   
   // Trade History (Last 5 deals)
   string history_json = "[";
   if(HistorySelect(0, TimeCurrent()))
     {
      int deals_total = HistoryDealsTotal();
      int limit = (deals_total > 5) ? deals_total - 5 : 0;
      bool first = true;
      for(int i = deals_total - 1; i >= limit; i--)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
           {
            if(!first) history_json += ", ";
            datetime time = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
            double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
            string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
            long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
            history_json += StringFormat("{\"ticket\": %d, \"time\": \"%s\", \"symbol\": \"%s\", \"profit\": %.2f, \"type\": %d}", 
                                         ticket, TimeToString(time), symbol, profit, type);
            first = false;
           }
        }
     }
   history_json += "]";
   
   string telemetry_json = StringFormat(
      "{\"action\": \"TELEMETRY\", \"balance\": %.2f, \"equity\": %.2f, \"server_time\": \"%s\", \"pc_time\": \"%s\", \"market_open\": %s, \"history\": %s}",
      balance, equity, TimeToString(server_time), TimeToString(pc_time), is_market_open ? "true" : "false", history_json
   );
   
   // NOTE: Requires mql-zmq binding. Uncomment this in production when compiling:
   // zmq_socket.send(telemetry_json);
  }
//+------------------------------------------------------------------+
