import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, ".")
from computeshare_agent.agent import execute_job

class TestClass6R2(unittest.TestCase):
    @patch("computeshare_agent.agent.resources.snapshot")
    @patch("computeshare_agent.agent.docker_runner.resolve_allocation")
    @patch("computeshare_agent.agent.docker_runner.is_viable")
    @patch("computeshare_agent.agent.report_status")
    def test_execute_job_queued_on_non_viable(self, mock_report_status, mock_is_viable, mock_resolve_allocation, mock_snapshot):
        # Setup mocks
        mock_snapshot.return_value = {
            "cpu": {"usable_cores": 1},
            "ram": {"usable_gb": 2},
            "disk": {"free_gb": 10}
        }
        mock_resolve_allocation.return_value = {"cpu": 1, "ram_gb": 2, "gpu": None}
        mock_is_viable.return_value = (False, "Insufficient CPU/RAM on host")

        job = {
            "job_id": "test_job_r2_defer",
            "type": "ml_notebook",
            "github_repo": "dummy",
            "notebook_path": "dummy",
            "cpu_request": 2,
            "ram_request_gb": 4,
            "gpu_required": False,
            "dataset_url": None,
            "timeout_seconds": 100
        }

        # Run execute_job
        execute_job(job)

        # Assert report_status is called with "queued"
        mock_report_status.assert_called_once_with(
            "test_job_r2_defer",
            "queued",
            reason="Insufficient CPU/RAM on host"
        )
        print("R2 Python Test Case PASSED: Agent reported 'queued' status correctly on resource non-viability!")

if __name__ == "__main__":
    unittest.main()
