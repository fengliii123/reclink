"""Run all e2e suites with a host-permission patch applied to dist.

上架版 manifest 出于审核友好只声明 optional_host_permissions（真实用户经
工具栏点击获得 activeTab，注入足够）。但自动化无法模拟工具栏点击拿
activeTab，executeScript 类用例会全部失败。本 runner 在跑测前给
dist/manifest.json 临时注入 host_permissions ['<all_urls>']（等效模拟
activeTab 效果），结束/中断时恢复原版——上架 zip 打包前请确保已恢复
（或重新 npm run build）。

Usage: python3 scripts/e2e_all.py [suite ...]   # 不带参数跑全部
"""
import fcntl
import glob
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

SUITE_TIMEOUT = 300  # 单套件超时：卡死的套件（原生弹窗等）最多挂 5 分钟
LOCK_FILE = '/tmp/reclink-e2e-all.lock'


def sweep_tmp():
    """清掉上次异常退出遗留的 Chrome profile/下载目录，防止 /tmp 越积越多。"""
    for d in glob.glob('/tmp/reclink-e2e-*'):
        shutil.rmtree(d, ignore_errors=True)

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist' / 'manifest.json'
BACKUP = ROOT / 'dist' / '.manifest.orig.json'


def patch():
    m = json.loads(DIST.read_text())
    if '<all_urls>' in (m.get('host_permissions') or []):
        return
    json.dump(m, BACKUP.open('w'), ensure_ascii=False, indent=2)
    m['host_permissions'] = ['<all_urls>']
    DIST.write_text(json.dumps(m, ensure_ascii=False, indent=2))


def restore():
    if BACKUP.exists():
        BACKUP.rename(DIST)


def run_suite(name):
    """在新进程组里跑套件；超时或结束后杀掉整个进程组，避免卡死的
    Chromium/子进程泄漏占满系统进程表。"""
    t0 = time.time()
    p = subprocess.Popen([sys.executable, f'scripts/{name}'], cwd=ROOT,
                         start_new_session=True)
    try:
        rc = p.wait(timeout=SUITE_TIMEOUT)
    except subprocess.TimeoutExpired:
        print(f'!! {name} timed out after {SUITE_TIMEOUT}s, killing process group')
        rc = 124
    finally:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    return rc, time.time() - t0


def _terminate(signum, frame):
    # SIGTERM/SIGINT 下走 finally 恢复 manifest；SIGKILL 无法拦截（跑前留有备份文件）
    raise SystemExit(128 + signum)


def main():
    signal.signal(signal.SIGTERM, _terminate)
    signal.signal(signal.SIGINT, _terminate)
    # 互斥锁：防止多个 runner 并发跑套件（每个都会开 Chrome，会拖垮机器）
    lock = open(LOCK_FILE, 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('another e2e_all.py is already running, aborting')
        sys.exit(2)
    sweep_tmp()
    suites = sys.argv[1:] or sorted(
        p.name for p in (ROOT / 'scripts').glob('e2e_*.py') if p.name != 'e2e_all.py')
    # e2e_tab 验证的正是"无权限"守卫路径，必须跑未打补丁的 manifest
    patched_suites = [s for s in suites if s != 'e2e_tab.py']
    tab_suites = [s for s in suites if s == 'e2e_tab.py']
    results = []
    try:
        for name in patched_suites:
            patch()
            results.append((name, *run_suite(name)))
        for name in tab_suites:
            restore()
            results.append((name, *run_suite(name)))
    finally:
        restore()
    print('\n===== 汇总 =====')
    failed = 0
    for name, rc, dt in results:
        print(f'{"PASS" if rc == 0 else "FAIL"}  {name}  ({dt:.0f}s)')
        failed += rc != 0
    print(f'{len(results) - failed}/{len(results)} passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()