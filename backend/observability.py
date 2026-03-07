"""
Observability module for Obula - Structured logging, metrics, and tracing.

This module provides:
- Structured JSON logging for all operations
- Request ID tracing across the pipeline
- Prometheus metrics export
- Health checks for all dependencies
- Sentry error tracking
- OpenTelemetry distributed tracing
"""

import json
import logging
import os
import time
import uuid
from contextvars import ContextVar
from typing import Any, Dict, Optional
from functools import wraps

# Context variable for request ID (persists across async calls)
request_id_var: ContextVar[str] = ContextVar('request_id', default='')

# Context variable for user ID
user_id_var: ContextVar[str] = ContextVar('user_id', default='')


class StructuredLogger:
    """JSON structured logger with request context."""
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(name)
        
    def _log(self, level: str, message: str, **extra):
        """Emit structured JSON log entry."""
        entry = {
            "timestamp": time.time(),
            "level": level,
            "logger": self.name,
            "message": message,
            "request_id": request_id_var.get(),
            "user_id": user_id_var.get(),
            "service": "obula-backend",
            "environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "development"),
            **extra
        }
        
        # Also emit to standard logging
        log_func = getattr(self.logger, level.lower(), self.logger.info)
        log_func(json.dumps(entry))
        
        return entry
    
    def debug(self, message: str, **extra):
        return self._log("DEBUG", message, **extra)
    
    def info(self, message: str, **extra):
        return self._log("INFO", message, **extra)
    
    def warning(self, message: str, **extra):
        return self._log("WARNING", message, **extra)
    
    def error(self, message: str, **extra):
        return self._log("ERROR", message, **extra)
    
    def critical(self, message: str, **extra):
        return self._log("CRITICAL", message, **extra)


# Global logger instance
logger = StructuredLogger("obula")


def set_request_id(request_id: Optional[str] = None) -> str:
    """Set request ID for current context. Generates one if not provided."""
    rid = request_id or str(uuid.uuid4())
    request_id_var.set(rid)
    return rid


def get_request_id() -> str:
    """Get current request ID."""
    return request_id_var.get() or set_request_id()


def set_user_id(user_id: str):
    """Set user ID for current context."""
    user_id_var.set(user_id)


def get_user_id() -> str:
    """Get current user ID."""
    return user_id_var.get()


def clear_context():
    """Clear request context."""
    request_id_var.set('')
    user_id_var.set('')


class Timer:
    """Context manager for timing operations."""
    
    def __init__(self, operation: str, **extra):
        self.operation = operation
        self.extra = extra
        self.start_time = None
        self.duration_ms = None
        
    def __enter__(self):
        self.start_time = time.time()
        logger.info(f"{self.operation}_started", operation=self.operation, **self.extra)
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.duration_ms = (time.time() - self.start_time) * 1000
        
        if exc_type:
            logger.error(
                f"{self.operation}_failed",
                operation=self.operation,
                duration_ms=self.duration_ms,
                error_type=exc_type.__name__,
                error=str(exc_val),
                **self.extra
            )
        else:
            logger.info(
                f"{self.operation}_completed",
                operation=self.operation,
                duration_ms=self.duration_ms,
                **self.extra
            )
        
        return False  # Don't suppress exceptions


