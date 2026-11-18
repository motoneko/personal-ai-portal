import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('notify', Path(__file__).with_name('notify.py'))
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

class Notifications(unittest.TestCase):
    def test_queue_retry_and_global_cooldown(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = n.database(str(Path(tmp) / 'queue.db'))
            n.enqueue(db, 'login-ban', '203.0.113.8', 10000)
            self.assertIn('unconfigured', n.deliver(db, {}, 10000))
            cfg = dict(SMTP_HOST='smtp.example.com', SMTP_USERNAME='owner', SMTP_PASSWORD='never-log', SMTP_FROM='from@example.com', ALERT_TO='to@example.com')
            def broken(*args): raise OSError('failure')
            with self.assertRaises(OSError): n.deliver(db, cfg, 10000, broken)
            self.assertEqual(db.execute('SELECT count(*) FROM events').fetchone()[0], 1)
            sent=[]
            self.assertEqual(n.deliver(db, cfg, 10000, lambda m,c:sent.append(m)), 'accepted by SMTP server')
            self.assertNotIn('never-log', sent[0].as_string())
            n.enqueue(db,'global-rate-limit','203.0.113.9',10001)
            self.assertEqual(n.deliver(db,cfg,10001,lambda m,c:sent.append(m)), 'cooldown')
            self.assertEqual(n.deliver(db,cfg,11800,lambda m,c:sent.append(m)), 'accepted by SMTP server')
            self.assertEqual(len(sent),2)
            db.close()
    def test_reject_log_injection(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=n.database(str(Path(tmp)/'queue.db'))
            with self.assertRaises(ValueError): n.enqueue(db,'login-ban','1.2.3.4\nforged',10000)
            db.close()

if __name__ == '__main__': unittest.main()

class RecoveryLinks(unittest.TestCase):
    def test_only_bans_get_bound_recovery_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=n.database(str(Path(tmp)/'queue.db'))
            n.enqueue(db,'login-ban','203.0.113.8',10000)
            n.enqueue(db,'global-rate-limit','203.0.113.9',10000)
            cfg=dict(SMTP_HOST='smtp.example.com',SMTP_USERNAME='owner',SMTP_PASSWORD='secret',SMTP_FROM='from@example.com',ALERT_TO='to@example.com',EMAIL_RECOVERY_ENABLED='true')
            links=[];messages=[]
            def link(ip,config):links.append(ip);return 'https://portal.example.com/portal-login/recover/#example-token'
            n.deliver(db,cfg,10000,lambda message,config:messages.append(message),link)
            self.assertEqual(links,['203.0.113.8'])
            self.assertIn('/recover/#example-token',messages[0].get_content())
            self.assertIn('确认解封',messages[0].get_content())
            db.close()
