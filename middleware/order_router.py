import asyncio
import websockets
import json
import logging
from risk_gatekeeper import RiskGatekeeper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Order_Router_&_Chart_Annotator")

connected_clients = set()
risk_mgr = RiskGatekeeper()

async def broadcast_annotation(command, obj_type, name, time1, price1, time2, price2, color, fill):
    """
    Translates agent geometric intentions into direct MT5 terminal visual artifacts via JSON.
    """
    payload = {
        "command": command, # e.g. "DRAW_SMC_OBJECT"
        "type": obj_type,   # e.g. "OBJ_RECTANGLE"
        "name": str(name),
        "time1": str(time1),
        "price1": float(price1),
        "time2": str(time2),
        "price2": float(price2),
        "color": str(color),
        "fill": bool(fill)
    }
    
    if connected_clients:
        message = json.dumps(payload)
        await asyncio.gather(*[client.send(message) for client in connected_clients])
        logger.info(f"Broadcasted annotation payload: {name}")
    else:
        logger.warning("No MT5 clients connected to receive annotation payload.")

async def handle_client(websocket, path):
    connected_clients.add(websocket)
    logger.info(f"New MT5 EA Client connected. Active streams: {len(connected_clients)}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                logger.info(f"Received JSON payload from MT5: {data}")
                
                # Mock example of intercepting a trade execution request and gating it
                if data.get('action') == "TRADE_SIGNAL":
                    valid, reason = risk_mgr.validate_trade(data.get('signal', {}), data.get('account', {}))
                    response = json.dumps({"receipt": "TRADE_ACK", "approved": valid, "reason": reason})
                    await websocket.send(response)
                    
            except json.JSONDecodeError:
                logger.error("Critical parse error: Invalid JSON received from socket")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)
        logger.info("MT5 EA Client stream severed.")

async def start_server():
    async with websockets.serve(handle_client, "0.0.0.0", 8765):
        logger.info("Order Router WebSocket Broadcast Server online at ws://0.0.0.0:8765")
        await asyncio.Future()

def run_ws():
    asyncio.run(start_server())

if __name__ == "__main__":
    run_ws()
