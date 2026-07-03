import sys
import unittest
from unittest.mock import patch, MagicMock
import subprocess

sys.path.insert(0, ".")
from computeshare_agent.docker_runner import (
    resolve_allocation,
    is_viable,
    build_command,
    cleanup_leftover_containers,
    DetachedContainerProcess,
    remove_volume,
    cleanup_leftover_volumes
)


MOCK_RESOURCES = {
    "cpu": {"total_cores": 8, "free_cores": 6.0, "usable_cores": 5.0},
    "ram": {"total_gb": 16.0, "available_gb": 10.0, "usable_gb": 8.5},
    "gpu": None,
    "disk": {"free_gb": 100.0},
}

MOCK_JOB = {
    "job_id": "test_001",
    "type": "ml_notebook",
    "github_repo": "https://github.com/user/repo",
    "notebook_path": "train.ipynb",
    "cpu_request": 4,
    "ram_request_gb": 6,
    "gpu_required": False,
    "timeout_seconds": 300,
}


class TestDockerRunner(unittest.TestCase):

    def test_allocation_respects_request(self):
        alloc = resolve_allocation(MOCK_JOB, MOCK_RESOURCES)
        # Should not exceed what was requested
        self.assertLessEqual(alloc["cpu"], MOCK_JOB["cpu_request"])
        self.assertLessEqual(alloc["ram_gb"], MOCK_JOB["ram_request_gb"])

    def test_allocation_capped_by_machine(self):
        hungry_job = {**MOCK_JOB, "cpu_request": 100, "ram_request_gb": 100}
        alloc = resolve_allocation(hungry_job, MOCK_RESOURCES)
        # Should never exceed usable
        self.assertLessEqual(alloc["cpu"], MOCK_RESOURCES["cpu"]["usable_cores"])
        self.assertLessEqual(alloc["ram_gb"], MOCK_RESOURCES["ram"]["usable_gb"])

    def test_no_gpu_allocated_when_none_available(self):
        gpu_job = {**MOCK_JOB, "gpu_required": True, "gpu_vram_mb": 4096}
        alloc = resolve_allocation(gpu_job, MOCK_RESOURCES)
        self.assertIsNone(alloc["gpu"])

    def test_viable_job_passes(self):
        alloc = resolve_allocation(MOCK_JOB, MOCK_RESOURCES)
        viable, reason = is_viable(alloc, MOCK_JOB)
        self.assertTrue(viable)
        self.assertIsNone(reason)

    def test_gpu_required_but_absent_is_not_viable(self):
        gpu_job = {**MOCK_JOB, "gpu_required": True}
        alloc = resolve_allocation(gpu_job, MOCK_RESOURCES)
        viable, reason = is_viable(alloc, gpu_job)
        self.assertFalse(viable)
        self.assertIn("GPU", reason)

    def test_build_command_contains_limits(self):
        alloc = resolve_allocation(MOCK_JOB, MOCK_RESOURCES)
        cmd, container_name = build_command(MOCK_JOB, "/workspaces/test_001", alloc)
        cmd_str = " ".join(cmd)
        self.assertIn("--cpus=", cmd_str)
        self.assertIn("--memory=", cmd_str)
        self.assertIn("--network none", cmd_str)
        self.assertIn("--gpus", cmd_str) if alloc["gpu"] else None

    def test_container_name_contains_job_id(self):
        alloc = resolve_allocation(MOCK_JOB, MOCK_RESOURCES)
        _, container_name = build_command(MOCK_JOB, "/tmp/ws", alloc)
        self.assertIn("test_001", container_name)

    @patch("subprocess.run")
    def test_cleanup_leftover_containers(self, mock_run):
        # Setup mock_run.return_value for listing containers
        mock_list_res = MagicMock()
        mock_list_res.returncode = 0
        mock_list_res.stdout = "gridnode_job_1\ngridnode_job_2\nother_container\n"
        
        # We want to mock calls inside cleanup
        mock_run.side_effect = [mock_list_res, MagicMock(returncode=0), MagicMock(returncode=0)]
        
        cleanup_leftover_containers()
        
        # It should list containers, then call rm -f twice
        self.assertEqual(mock_run.call_count, 3)
        mock_run.assert_any_call(
            ["docker", "ps", "-a", "--filter", "name=gridnode_job_", "--format", "{{.Names}}"],
            capture_output=True,
            text=True
        )
        mock_run.assert_any_call(["docker", "rm", "-f", "gridnode_job_1"], capture_output=True)
        mock_run.assert_any_call(["docker", "rm", "-f", "gridnode_job_2"], capture_output=True)

    @patch("computeshare_agent.docker_runner.stop_container")
    def test_detached_container_process_properties_and_reaping(self, mock_stop_container):
        mock_log = MagicMock()
        mock_wait = MagicMock()
        
        proc = DetachedContainerProcess(mock_log, mock_wait, "gridnode_job_test")
        
        # Test returncode property
        self.assertIsNone(proc.returncode)
        
        # Test poll container terminates
        mock_wait.poll.return_value = 0
        mock_wait.communicate.return_value = ("0\n", "")
        
        exit_code = proc.poll()
        self.assertEqual(exit_code, 0)
        self.assertEqual(proc.returncode, 0)
        
        # verify reaping
        mock_log.wait.assert_called_once_with(timeout=1)
        mock_stop_container.assert_called_once_with("gridnode_job_test")

    @patch("computeshare_agent.docker_runner.stop_container")
    def test_detached_container_process_wait_timeout_propagation(self, mock_stop_container):
        mock_log = MagicMock()
        mock_wait = MagicMock()
        
        # wait_process communicate raises TimeoutExpired
        mock_wait.communicate.side_effect = subprocess.TimeoutExpired(cmd="docker wait", timeout=5)
        
        proc = DetachedContainerProcess(mock_log, mock_wait, "gridnode_job_test")
        
        with self.assertRaises(subprocess.TimeoutExpired):
            proc.wait(timeout=5)
            
        # Verify stop_container is NOT called when timeout expires
        mock_stop_container.assert_not_called()

    @patch("computeshare_agent.docker_runner.stop_container")
    def test_detached_container_process_terminate_kill(self, mock_stop_container):
        mock_log = MagicMock()
        mock_wait = MagicMock()
        
        proc = DetachedContainerProcess(mock_log, mock_wait, "gridnode_job_test")
        
        proc.terminate()
        mock_stop_container.assert_called_once_with("gridnode_job_test")
        mock_log.terminate.assert_called_once()
        mock_wait.terminate.assert_called_once()
        
        mock_stop_container.reset_mock()
        mock_log.kill.reset_mock()
        mock_wait.kill.reset_mock()
        
        proc.kill()
        mock_stop_container.assert_called_once_with("gridnode_job_test")
        mock_log.kill.assert_called_once()
        mock_wait.kill.assert_called_once()

    @patch("subprocess.run")
    def test_remove_volume_calls_docker_rm_when_name_provided(self, mock_run):
        remove_volume("deps_test")
        mock_run.assert_called_once_with(["docker", "volume", "rm", "deps_test"], capture_output=True)

    @patch("subprocess.run")
    def test_remove_volume_does_nothing_when_name_empty(self, mock_run):
        remove_volume(None)
        mock_run.assert_not_called()
        remove_volume("")
        mock_run.assert_not_called()

    @patch("subprocess.run")
    def test_cleanup_leftover_volumes_removes_matching_volumes(self, mock_run):
        mock_list_res = MagicMock()
        mock_list_res.returncode = 0
        mock_list_res.stdout = "deps_1\ndeps_2\n"
        
        mock_run.side_effect = [mock_list_res, MagicMock(returncode=0), MagicMock(returncode=0)]
        cleanup_leftover_volumes()
        
        self.assertEqual(mock_run.call_count, 3)
        mock_run.assert_any_call(
            ["docker", "volume", "ls", "-q", "--filter", "name=deps_"],
            capture_output=True, text=True
        )
        mock_run.assert_any_call(["docker", "volume", "rm", "deps_1"], capture_output=True)
        mock_run.assert_any_call(["docker", "volume", "rm", "deps_2"], capture_output=True)


if __name__ == "__main__":
    unittest.main()