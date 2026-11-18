package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestRecoveryConfirmationExpiryAndReplay(t *testing.T) {
	a := testApp(t)
	now := time.Now().Unix()
	ip := "203.0.113.8"
	a.db.Exec("INSERT INTO login_bans VALUES(?,?)", ip, now+3600)
	raw, err := issueRecovery(a.db, ip, now)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"token": raw})
	inspect := "/portal-api/recovery/inspect"
	redeem := "/portal-api/recovery/redeem"
	w := request(a, "POST", inspect, string(body), nil, a.origin)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"ready"`) {
		t.Fatal("inspect failed", w.Code, w.Body.String())
	}
	if w := request(a, "GET", "/portal-login/recover/", "", nil, ""); w.Code != 200 {
		t.Fatal("confirmation page unavailable")
	}
	if w := request(a, "GET", redeem, "", nil, ""); w.Code != 405 {
		t.Fatal("GET may not redeem")
	}
	if w := request(a, "POST", redeem, string(body), nil, "https://evil.test"); w.Code != 403 {
		t.Fatal("foreign origin accepted")
	}
	var pending int
	a.db.QueryRow("SELECT count(*) FROM login_recovery WHERE status!='ready'").Scan(&pending)
	if pending != 0 {
		t.Fatal("preview changed state")
	}
	for i := 0; i < 2; i++ {
		w = request(a, "POST", redeem, string(body), nil, a.origin)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"pending"`) {
			t.Fatal("submission not idempotent", w.Body.String())
		}
	}
	a.db.QueryRow("SELECT count(*) FROM login_recovery WHERE status='pending'").Scan(&pending)
	if pending != 1 {
		t.Fatal("duplicate job")
	}
	var stored string
	a.db.QueryRow("SELECT id FROM login_recovery").Scan(&stored)
	if stored == raw || stored != digest(raw) {
		t.Fatal("token stored in plaintext")
	}
	a.db.Exec("UPDATE login_recovery SET status='done'")
	w = request(a, "POST", redeem, string(body), nil, a.origin)
	if !strings.Contains(w.Body.String(), `"status":"done"`) {
		t.Fatal("completed token replayed")
	}
	a.db.Exec("UPDATE login_recovery SET expires=?", now-1)
	if w := request(a, "POST", inspect, string(body), nil, a.origin); w.Code != 410 {
		t.Fatal("expired token accepted")
	}
}
func TestRecoveryOldBanAndInvalidToken(t *testing.T) {
	a := testApp(t)
	now := time.Now().Unix()
	ip := "2001:db8::8"
	a.db.Exec("INSERT INTO login_bans VALUES(?,?)", ip, now+3600)
	raw, err := issueRecovery(a.db, ip, now)
	if err != nil {
		t.Fatal(err)
	}
	a.db.Exec("UPDATE login_bans SET expires=? WHERE ip=?", now+7200, ip)
	body, _ := json.Marshal(map[string]string{"token": raw})
	if w := request(a, "POST", "/portal-api/recovery/redeem", string(body), nil, a.origin); w.Code != 410 {
		t.Fatal("old link authorized new ban")
	}
	var status string
	a.db.QueryRow("SELECT status FROM login_recovery WHERE id=?", digest(raw)).Scan(&status)
	if status != "ready" {
		t.Fatal("stale link created job")
	}
	body, _ = json.Marshal(map[string]string{"token": strings.Repeat("a", 64)})
	if w := request(a, "POST", "/portal-api/recovery/redeem", string(body), nil, a.origin); w.Code != 410 {
		t.Fatal("unknown token accepted")
	}
	if _, err := issueRecovery(a.db, "203.0.113.99", now); err == nil {
		t.Fatal("token issued for unbanned IP")
	}
}
