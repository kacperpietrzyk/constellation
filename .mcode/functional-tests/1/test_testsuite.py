"""Functional test: Full test suite execution.

Runs `npm run test:scripts` and `node scripts/run-tests.mjs` to verify
the full test suite passes after the tsconfig.base.json cleanup.
The test script does clean+build internally so build artifacts must exist first.
"""

from conftest import run_cmd


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
