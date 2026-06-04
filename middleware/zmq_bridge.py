import zmq
import json
import logging
import threading
import time
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ZMQ_Bridge")

BIND_ADDR = os.environ.get("ZMQ_BIND_ADDR", "tcp://0.0.0.0:5555")

def process_message(message):
    try:
        data = json.loads(message)
        logger.info(f"Received MT5 data: {data.get('type', 'unknown')}")
        # Logic to route data to the agent memory map
    except json.JSONDecodeError:
        logger.error("Failed to parse JSON from ZMQ")
    except Exception as e:
        logger.error(f"Error processing message: {e}")

def run_zmq_server():
    context = zmq.Context()
    socket = context.socket(zmq.PULL)
    socket.bind(BIND_ADDR)
    logger.info(f"ZMQ Bridge listening on {BIND_ADDR}")

    while True:
        try:
            message = socket.recv_string()
            threading.Thread(target=process_message, args=(message,), daemon=True).start()
        except zmq.ZMQError as e:
            logger.error(f"ZMQ Error: {e}")
            time.sleep(1)
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    run_zmq_server()
