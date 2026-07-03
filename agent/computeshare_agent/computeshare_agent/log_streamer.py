# Reads stdout from the running container line by line and forwards each line to the backend API in real time.

import time
import threading
import requests


FLUSH_INTERVAL_SECONDS = 0.5   # batch lines every 500ms instead of per-line
MAX_BATCH_SIZE = 50             # never send more than 50 lines per request


class LogStreamer:
    def __init__(self, job_id, backend_url, headers):
        self.job_id      = job_id
        self.backend_url = backend_url
        self.headers     = headers
        self._buffer     = []
        self._lock       = threading.Lock()
        self._stop_event = threading.Event()
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)

    def start(self, process):
        self._read_thread = threading.Thread(target=self._read_loop, args=(process,), daemon=True)
        self._read_thread.start()
        self._flush_thread.start()

    def _read_loop(self, process):
        for raw_line in iter(process.stdout.readline, ""):
            if self._stop_event.is_set():
                break
            line = raw_line.rstrip()
            if not line:
                continue
            entry = {"line": line, "ts": time.time()}
            with self._lock:
                if len(self._buffer) >= 10000:
                    self._buffer.pop(0)
                self._buffer.append(entry)

    def stop(self):
        self._stop_event.set()
        if hasattr(self, "_read_thread") and self._read_thread.is_alive():
            self._read_thread.join(timeout=10)
        if self._flush_thread.is_alive():
            self._flush_thread.join(timeout=10)
        
        while True:
            with self._lock:
                if not self._buffer:
                    break
            success = self._flush()
            if not success:
                break

    def _flush_loop(self):
        while not self._stop_event.is_set():
            time.sleep(FLUSH_INTERVAL_SECONDS)
            self._flush()

    def _flush(self):
        with self._lock:
            if not self._buffer:
                return True
            batch = self._buffer[:MAX_BATCH_SIZE]

        try:
            resp = requests.post(
                f"{self.backend_url}/api/jobs/{self.job_id}/logs",
                json={"lines": batch},
                headers=self.headers,
                timeout=5
            )
            resp.raise_for_status()
            with self._lock:
                self._buffer = self._buffer[len(batch):]
            return True
        except Exception as e:
            print(f"  [WARN] Log flush failed: {e}")
            return False