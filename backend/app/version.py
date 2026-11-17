"""Resolve the deployed revision shown in the footer."""

from __future__ import annotations

import os
import subprocess
from functools import lru_cache

FALLBACK_VERSION = "v1.0.0-dev"

# Render exposes the commit being deployed. Reading it is free, whereas
# shelling out to git on every cold start is not.
_ENV_KEYS = ("RENDER_GIT_COMMIT", "GIT_COMMIT", "SOURCE_VERSION", "COMMIT_SHA")


def _run_git(*args: str) -> str:
    try:
        return subprocess.check_output(
            ("git", *args),
            stderr=subprocess.DEVNULL,
            timeout=2,
        ).decode("utf-8", "replace").strip()
    except (OSError, subprocess.SubprocessError):
        return ""


@lru_cache(maxsize=1)
def get_version() -> str:
    for key in _ENV_KEYS:
        commit = os.environ.get(key, "").strip()
        if commit:
            return f"rev-{commit[:7]}"

    tag = _run_git("describe", "--tags", "--always")
    if tag:
        return tag

    commit = _run_git("rev-parse", "--short", "HEAD")
    return f"rev-{commit}" if commit else FALLBACK_VERSION
