import threading
import subprocess

def run_zmq():
    subprocess.run(["python", "zmq_bridge.py"])

def run_ingestor():
    subprocess.run(["python", "knowledge_ingestor.py"])

def run_ws():
    subprocess.run(["python", "order_router.py"])

if __name__ == "__main__":
    print("Initializing Middleware Processes...")
    t1 = threading.Thread(target=run_zmq)
    t2 = threading.Thread(target=run_ingestor)
    t3 = threading.Thread(target=run_ws)
    
    t1.start()
    t2.start()
    t3.start()
    
    t1.join()
    t2.join()
    t3.join()
