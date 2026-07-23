"""Functional test: Full build pipeline (tsc -b + 3 Vite bundles).

Runs `npm run build` and verifies successful completion.
This validates that the tsconfig.base.json cleanup does not break
the full build pipeline including Vite bundles.
"""

import os
import subprocess

WORKSPACE_DIR = os.environ.get(
    "WORKSPACE_DIR",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
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


class TestBuild:
    """npm run build -- tsc -b + Vite bundles."""

    def test_full_build_succeeds(self):
        """npm run build must complete with exit code 0."""
        result = run_cmd("npm", "run", "build")
        assert result.returncode == 0, (
            f"npm run build failed with exit code {result.returncode}.\n"
            f"stdout (last 2000 chars): {result.stdout[-2000:]}\n"
            f"stderr (last 2000 chars): {result.stderr[-2000:]}"
        )

    def test_mcp_bundle_exists(self):
        """MCP Vite SSR bundle must be produced."""
        bundle_dir = os.path.join(REPO_DIR, "packages", "mcp", "dist")
        assert os.path.isdir(bundle_dir), "MCP bundle output directory missing"
        # Check for the entry file
        files = os.listdir(bundle_dir)
        assert len(files) > 0, "MCP bundle output directory is empty"

    def test_desktop_preload_bundle_exists(self):
        """Desktop preload Vite CJS bundle must be produced."""
        bundle_dir = os.path.join(REPO_DIR, "packages", "desktop-preload", "dist")
        assert os.path.isdir(bundle_dir), "Desktop preload bundle output directory missing"

    def test_desktop_ui_bundle_exists(self):
        """Desktop UI Vite React bundle must be produced."""
        bundle_dir = os.path.join(REPO_DIR, "packages", "desktop-ui", "dist")
        assert os.path.isdir(bundle_dir), "Desktop UI bundle output directory missing"
