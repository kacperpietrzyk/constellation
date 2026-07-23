"""Functional test: ESLint with zero-warning policy.

Runs `npm run lint:code` (eslint . --max-warnings=0) and verifies no errors or warnings.
This validates that the tsconfig.base.json cleanup does not break
type-aware ESLint rules.
"""

import os
import subprocess
import pytest

WORKSPACE_DIR = os.environ.get(
    "WORKSPACE_DIR",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
)
REPO_DIR = os.path.join(WORKSPACE_DIR, "constellation")


def run_cmd(*args, timeout=300):
    """Helper to run a command in the repo directory."""
    result = subprocess.run(
        args,
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result


class TestLint:
    """npm run lint:code -- ESLint with zero warnings."""

    def test_eslint_zero_warnings(self):
        """ESLint must pass with zero errors and zero warnings."""
        result = run_cmd("npm", "run", "lint:code")
        assert result.returncode == 0, (
            f"npm run lint:code failed with exit code {result.returncode}.\n"
            f"stdout (last 2000 chars): {result.stdout[-2000:]}\n"
            f"stderr (last 2000 chars): {result.stderr[-2000:]}"
        )
