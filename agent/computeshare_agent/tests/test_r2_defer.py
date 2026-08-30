import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, ".")
from computeshare_agent.agent import execute_job

class TestR2Defer(unittest.TestCase):
    @patch("computeshare_agent.agent.report_status")
    @patch("computeshare_agent.resources.snapshot")
    @patch("computeshare_agent.docker_runner.resolve_allocation")
    @patch("computeshare_agent.docker_runner.is_viable")
    def test_execute_job_deferred_reports_queued(
        self, mock_is_viable, mock_resolve_allocation, mock_snapshot, mock_report_status
    ):
        # 1. Setup mock returns: the job is not viable
        mock_snapshot.return_value = {
            "cpu": {"usable_cores": 1},
            "ram": {"usable_gb": 1.0}
        }
        mock_resolve_allocation.return_value = {
            "cpu": 1.0,
            "ram_gb": 1.0,
            "gpu": None
        }
        mock_is_viable.return_value = (False, "Insufficient memory")

        # 2. Mock job data
        job = {
            "job_id": "test_job_r2_defer",
            "type": "data_processing",
            "github_repo": "https://github.com/test/repo",
            "notebook_path": "test.ipynb",
            "cpu_request": 2.0,  # Request exceeds usable
            "ram_request_gb": 2.0,
            "gpu_required": False,
            "dataset_url": None,
            "timeout_seconds": 60
        }

        # 3. Call execute_job which should trigger deferral
        execute_job(job)

        # 4. Verify that report_status was called with "queued" status, NOT "deferred"
        mock_report_status.assert_called_once_with(
            "test_job_r2_defer", "queued", reason="Insufficient memory"
        )
        print("Verification PASSED: report_status called with status='queued'")

if __name__ == "__main__":
    unittest.main()
