"""Functional test: Full test suite execution.

Runs `npm run test:scripts` and `node scripts/run-tests.mjs` to verify
the full test suite passes after the tsconfig.base.json cleanup.
The test script does clean+build internally so build artifacts must exist first.
"""

import os
import subprocess
import pytest

WORKSPACE_DIR = os.environ.get(
    "WORKSPACE_DIR",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
)
REPO_DIR = os.path.join(WORKSPACE_DIR, "constellation")


def run_cmd(*args, timeout=600):
    """Helper to run a command in the repo directory."""
    result = subprocess.run(
        args,
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result


class TestScripts:
    """npm run test:scripts -- license audit + build tooling verification."""

    def test_script_tests_pass(self):
        """Script tests (license audit, build tooling) must pass."""
        result = run_cmd("npm", "run", "test:scripts")
        assert result.returncode == 0, (
            f"npm run test:scripts failed with exit code {result.returncode}.\n"
            f"stdout (last 2000 chars): {result.stdout[-2000:]}\n"
            f"stderr (last 2000 chars): {result.stderr[-2000:]}"
        )


class TestUnitIntegration:
    """node scripts/run-tests.mjs -- all ~70 test files."""

    def test_full_test_suite_passes(self):
        """All unit/integration tests must pass via Node built-in test runner."""
        result = run_cmd("node", "scripts/run-tests.mjs", timeout=600)
        assert result.returncode == 0, (
            f"Test suite failed with exit code {result.returncode}.\n"
            f"stdout (last 2000 chars): {result.stdout[-2000:]}\n"
            f"stderr (last 2000 chars): {result.stderr[-2000:]}"
        )
