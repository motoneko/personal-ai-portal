import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('recover',Path(__file__).with_name('recover.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Recover(unittest.TestCase):
    def test_claim_required_and_action_fixed(self):
        calls=[];unbanned=[]
        def run(cmd,*args):
            calls.append((cmd,args))
            return {'jobs':['job'], 'claim':{'ip':'203.0.113.8'}, 'finish':{'status':'done'}}.get(cmd)
        r.process(run,unbanned.append,lambda _:None)
        self.assertEqual(unbanned,['203.0.113.8'])
        self.assertEqual([c[0] for c in calls],['jobs','claim','apply','finish'])
    def test_stale_claim_does_not_unban(self):
        unbanned=[]
        r.process(lambda cmd,*_:['job'] if cmd=='jobs' else {},unbanned.append)
        self.assertEqual(unbanned,[])
    def test_failure_consumed_without_replay(self):
        calls=[]
        def run(cmd,*args):
            calls.append(cmd)
            return ['job'] if cmd=='jobs' else {'ip':'203.0.113.8'}
        def broken(ip):raise OSError('failure')
        r.process(run,broken)
        self.assertEqual(calls,['jobs','claim','fail'])
