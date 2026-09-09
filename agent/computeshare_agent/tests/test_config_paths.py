"""
State-root resolution. The agent used to derive this from __file__, so the
location silently changed with the packaging method (repo / site-packages /
PyInstaller temp dir). These pin the precedence down.
"""

import json
import os
import stat
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, ".")
from computeshare_agent import config


class TestStateRoot(unittest.TestCase):
    def test_explicit_home_wins(self):
        with patch.dict(os.environ, {
            "COMPUTESHARE_HOME": "/opt/explicit",
            "STATE_DIRECTORY": "/var/lib/computeshare",
        }):
            self.assertEqual(config.state_root(), "/opt/explicit")

    def test_systemd_state_directory_is_used_when_no_explicit_home(self):
        with patch.dict(os.environ, {"STATE_DIRECTORY": "/var/lib/computeshare"}):
            os.environ.pop("COMPUTESHARE_HOME", None)
            self.assertEqual(config.state_root(), "/var/lib/computeshare")

    def test_systemd_state_directory_list_takes_first_entry(self):
        with patch.dict(os.environ, {"STATE_DIRECTORY": "/var/lib/computeshare:/var/lib/other"}):
            os.environ.pop("COMPUTESHARE_HOME", None)
            self.assertEqual(config.state_root(), "/var/lib/computeshare")

    def test_falls_back_to_home_directory(self):
        with patch.dict(os.environ, {}):
            os.environ.pop("COMPUTESHARE_HOME", None)
            os.environ.pop("STATE_DIRECTORY", None)
            self.assertEqual(
                config.state_root(), os.path.expanduser("~/.computeshare")
            )

    def test_root_is_never_a_temp_extraction_dir(self):
        # Regression: the old __file__-derived root resolved to /tmp inside a
        # PyInstaller one-file binary, putting the agent token in /tmp.
        with patch.dict(os.environ, {}):
            os.environ.pop("COMPUTESHARE_HOME", None)
            os.environ.pop("STATE_DIRECTORY", None)
            self.assertNotEqual(config.state_root().rstrip("/"), "/tmp")


class TestWorkspaceRoot(unittest.TestCase):
    def test_defaults_under_the_state_root(self):
        with patch.dict(os.environ, {"COMPUTESHARE_HOME": "/opt/explicit"}):
            os.environ.pop("COMPUTESHARE_WORKSPACE_ROOT", None)
            self.assertEqual(config.workspace_root(), "/opt/explicit/workspaces")

    def test_explicit_override_is_honoured(self):
        with patch.dict(os.environ, {
            "COMPUTESHARE_HOME": "/opt/explicit",
            "COMPUTESHARE_WORKSPACE_ROOT": "/mnt/big-disk/work",
        }):
            self.assertEqual(config.workspace_root(), "/mnt/big-disk/work")


class TestConfigFile(unittest.TestCase):
    def test_token_is_written_private(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, "state")
            with patch.dict(os.environ, {"COMPUTESHARE_HOME": root}):
                config.save({"machine_id": "m1", "agent_token": "secret", "backend_url": "u"})

                path = config.config_file()
                mode = stat.S_IMODE(os.stat(path).st_mode)
                self.assertEqual(mode, 0o600, f"config is {oct(mode)}, expected 0600")

                self.assertEqual(json.load(open(path))["agent_token"], "secret")
                self.assertEqual(config.load()["machine_id"], "m1")

                config.clear()
                self.assertIsNone(config.load())


class TestBackendDefaults(unittest.TestCase):
    def test_default_is_the_real_backend_not_the_mock(self):
        with patch.dict(os.environ, {}):
            os.environ.pop("COMPUTESHARE_BACKEND_URL", None)
            # 8000 is tests/mock_backend.py; the real backend listens on 3005.
            self.assertEqual(config.backend_url(), "http://localhost:3005")

    def test_environment_overrides_the_default(self):
        with patch.dict(os.environ, {"COMPUTESHARE_BACKEND_URL": "https://grid.example.com"}):
            self.assertEqual(config.backend_url(), "https://grid.example.com")


if __name__ == "__main__":
    unittest.main()
