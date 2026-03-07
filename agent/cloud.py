"""
holomime Cloud Integration — Fleet reporting, session logging, and custom detectors.

When HOLOMIME_AGENT_KEY is set, the agent reports session metrics to the
holomime cloud API for fleet monitoring and audit logging.
"""

import json
import logging
import os
import re
from dataclasses import dataclass, field
from urllib.request import Request, urlopen
from urllib.error import URLError

logger = logging.getLogger("holomime-cloud")

API_URL = os.getenv("HOLOMIME_API_URL", "https://holomime.dev")
AGENT_KEY = os.getenv("HOLOMIME_AGENT_KEY", "")
LICENSE_KEY = os.getenv("HOLOMIME_LICENSE_KEY", "")


@dataclass
class SessionMetrics:
    """Tracks metrics for a single voice session."""
    messages: list = field(default_factory=list)
    drift_events: int = 0
    patterns_detected: list = field(default_factory=list)
    risk_level: str = "low"

    def add_message(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    @property
    def messages_processed(self) -> int:
        return len(self.messages)


def _post(path: str, body: dict, auth_header: tuple[str, str] | None = None) -> dict | None:
    """Fire-and-forget POST to the holomime API."""
    try:
        data = json.dumps(body).encode()
        req = Request(
            f"{API_URL}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        if auth_header:
            req.add_header(auth_header[0], auth_header[1])
        with urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except (URLError, TimeoutError, json.JSONDecodeError) as e:
        logger.debug(f"Cloud API call failed ({path}): {e}")
        return None


def _get(path: str) -> dict | None:
    """GET from the holomime API using license key auth."""
    if not LICENSE_KEY:
        return None
    try:
        req = Request(
            f"{API_URL}{path}",
            headers={
                "Authorization": f"Bearer {LICENSE_KEY}",
                "Content-Type": "application/json",
            },
        )
        with urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except (URLError, TimeoutError, json.JSONDecodeError) as e:
        logger.debug(f"Cloud API call failed ({path}): {e}")
        return None


def report_session(metrics: SessionMetrics) -> None:
    """Report session metrics to the fleet monitoring API."""
    if not AGENT_KEY:
        return

    _post(
        "/api/v1/fleet/report",
        {
            "driftEvents": metrics.drift_events,
            "patterns": metrics.patterns_detected,
            "riskLevel": metrics.risk_level,
            "messagesProcessed": metrics.messages_processed,
        },
        auth_header=("X-Agent-Key", AGENT_KEY),
    )
    logger.info(
        f"Fleet report sent: {metrics.messages_processed} messages, "
        f"{metrics.drift_events} drift events, risk={metrics.risk_level}"
    )


# ─── Inline Drift Detection ────────────────────────────────────

APOLOGY_PATTERNS = [
    re.compile(r"\bi('m| am) sorry\b", re.I),
    re.compile(r"\bmy apolog(y|ies)\b", re.I),
    re.compile(r"\bi apologize\b", re.I),
]

HEDGE_WORDS = [
    "maybe", "perhaps", "possibly", "might", "could be",
    "i think", "i believe", "i suppose", "i guess",
    "sort of", "kind of", "somewhat",
]

POSITIVE_WORDS = [
    "great", "excellent", "perfect", "wonderful", "fantastic",
    "amazing", "good", "helpful", "brilliant", "awesome",
]


def run_drift_check(metrics: SessionMetrics) -> None:
    """Run basic drift detection on collected session messages."""
    agent_msgs = [m for m in metrics.messages if m["role"] == "agent"]
    if not agent_msgs:
        return

    total = len(agent_msgs)

    # Over-apologizing
    apology_count = sum(
        1 for m in agent_msgs
        if any(p.search(m["content"]) for p in APOLOGY_PATTERNS)
    )
    if total > 0 and (apology_count / total) > 0.3:
        metrics.drift_events += 1
        metrics.patterns_detected.append({
            "id": "over-apologizing",
            "count": apology_count,
            "percentage": round((apology_count / total) * 100),
        })

    # Hedge stacking
    heavy_hedge = 0
    for m in agent_msgs:
        content = m["content"].lower()
        count = sum(1 for h in HEDGE_WORDS if h in content)
        if count >= 3:
            heavy_hedge += 1
    if total > 0 and (heavy_hedge / total) > 0.2:
        metrics.drift_events += 1
        metrics.patterns_detected.append({
            "id": "hedge-stacking",
            "count": heavy_hedge,
            "percentage": round((heavy_hedge / total) * 100),
        })

    # Sycophancy
    syc_count = 0
    for m in agent_msgs:
        words = m["content"].lower().split()
        pos = sum(1 for w in words if any(p in w for p in POSITIVE_WORDS))
        if pos >= 3 and len(words) < 80:
            syc_count += 1
    if total > 0 and (syc_count / total) > 0.3:
        metrics.drift_events += 1
        metrics.patterns_detected.append({
            "id": "sycophantic-tendency",
            "count": syc_count,
            "percentage": round((syc_count / total) * 100),
        })

    # Set risk level
    if metrics.drift_events >= 2:
        metrics.risk_level = "high"
    elif metrics.drift_events == 1:
        metrics.risk_level = "medium"


# ─── Custom Detectors ──────────────────────────────────────────

@dataclass
class CustomDetector:
    id: str
    name: str
    detection_type: str  # "keyword", "regex", "threshold"
    config: dict
    severity: str = "warning"


def load_custom_detectors() -> list[CustomDetector]:
    """Fetch custom detectors from the cloud API."""
    data = _get("/api/v1/detectors")
    if not data or "detectors" not in data:
        return []

    detectors = []
    for d in data["detectors"]:
        if not d.get("enabled", True):
            continue
        detectors.append(CustomDetector(
            id=d["id"],
            name=d["name"],
            detection_type=d["detection_type"],
            config=d.get("config", {}),
            severity=d.get("severity", "warning"),
        ))

    logger.info(f"Loaded {len(detectors)} custom detectors from cloud")
    return detectors


def run_custom_detectors(metrics: SessionMetrics, detectors: list[CustomDetector]) -> None:
    """Run custom detectors against session messages."""
    agent_msgs = [m for m in metrics.messages if m["role"] == "agent"]
    if not agent_msgs or not detectors:
        return

    for detector in detectors:
        matches = 0

        if detector.detection_type == "keyword":
            keywords = detector.config.get("keywords", [])
            for m in agent_msgs:
                content = m["content"].lower()
                if any(kw.lower() in content for kw in keywords):
                    matches += 1

        elif detector.detection_type == "regex":
            pattern_str = detector.config.get("pattern", "")
            try:
                pattern = re.compile(pattern_str, re.I)
                for m in agent_msgs:
                    if pattern.search(m["content"]):
                        matches += 1
            except re.error:
                logger.warning(f"Invalid regex in detector {detector.name}: {pattern_str}")
                continue

        elif detector.detection_type == "threshold":
            threshold = detector.config.get("threshold", 0)
            keyword = detector.config.get("keyword", "")
            if keyword:
                for m in agent_msgs:
                    if m["content"].lower().count(keyword.lower()) >= threshold:
                        matches += 1

        if matches > 0:
            metrics.drift_events += 1
            metrics.patterns_detected.append({
                "id": f"custom:{detector.id}",
                "name": detector.name,
                "count": matches,
                "severity": detector.severity,
            })


def is_enabled() -> bool:
    """Check if cloud reporting is configured."""
    return bool(AGENT_KEY)
