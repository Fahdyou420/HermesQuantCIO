import os
import time
import logging
import uuid
import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

try:
    import chromadb
except ImportError:
    chromadb = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Knowledge_Ingestor")

VAULT_DIR = "/workspace/vault"
INGEST_DIR = os.path.join(VAULT_DIR, "Ingested_Sources")
MARKET_MEMORY_DIR = os.path.join(VAULT_DIR, "Market_Memory")

os.makedirs(INGEST_DIR, exist_ok=True)
os.makedirs(MARKET_MEMORY_DIR, exist_ok=True)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")

class PDFHandler(FileSystemEventHandler):
    def __init__(self):
        if chromadb:
            try:
                self.chroma_client = chromadb.HttpClient(host=os.environ.get("CHROMADB_HOST", "chroma-db"), port=8000)
                self.collection = self.chroma_client.get_or_create_collection(name="quant_knowledge")
            except Exception as e:
                logger.error(f"Failed to connect to ChromaDB: {e}")
                self.collection = None
        else:
            self.collection = None

    def on_created(self, event):
        if event.is_directory:
            return
        logger.info(f"New file detected: {event.src_path}")
        self.process_file(event.src_path)
        
    def process_file(self, filepath):
        try:
            time.sleep(2) # wait for copy to finish
            
            content = ""
            if filepath.endswith(".txt") or filepath.endswith(".md"):
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
            elif filepath.endswith(".pdf"):
                try:
                    import PyPDF2
                    with open(filepath, 'rb') as f:
                        reader = PyPDF2.PdfReader(f)
                        for page in reader.pages:
                            text = page.extract_text()
                            if text:
                                content += text + "\n"
                except Exception as e:
                    logger.error(f"PyPDF2 error: {e}")
                    return
            
            if not content.strip():
                logger.warning(f"File {filepath} is empty.")
                return
                
            chunks = [content[i:i+1000] for i in range(0, len(content), 1000)]
            
            if self.collection:
                for i, chunk in enumerate(chunks):
                    # Route embedding task through Ollama locally
                    try:
                        emb_resp = requests.post(f"{OLLAMA_BASE_URL}/api/embeddings", json={
                            "model": "nomic-embed-text",
                            "prompt": chunk
                        }, timeout=30)
                        if emb_resp.status_code == 200:
                            embedding = emb_resp.json().get('embedding')
                            self.collection.add(
                                embeddings=[embedding],
                                documents=[chunk],
                                metadatas=[{"source": filepath, "chunk": i}],
                                ids=[f"{uuid.uuid4()}"]
                            )
                    except Exception as e:
                        logger.error(f"Embedding request failed: {e}")
            
            # Save summary note to Obsidian Vault
            summary_name = os.path.basename(filepath) + "_summary.md"
            summary_path = os.path.join(MARKET_MEMORY_DIR, summary_name)
            
            # Generate summary via LLM
            try:
                sum_resp = requests.post(f"{OLLAMA_BASE_URL}/api/generate", json={
                    "model": "llama-3.2-3b",
                    "prompt": f"Summarize the following quantitative finance research text briefly:\n\n{content[:2000]}",
                    "stream": False
                }, timeout=60)
                
                if sum_resp.status_code == 200:
                    summary_text = sum_resp.json().get("response", "Could not generate summary.")
                    with open(summary_path, 'w', encoding='utf-8') as f:
                        f.write(f"---\nsource: {filepath}\ningested: {time.time()}\n---\n\n# Summary\n{summary_text}")
                    logger.info(f"Saved summary to {summary_path}")
            except Exception as e:
                logger.error(f"Summarization request failed: {e}")
                
        except Exception as e:
            logger.error(f"Error processing {filepath}: {e}")

def run_ingestor():
    event_handler = PDFHandler()
    observer = Observer()
    observer.schedule(event_handler, path=INGEST_DIR, recursive=False)
    observer.start()
    logger.info(f"Watching {INGEST_DIR} for new knowledge sources...")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    run_ingestor()