def timed(operation: str, **extra):
    """Decorator for timing functions."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with Timer(operation, function=func.__name__, **extra):
                return func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# Metrics Collection (Prometheus-compatible)
# =============================================================================

class MetricsCollector:
    """Simple metrics collector (Prometheus-compatible format)."""
    
    def __init__(self):
        self.counters: Dict[str, int] = {}
        self.gauges: Dict[str, float] = {}
        self.histograms: Dict[str, list] = {}
        self.timers: Dict[str, list] = {}
        
    def increment(self, name: str, value: int = 1, labels: Optional[Dict] = None):
        """Increment a counter metric."""
        key = self._key(name, labels)
        self.counters[key] = self.counters.get(key, 0) + value
        
    def gauge(self, name: str, value: float, labels: Optional[Dict] = None):
        """Set a gauge metric."""
        key = self._key(name, labels)
        self.gauges[key] = value
        
    def timing(self, name: str, duration_ms: float, labels: Optional[Dict] = None):
        """Record a timing metric."""
        key = self._key(name, labels)
        if key not in self.timers:
            self.timers[key] = []
        self.timers[key].append(duration_ms)
        
    def _key(self, name: str, labels: Optional[Dict]) -> str:
        """Create metric key with labels."""
        if not labels:
            return name
        label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
        return f'{name}{{{label_str}}}'
    
    def render_prometheus(self) -> str:
        """Render metrics in Prometheus exposition format."""
        lines = []
        lines.append("# Obula Backend Metrics")
        lines.append("")
        
        # Counters
        if self.counters:
            lines.append("# Counters")
            for key, value in sorted(self.counters.items()):
                lines.append(f'{key} {value}')
            lines.append("")
            
        # Gauges
        if self.gauges:
            lines.append("# Gauges")
            for key, value in sorted(self.gauges.items()):
                lines.append(f'{key} {value}')
            lines.append("")
            
        # Timings (simple histogram)
        if self.timers:
            lines.append("# Timings (ms)")
            for key, values in sorted(self.timers.items()):
                if values:
                    lines.append(f'{key}_count {len(values)}')
                    lines.append(f'{key}_sum {sum(values)}')
                    lines.append(f'{key}_avg {sum(values)/len(values):.2f}')
                    lines.append(f'{key}_p95 {sorted(values)[int(len(values)*0.95)]}')
            lines.append("")
            
        return "\n".join(lines)
    
    def get_stats(self) -> Dict:
        """Get metrics as dictionary."""
        return {
            "counters": dict(self.counters),
            "gauges": dict(self.gauges),
            "timers": {
                k: {"count": len(v), "avg": sum(v)/len(v) if v else 0}
                for k, v in self.timers.items()
            }
        }


# Global metrics instance
metrics = MetricsCollector()


# =============================================================================
# Health Checks
# =============================================================================

class HealthChecker:
    """Health checker for all dependencies."""
    
    def __init__(self):
        self.checks: Dict[str, callable] = {}
        
    def register(self, name: str, check_func):
        """Register a health check."""
        self.checks[name] = check_func
        
    async def check_all(self) -> Dict[str, Any]:
        """Run all health checks."""
        results = {
            "status": "healthy",
            "timestamp": time.time(),
            "checks": {}
        }
        
        for name, check_func in self.checks.items():
            try:
                start = time.time()
                healthy, details = await check_func()
                duration_ms = (time.time() - start) * 1000
                
                results["checks"][name] = {
                    "status": "healthy" if healthy else "unhealthy",
                    "duration_ms": duration_ms,
                    "details": details
                }
                
                if not healthy:
                    results["status"] = "unhealthy"
                    
            except Exception as e:
                results["checks"][name] = {
                    "status": "error",
                    "error": str(e)
                }
                results["status"] = "unhealthy"
                
        return results


health_checker = HealthChecker()


# =============================================================================
# Sentry Integration (Error Tracking)
# =============================================================================

_sentry_initialized = False

def init_sentry():
    """Initialize Sentry error tracking."""
    global _sentry_initialized
    
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        logger.info("Sentry not configured (SENTRY_DSN not set)")
        return
        
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        
        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("RAILWAY_ENVIRONMENT_NAME", "development"),
            release=os.getenv("RAILWAY_GIT_COMMIT_SHA", "unknown"),
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.1,  # 10% of requests
            profiles_sample_rate=0.1,
            before_send=before_send_event,
        )
        
        _sentry_initialized = True
        logger.info("Sentry initialized")
        
    except ImportError:
        logger.warning("sentry-sdk not installed")
    except Exception as e:
        logger.error("Failed to initialize Sentry", error=str(e))


def before_send_event(event, hint):
    """Filter events before sending to Sentry."""
    # Add request context
    event.setdefault("extra", {})
    event["extra"]["request_id"] = get_request_id()
    event["extra"]["user_id"] = get_user_id()
    return event


def capture_exception(exc: Exception, extra: Optional[Dict] = None):
    """Capture exception to Sentry and logs."""
    # Always log
    logger.error(
        str(exc),
        error_type=type(exc).__name__,
        error=str(exc),
        **(extra or {})
    )
    
    # Send to Sentry if configured
    if _sentry_initialized:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_extra("request_id", get_request_id())
            scope.set_extra("user_id", get_user_id())
            if extra:
                for k, v in extra.items():
                    scope.set_extra(k, v)
            sentry_sdk.capture_exception(exc)


def capture_message(message: str, level: str = "info", extra: Optional[Dict] = None):
    """Capture message to Sentry."""
    logger.log(level, message, **(extra or {}))
    
    if _sentry_initialized:
        import sentry_sdk
        sentry_sdk.capture_message(message, level)


# =============================================================================
# Tracing
# =============================================================================

class Span:
    """Simple span for tracing operations."""
    
    def __init__(self, name: str, parent_id: Optional[str] = None, **attrs):
        self.name = name
        self.id = str(uuid.uuid4())[:8]
        self.parent_id = parent_id
        self.trace_id = get_request_id() or str(uuid.uuid4())
        self.attrs = attrs
        self.start_time = None
        self.end_time = None
        self.events = []
        
    def start(self):
        """Start the span."""
        self.start_time = time.time()
        logger.info(
            f"span_start",
            span_name=self.name,
            span_id=self.id,
            trace_id=self.trace_id,
            parent_id=self.parent_id,
            **self.attrs
        )
        return self
        
    def end(self, status: str = "ok", error: Optional[str] = None):
        """End the span."""
        self.end_time = time.time()
        duration_ms = (self.end_time - self.start_time) * 1000
        
        logger.info(
            f"span_end",
            span_name=self.name,
            span_id=self.id,
            trace_id=self.trace_id,
            duration_ms=duration_ms,
            status=status,
            error=error,
            event_count=len(self.events)
        )
        
    def add_event(self, name: str, **attrs):
        """Add event to span."""
        self.events.append({
            "name": name,
            "timestamp": time.time(),
            **attrs
        })
        logger.info(
            f"span_event",
            span_name=self.name,
            span_id=self.id,
            event_name=name,
            **attrs
        )
        
    def __enter__(self):
        return self.start()
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.end(status="error", error=str(exc_val))
        else:
            self.end(status="ok")


def create_span(name: str, **attrs) -> Span:
    """Create a new span."""
    return Span(name, **attrs)


# =============================================================================
# Alerting Webhooks
# =============================================================================

class AlertManager:
    """Send alerts to external systems (Slack, Discord, PagerDuty)."""
    
    def __init__(self):
        self.webhooks = []
        
        # Load webhook URLs from env
        if slack_url := os.getenv("ALERT_SLACK_WEBHOOK"):
            self.webhooks.append(("slack", slack_url))
        if discord_url := os.getenv("ALERT_DISCORD_WEBHOOK"):
            self.webhooks.append(("discord", discord_url))
    
    async def send_alert(self, level: str, message: str, details: Optional[Dict] = None):
        """Send alert to all configured webhooks."""
        import aiohttp
        
        payload = {
            "level": level,
            "message": message,
            "details": details or {},
            "timestamp": time.time(),
            "request_id": get_request_id(),
            "service": "obula-backend"
        }
        
        for webhook_type, url in self.webhooks:
            try:
                async with aiohttp.ClientSession() as session:
                    formatted = self._format_for_webhook(webhook_type, payload)
                    async with session.post(url, json=formatted, timeout=10) as resp:
                        if resp.status >= 400:
                            logger.error(f"Alert webhook failed: {webhook_type}", status=resp.status)
            except Exception as e:
                logger.error(f"Failed to send alert to {webhook_type}", error=str(e))
    
    def _format_for_webhook(self, webhook_type: str, payload: Dict) -> Dict:
        """Format payload for specific webhook type."""
        if webhook_type == "slack":
            color = {"critical": "danger", "error": "danger", "warning": "warning"}.get(
                payload["level"], "good"
            )
            return {
                "attachments": [{
                    "color": color,
                    "title": f"Obula Alert: {payload['level'].upper()}",
                    "text": payload["message"],
                    "fields": [
                        {"title": k, "value": str(v), "short": True}
                        for k, v in payload.get("details", {}).items()
                    ],
                    "footer": f"Request: {payload['request_id'][:8]}"
                }]
            }
        elif webhook_type == "discord":
            color_map = {"critical": 0xFF0000, "error": 0xFF0000, "warning": 0xFFA500}
            return {
                "embeds": [{
                    "title": f"Obula Alert: {payload['level'].upper()}",
                    "description": payload["message"],
                    "color": color_map.get(payload["level"], 0x00FF00),
                    "fields": [
                        {"name": k, "value": str(v)[:1000], "inline": True}
                        for k, v in payload.get("details", {}).items()
                    ],
                    "footer": {"text": f"Request: {payload['request_id'][:8]}"}
                }]
            }
        return payload


alert_manager = AlertManager()


async def send_alert(level: str, message: str, details: Optional[Dict] = None):
    """Send alert via alert manager."""
    await alert_manager.send_alert(level, message, details)


# =============================================================================
# Setup/Initialization
# =============================================================================

def setup_logging():
    """Configure structured logging."""
    # Set up root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Clear existing handlers
    root_logger.handlers = []
    
    # Console handler with JSON format
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(message)s'))
    root_logger.addHandler(handler)
    
    # Reduce noise from third-party libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)


def init_observability():
    """Initialize all observability features."""
    setup_logging()
    init_sentry()
    logger.info("Observability initialized")
