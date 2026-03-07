/**
 * Frontend Observability - Error tracking, logging, and metrics
 */

// Generate or retrieve request ID
function getRequestId() {
  let rid = sessionStorage.getItem('obula_request_id');
  if (!rid) {
    rid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('obula_request_id', rid);
  }
  return rid;
}

// Generate new request ID for each page load
function refreshRequestId() {
  const rid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  sessionStorage.setItem('obula_request_id', rid);
  return rid;
}

// User context
let userContext = {
  userId: null,
  email: null,
  sessionId: getRequestId(),
};

export function setUserContext(user) {
  userContext = {
    ...userContext,
    userId: user?.id || null,
    email: user?.email || null,
  };
}

// Structured logger
class FrontendLogger {
  constructor() {
    this.logQueue = [];
    this.flushInterval = null;
    this.startFlushTimer();
  }

  startFlushTimer() {
    // Flush logs every 10 seconds
    this.flushInterval = setInterval(() => this.flush(), 10000);
  }

  _log(level, message, extra = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      request_id: getRequestId(),
      session_id: userContext.sessionId,
      user_id: userContext.userId,
      url: window.location.href,
      user_agent: navigator.userAgent,
      ...extra,
    };

    // Always log to console in development
    if (import.meta.env.DEV) {
      const color = {
        DEBUG: '#6c757d',
        INFO: '#0d6efd',
        WARNING: '#ffc107',
        ERROR: '#dc3545',
        CRITICAL: '#721c24',
      }[level] || '#000';
      
      console.log(
        `%c[${level}] ${message}`,
        `color: ${color}; font-weight: bold`,
        extra,
      );
    }

    // Queue for batching
    this.logQueue.push(entry);

    // Immediate flush for errors
    if (level === 'ERROR' || level === 'CRITICAL') {
      this.flush();
    }
  }

  debug(message, extra) { this._log('DEBUG', message, extra); }
  info(message, extra) { this._log('INFO', message, extra); }
  warning(message, extra) { this._log('WARNING', message, extra); }
  error(message, extra) { this._log('ERROR', message, extra); }
  critical(message, extra) { this._log('CRITICAL', message, extra); }

  async flush() {
    if (this.logQueue.length === 0) return;

    const logs = [...this.logQueue];
    this.logQueue = [];

    try {
      // Send to backend (if endpoint exists)
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      await fetch(`${apiBase}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs }),
        keepalive: true,
      });
    } catch (e) {
      // Silent fail - don't cause infinite loops
      console.warn('Failed to send logs to backend', e);
    }
  }
}

export const logger = new FrontendLogger();

// Error tracking
export function initErrorTracking() {
  // Global error handler
  window.onerror = (message, source, lineno, colno, error) => {
    logger.error('uncaught_error', {
      message,
      source,
      lineno,
      colno,
      stack: error?.stack,
      component: 'global',
    });
    
    // Send to backend immediately
    reportError({
      type: 'uncaught',
      message,
      source,
      lineno,
      colno,
      stack: error?.stack,
    });
  };

  // Unhandled promise rejection handler
  window.onunhandledrejection = (event) => {
    logger.error('unhandled_promise_rejection', {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    });
    
    reportError({
      type: 'unhandled_promise',
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    });
  };

  // React error boundary helper
  window.reportComponentError = (error, errorInfo) => {
    logger.error('react_component_error', {
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
    
    reportError({
      type: 'react',
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  };

  // API error tracking
  trackApiErrors();
}

async function reportError(errorData) {
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    await fetch(`${apiBase}/api/errors/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...errorData,
        request_id: getRequestId(),
        user_id: userContext.userId,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    });
  } catch (e) {
    console.warn('Failed to report error', e);
  }
}

// Track API errors
function trackApiErrors() {
  const originalFetch = window.fetch;
  
  window.fetch = async (...args) => {
    const [url, options] = args;
    const startTime = performance.now();
    
    try {
      const response = await originalFetch(...args);
      const duration = performance.now() - startTime;
      
      // Log slow requests
      if (duration > 5000) {
        logger.warning('slow_api_request', {
          url: url.toString(),
          method: options?.method || 'GET',
          duration_ms: Math.round(duration),
          status: response.status,
        });
      }
      
      // Log API errors
      if (!response.ok && response.status >= 500) {
        logger.error('api_error', {
          url: url.toString(),
          method: options?.method || 'GET',
          status: response.status,
          statusText: response.statusText,
        });
      }
      
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('api_request_failed', {
        url: url.toString(),
        method: options?.method || 'GET',
        error: error.message,
        duration_ms: Math.round(duration),
      });
      throw error;
    }
  };
}

// Performance monitoring
export function initPerformanceMonitoring() {
  if (!window.performance) return;

  // Monitor page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        logger.info('page_load_metrics', {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadComplete: nav.loadEventEnd - nav.loadEventStart,
          ttfb: nav.responseStart - nav.startTime,
          fcp: getFCP(),
        });
      }
    }, 0);
  });

  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) { // Long task > 50ms
          logger.warning('long_task', {
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      }
    });
    
    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Not supported
    }
  }
}

function getFCP() {
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  return fcp ? fcp.startTime : null;
}

// React hook for component performance
export function useComponentTiming(componentName) {
  const startTime = performance.now();
  
  return () => {
    const duration = performance.now() - startTime;
    if (duration > 100) { // Slow render
      logger.warning('slow_component_render', {
        component: componentName,
        duration_ms: Math.round(duration),
      });
    }
  };
}

// User action tracking (for debugging flows)
export function trackUserAction(action, details = {}) {
  logger.info('user_action', {
    action,
    ...details,
    path: window.location.pathname,
  });
}

// Request ID for API calls
export function getApiRequestId() {
  return getRequestId();
}

export function refreshApiRequestId() {
  return refreshRequestId();
}

// Initialize on import
if (typeof window !== 'undefined') {
  initErrorTracking();
  initPerformanceMonitoring();
}
