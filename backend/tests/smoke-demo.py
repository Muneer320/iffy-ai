"""Actual HTTP demo check. Refuses remote hosts and non-demo runtimes."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse

base=os.environ.get('IFFY_API_URL','http://localhost:8102').rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1','::1'), 'Only loopback demos may be tested'
def call(path,body=None):
    request=Request(base+'/api/'+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    try:
        with urlopen(request,timeout=20) as response:return response.status,json.load(response)
    except HTTPError as error:return error.code,json.load(error)

assert call('health')[1]['data']['mode']=='demo'
examples=call('examples')[1]['data']
ids=[]
for example in examples:
    code,response=call('simulate',{'scenario':example['scenario']})
    assert code==200,response
    original=response['data'];ids.append(original['simulation_id'])
    assert len(original['nodes'])>=6 and len(original['sector_impacts'])>=4
    assert original['metadata']['model']=='authored-demo-v1'
    _,branched=call('mutate',{'simulation_id':original['simulation_id'],'mutation_prompt':example['branches'][0]})
    alternative=branched['data']['simulation'];ids.append(alternative['simulation_id'])
    assert alternative['metadata']['parent_id']==original['simulation_id']
    assert call('simulation/'+original['simulation_id'])[1]['data']==original
    assert alternative['nodes']!=original['nodes']
    assert len(call('debate',{'simulation_id':alternative['simulation_id']})[1]['data']['messages'])==3
    assert call('sector',{'simulation_id':original['simulation_id'],'sector':original['sector_impacts'][0]['sector']})[0]==200
with ThreadPoolExecutor(max_workers=8) as pool:
    parallel=list(pool.map(lambda _:call('simulate',{'scenario':examples[0]['scenario']}),range(8)))
assert all(code==200 for code,_ in parallel)
parallel_ids=[r['data']['simulation_id'] for _,r in parallel]
assert len(set(parallel_ids))==8
saved={s['simulation_id'] for s in call('saved')[1]['data']}
assert set(ids+parallel_ids)<=saved, 'Concurrent creates must not lose a saved notebook'
assert call('simulate',{'scenario':'What if an unsupported thing happened?'})[0]==422
assert call('simulate',{'scenario':3})[0]==400
assert call('community')[0]==501 and call('marketplace')[0]==501
print(json.dumps({'mode':'demo','examples':len(examples),'verified_notebooks':len(ids+parallel_ids),'concurrent_creates':8,'restart_probe_id':ids[0]}))
