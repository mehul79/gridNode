import sys
import unittest
from unittest.mock import patch, MagicMock
import requests

sys.path.insert(0, ".")
from computeshare_agent.log_streamer import LogStreamer
from computeshare_agent.agent import report_status

class TestLogStreamerRobustness(unittest.TestCase):
    def setUp(self):
        self.job_id = "test_job_123"
        self.backend_url = "http://localhost:8000"
        self.headers = {"Authorization": "Bearer test"}
        self.streamer = LogStreamer(self.job_id, self.backend_url, self.headers)

    @patch("requests.post")
    def test_flush_success(self, mock_post):
        # Setup mock post response to be successful
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # Populate buffer
        self.streamer._buffer = [{"line": "log 1", "ts": 123}, {"line": "log 2", "ts": 124}]

        # Flush should run successfully
        self.streamer._flush()

        # Assert post was called correctly
        mock_post.assert_called_once_with(
            f"{self.backend_url}/api/jobs/{self.job_id}/logs",
            json={"lines": [{"line": "log 1", "ts": 123}, {"line": "log 2", "ts": 124}]},
            headers=self.headers,
            timeout=5
        )
        mock_response.raise_for_status.assert_called_once()
        # Buffer should now be empty
        self.assertEqual(len(self.streamer._buffer), 0)

    @patch("requests.post")
    def test_flush_failure_retains_logs(self, mock_post):
        # Setup mock post response to raise an exception
        mock_post.side_effect = requests.exceptions.ConnectionError("Connection refused")

        self.streamer._buffer = [{"line": "log 1", "ts": 123}, {"line": "log 2", "ts": 124}]

        # Flush should log warning but NOT discard buffer
        self.streamer._flush()

        # Buffer should still have the log lines
        self.assertEqual(len(self.streamer._buffer), 2)
        self.assertEqual(self.streamer._buffer[0]["line"], "log 1")

    @patch("requests.post")
    def test_flush_http_error_retains_logs(self, mock_post):
        # Setup mock post response to return HTTP 500 and raise HTTPError
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("Internal Server Error")
        mock_post.return_value = mock_response

        self.streamer._buffer = [{"line": "log 1", "ts": 123}]

        # Flush should log warning but NOT discard buffer
        self.streamer._flush()

        mock_response.raise_for_status.assert_called_once()
        self.assertEqual(len(self.streamer._buffer), 1)

    @patch("requests.post")
    def test_flush_concurrency_preserves_new_appends(self, mock_post):
        # We want to test that if a new item is appended while requests.post is executing,
        # it is not deleted when the slice happens.
        mock_response = MagicMock()
        mock_post.return_value = mock_response

        self.streamer._buffer = [{"line": "log 1", "ts": 123}]

        # We simulate the append happening during the post call
        def side_effect(*args, **kwargs):
            self.streamer._buffer.append({"line": "log 2", "ts": 124})
            return mock_response

        mock_post.side_effect = side_effect

        self.streamer._flush()

        # The first log should be gone, but the second one should remain
        self.assertEqual(len(self.streamer._buffer), 1)
        self.assertEqual(self.streamer._buffer[0]["line"], "log 2")

    @patch("requests.post")
    def test_log_streamer_buffer_cap(self, mock_post):
        # We fill the buffer to 10000 items
        self.streamer._buffer = [{"line": f"log {i}", "ts": 123} for i in range(10000)]
        
        # Mock process stdout
        mock_proc = MagicMock()
        mock_proc.stdout.readline.side_effect = ["new log\n", ""]
        
        self.streamer._read_loop(mock_proc)
        
        # Buffer length should still be 10000
        self.assertEqual(len(self.streamer._buffer), 10000)
        # Oldest log (log 0) should be popped, and new log appended at the end
        self.assertEqual(self.streamer._buffer[0]["line"], "log 1")
        self.assertEqual(self.streamer._buffer[-1]["line"], "new log")

    @patch("requests.post")
    def test_log_streamer_stop_loop_flush(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response
        
        # Populate buffer with 120 items (requires 3 flushes of max 50)
        self.streamer._buffer = [{"line": f"log {i}", "ts": 123} for i in range(120)]
        
        # Join should return immediately because mock threads aren't running
        self.streamer.stop()
        
        # All items should be flushed
        self.assertEqual(len(self.streamer._buffer), 0)
        # mock_post should be called 3 times
        self.assertEqual(mock_post.call_count, 3)

    @patch("requests.post")
    def test_log_streamer_stop_loop_flush_stops_on_failure(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("Connection refused")
        
        # Populate buffer
        self.streamer._buffer = [{"line": "log 1", "ts": 123}]
        
        # stop() should attempt to flush once, fail, and break
        self.streamer.stop()
        
        # Buffer should still have the log
        self.assertEqual(len(self.streamer._buffer), 1)
        mock_post.assert_called_once()

    @patch("requests.post")
    def test_log_streamer_stop_loop_flush_more_than_100_batches(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response
        
        # 105 batches of 50 = 5250 items
        self.streamer._buffer = [{"line": f"log {i}", "ts": 123} for i in range(5250)]
        
        self.streamer.stop()
        
        # All items should be flushed
        self.assertEqual(len(self.streamer._buffer), 0)
        # mock_post should be called 105 times (which is > 100)
        self.assertEqual(mock_post.call_count, 105)


class TestAgentReportStatus(unittest.TestCase):
    @patch("requests.patch")
    @patch("computeshare_agent.agent.headers")
    @patch("computeshare_agent.agent.BACKEND_URL", "http://localhost:8000")
    def test_report_status_success(self, mock_headers, mock_patch):
        mock_headers.return_value = {"Authorization": "Bearer test"}
        mock_response = MagicMock()
        mock_patch.return_value = mock_response

        report_status("job_123", "running", reason="Running step", allocation={"cpu": 1.0})

        mock_patch.assert_called_once_with(
            "http://localhost:8000/api/jobs/job_123/status",
            json={"status": "running", "reason": "Running step", "actual_allocation": {"cpu": 1.0}},
            headers={"Authorization": "Bearer test"},
            timeout=5
        )
        mock_response.raise_for_status.assert_called_once()

    @patch("requests.patch")
    @patch("computeshare_agent.agent.headers")
    @patch("computeshare_agent.agent.BACKEND_URL", "http://localhost:8000")
    @patch("builtins.print")
    def test_report_status_http_error(self, mock_print, mock_headers, mock_patch):
        mock_headers.return_value = {"Authorization": "Bearer test"}
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("400 Bad Request")
        mock_patch.return_value = mock_response

        # report_status catches the exception internally, so it should not raise but should call raise_for_status
        try:
            report_status("job_123", "running")
        except Exception as e:
            self.fail(f"report_status raised an exception: {e}")

        mock_response.raise_for_status.assert_called_once()
        mock_print.assert_called_once()
        args, kwargs = mock_print.call_args
        self.assertIn("Status report failed", args[0])


if __name__ == "__main__":
    unittest.main()
