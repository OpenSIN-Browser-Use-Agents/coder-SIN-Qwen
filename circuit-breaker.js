class CircuitBreaker {
  constructor(threshold = 5, timeoutMs = 60000) {
    this.threshold = threshold;
    this.timeoutMs = timeoutMs;
    this.failures = 0;
    this.state = 0;
    this.lastFailureTime = 0;
    this.resetTimer = null;
  }

  canExecute() {
    if (this.state === 0) return true;
    if (this.state === 1) {
      if (Date.now() - this.lastFailureTime >= this.timeoutMs) {
        this.state = 2;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 0;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 1;
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        if (this.state === 1) this.state = 2;
      }, this.timeoutMs);
    }
  }

  reset() {
    this.failures = 0;
    this.state = 0;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  getState() {
    return this.state;
  }
}

async function withCircuitBreaker(fn, breaker) {
  if (!breaker.canExecute()) {
    throw new Error('Circuit breaker is open');
  }
  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

const defaultCircuitBreaker = new CircuitBreaker();
export { CircuitBreaker, withCircuitBreaker, defaultCircuitBreaker };