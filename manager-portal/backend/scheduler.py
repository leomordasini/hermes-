"""
APScheduler background job scheduler.
Phase 7+ — stubs here so main.py can import safely.
"""

class _StubScheduler:
    def start(self): pass
    def shutdown(self, wait=False): pass

scheduler = _StubScheduler()

def get_scheduler():
    return scheduler
