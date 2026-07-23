"""Shared helpers for constellation functional tests."""
import os
import subprocess

WORKSPACE_DIR = os.environ.get(
    "WORKSPACE_DIR",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
)
REPO_DIR = os.path.join(WORKSPACE_DIR, "constellation")


def run_cmd(*args, timeout=600):
    """Run a command in the repo directory and return the CompletedProcess."""
    return subprocess.run(
        args,
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
