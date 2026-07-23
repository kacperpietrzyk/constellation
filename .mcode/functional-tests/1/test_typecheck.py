"""Functional test: TypeScript type-checking across all 11 packages.

Runs `npx tsc -b --pretty false` and verifies zero errors.
This validates that removing esModuleInterop and useUnknownInCatchVariables
from tsconfig.base.json does not break type-checking.
"""

import os
import subprocess
import pytest

WORKSPACE_DIR = os.environ.get(
    "WORKSPACE_DIR",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
)
REPO_DIR = os.path.join(WORKSPACE_DIR, "constellation")

# All 11 packages that must compile
EXPECTED_PACKAGES = [
    "contracts",
    "domain",
    "application",
    "testkit",
    "local-store",
    "realtime-documents",
    "mcp",
    "hub",
    "desktop-preload",
    "desktop-main",
    "desktop-ui",
]


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


class TestTypecheck:
    """npx tsc -b --pretty false -- zero errors across all 11 packages."""

    def test_typecheck_zero_errors(self):
        """TypeScript type-checking must produce zero errors."""
        result = run_cmd("npx", "tsc", "-b", "--pretty", "false")
        assert result.returncode == 0, (
            f"tsc -b failed with exit code {result.returncode}.\n"
            f"stdout: {result.stdout[:2000]}\n"
            f"stderr: {result.stderr[:2000]}"
        )
        # Verify no error output (tsc prints errors to stdout with --pretty false)
        error_lines = [
            line for line in result.stdout.strip().splitlines()
            if line.strip() and "error TS" in line
        ]
        assert len(error_lines) == 0, (
            f"Found {len(error_lines)} TypeScript errors:\n"
            + "\n".join(error_lines[:20])
        )

    def test_all_packages_have_dist(self):
        """All 11 packages must have dist/ output after typecheck."""
        missing = []
        for pkg in EXPECTED_PACKAGES:
            dist_path = os.path.join(REPO_DIR, "packages", pkg, "dist")
            build_path = os.path.join(REPO_DIR, "packages", pkg, "build")
            if not os.path.isdir(dist_path) and not os.path.isdir(build_path):
                missing.append(pkg)
        assert len(missing) == 0, (
            f"Missing build output for packages: {', '.join(missing)}"
        )
