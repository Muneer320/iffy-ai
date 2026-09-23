"""Verify migration 002 and concurrent quotas on an isolated PostgreSQL container.

Requires Docker; uses only synthetic data and removes only its own test container.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import time
import uuid

container='iffy-budget-check-'+uuid.uuid4().hex[:10]
root=Path(__file__).resolve().parents[1]
def run(*args,**kwargs):
    return subprocess.run(args,text=True,encoding='utf-8',capture_output=True,**kwargs)
def sql(statement,check=True):
    result=run('docker','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq',input=statement)
    if check and result.returncode: raise RuntimeError(result.stderr)
    return result
try:
    start=run('docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=synthetic-ephemeral-test','postgres:16-alpine')
    if start.returncode: raise RuntimeError(start.stderr)
    for attempt in range(45):
        if run('docker','exec',container,'pg_isready','-U','postgres').returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('Test database did not become ready')
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
    for name in ['001_initial.sql','002_private_workspace.sql']:
        sql((root/'lib/supabase/migrations'/name).read_text(encoding='utf-8'))
    # Idempotent upgrade: reapplying 002 must preserve data and permissions.
    sql((root/'lib/supabase/migrations/002_private_workspace.sql').read_text(encoding='utf-8'))
    with ThreadPoolExecutor(max_workers=16) as pool:
        replies=list(pool.map(lambda _:sql('SET ROLE service_role; SELECT public.iffy_consume_generation_budget();').stdout.strip(),range(16)))
    assert replies.count('t')==6 and replies.count('f')==10,replies
    sql("UPDATE public.iffy_generation_budget SET used=CASE WHEN bucket LIKE 'day:%' THEN 49 ELSE 0 END;")
    assert sql('SELECT public.iffy_consume_generation_budget();').stdout.strip()=='t'
    assert sql('SELECT public.iffy_consume_generation_budget();').stdout.strip()=='f'
    denied=sql('SET ROLE anon; SELECT public.iffy_consume_generation_budget();',check=False)
    assert denied.returncode and 'permission denied' in denied.stderr
    sql("INSERT INTO simulations(title,scenario,simulation_json) VALUES ('synthetic','synthetic','{}'); GRANT SELECT ON simulations TO anon;")
    assert sql('SET ROLE anon; SELECT count(*) FROM simulations;').stdout.strip()=='0'
    print('PASS: migration upgrade, 16 concurrent requests capped at 6, daily cap at 50, service-only budget RPC, anonymous simulation reads denied.')
finally:
    removed=run('docker','rm','-f',container)
    if removed.returncode: print('Test-container cleanup failed:',container)
