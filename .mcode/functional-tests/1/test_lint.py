"""Functional test: ESLint with zero-warning policy.

Runs `npm run lint:code` (eslint . --max-warnings=0) and verifies no errors or warnings.
This validates that the tsconfig.base.json cleanup does not break
type-aware ESLint rules.
"""

from conftest import run_cmd


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
