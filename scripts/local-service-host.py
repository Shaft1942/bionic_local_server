"""Fixed Comfy Python host. Control credentials arrive only through stdin.

This is a same-user control boundary, not a sandbox for the trusted engine.
No PID signalling or forced process termination is performed.
"""
import _thread
import hmac
import json
import os
import runpy
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

initial = json.loads(sys.stdin.readline(65537))
token = initial['token']
operation_id = initial['operationId']
# Keep the launch parent identity stable even if the companion later exits.
parent_pid = os.getppid()
entry = initial['entryPath']
receipt_path = initial['receiptPath']
lock = threading.Lock()
state = 'running'
scope = 'same-process'
stop_requested = False
finalizing = False
terminal_revoked = False

class WindowsScope:
    """Accounting only: no kill-on-close flag and no termination API."""
    def __init__(self):
        import ctypes
        from ctypes import wintypes
        self.ctypes = ctypes
        class Accounting(ctypes.Structure):
            _fields_ = [('user', ctypes.c_longlong), ('kernel', ctypes.c_longlong),
                        ('period_user', ctypes.c_longlong), ('period_kernel', ctypes.c_longlong),
                        ('faults', wintypes.DWORD), ('total', wintypes.DWORD),
                        ('active', wintypes.DWORD), ('terminated', wintypes.DWORD)]
        self.Accounting = Accounting
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.GetCurrentProcess.restype = wintypes.HANDLE
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        self.kernel.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]
        self.kernel.QueryInformationJobObject.restype = wintypes.BOOL
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle or not self.kernel.AssignProcessToJobObject(self.handle, self.kernel.GetCurrentProcess()):
            raise OSError('Cannot establish owned job accounting')

    def inspect(self):
        accounting = self.Accounting()
        if not self.kernel.QueryInformationJobObject(self.handle, 1, self.ctypes.byref(accounting), self.ctypes.sizeof(accounting), None):
            return 'unknown-descendants'
        return 'same-process' if accounting.active == 1 else 'unknown-descendants'

job_scope = None
if os.name == 'nt':
    try:
        job_scope = WindowsScope()
    except Exception:
        scope = 'unknown-descendants'

def current_scope():
    global scope
    if terminal_revoked:
        scope = 'unknown-descendants'
        return scope
    if job_scope is not None:
        scope = job_scope.inspect()
    return scope

def publish():
    record = dict(version=1, id='comfyui', operationId=operation_id, token=token,
                  controlPort=server.server_port, pid=os.getpid(), parentPid=parent_pid, state=state,
                  scope=current_scope(), profileFingerprint=initial['profileFingerprint'],
                  receiptPath=receipt_path)
    temporary = receipt_path + '.tmp'
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        json.dump(record, output)
        output.flush()
    for attempt in range(20):
        try:
            os.replace(temporary, receipt_path)
            break
        except PermissionError:
            if attempt == 19:
                raise
            time.sleep(0.025)

class Control(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        global state, stop_requested
        supplied = self.headers.get('Authorization', '')
        if not hmac.compare_digest(supplied, 'Bearer ' + token):
            self.send_error(403)
            return
        if self.path not in ('/inspect', '/stop') or int(self.headers.get('Content-Length', '0')) != 0:
            self.send_error(400)
            return
        interrupt = False
        with lock:
            current_scope()
            if self.path == '/stop' and state == 'running' and scope == 'same-process':
                state = 'stopping'
                stop_requested = True
                publish()
                interrupt = True
            payload = json.dumps(dict(operationId=operation_id, pid=os.getpid(), parentPid=parent_pid,
                                      profileFingerprint=initial['profileFingerprint'], state=state, scope=scope)).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
        self.wfile.flush()
        if interrupt:
            # Schedules KeyboardInterrupt on the main Python thread, never Win32 SIGINT kill.
            _thread.interrupt_main()

# An engine that launches subprocesses loses the same-process scope guarantee.
# This does not block engine startup; stop becomes unavailable rather than killing a tree.
def audit(event, args):
    global scope, terminal_revoked
    if event in ('subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.spawn', 'os.fork', 'os.forkpty'):
        with lock:
            # The audit precedes actual creation. Revoke durably before spawn,
            # even when the job still contains only the host at this instant.
            if finalizing:
                terminal_revoked = True
                scope = 'unknown-descendants'
                publish()
            elif job_scope is None:
                scope = 'unknown-descendants'
                publish()

server = ThreadingHTTPServer(('127.0.0.1', 0), Control)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
publish()
sys.addaudithook(audit)
os.chdir(initial['workingDirectory'])
sys.path.insert(0, initial['workingDirectory'])
sys.argv = [entry, '--listen', '127.0.0.1', '--port', str(initial['port'])]
try:
    runpy.run_path(entry, run_name='__main__')
except KeyboardInterrupt:
    pass
except SystemExit:
    pass
finally:
    # This marker is not an OS proof of process exit. Only the owning ChildProcess
    # exit event can establish that; after reconnect an absent endpoint is unknown.
    with lock:
        finalizing = True
        state = 'main-exited'
        publish()
    server.shutdown()
    server.server_close()
