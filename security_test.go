package main

import (
	"bytes"
	"log"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestClientIPTrustBoundary(t *testing.T) {
	a := testApp(t)
	a.trustedProxies = []netip.Prefix{netip.MustParsePrefix("172.18.0.1/32")}
	r := httptest.NewRequest("POST", "/portal-api/login", nil)
	r.Header.Set("X-Portal-Client-IP", "203.0.113.8")
	r.Header.Set("X-Forwarded-For", "203.0.113.9")
	r.Header.Set("CF-Connecting-IP", "203.0.113.10")
	r.RemoteAddr = "198.51.100.3:4567"
	if got := a.clientIP(r); got != "198.51.100.3" {
		t.Fatal("untrusted spoof accepted", got)
	}
	r.RemoteAddr = "172.18.0.1:4321"
	if got := a.clientIP(r); got != "203.0.113.8" {
		t.Fatal("trusted proxy not used", got)
	}
	r.Header.Set("X-Portal-Client-IP", "203.0.113.8\nforged")
	if got := a.clientIP(r); got != "172.18.0.1" {
		t.Fatal("invalid header accepted", got)
	}
	r.Header.Set("X-Portal-Client-IP", "::ffff:203.0.113.8")
	if got := a.clientIP(r); got != "203.0.113.8" {
		t.Fatal("mapped address not normalized", got)
	}
}
func TestLoginSecurityLogsAndGlobalAlertBound(t *testing.T) {
	a := testApp(t)
	var out bytes.Buffer
	a.securityLog = log.New(&out, "", 0)
	for i := 0; i < 30; i++ {
		request(a, "POST", "/portal-api/login", `{"password":"never-log-this-secret"}`, nil, a.origin)
	}
	if strings.Contains(out.String(), "never-log") {
		t.Fatal("password leaked")
	}
	if strings.Count(out.String(), "event=login_failed") != 10 || strings.Count(out.String(), "event=global_throttle") != 1 {
		t.Fatal("unbounded or missing events", out.String())
	}
	if w := request(a, "POST", "/portal-api/login", `{}`, nil, a.origin); w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatal("rate response missing")
	}
}
func TestBanPersistenceExpiryAndScope(t *testing.T) {
	a := testApp(t)
	c := loginCookie(t, a)
	// httptest.NewRequest uses this source address by default.
	_, err := a.db.Exec("INSERT INTO login_bans VALUES(?,?)", "192.0.2.1", time.Now().Add(time.Hour).Unix())
	if err != nil {
		t.Fatal(err)
	}
	w := request(a, "POST", "/portal-api/login", `{"password":"test-password-over-twenty-characters"}`, nil, a.origin)
	if w.Code != 429 {
		t.Fatal("banned login accepted", w.Code)
	}
	if w := request(a, "GET", "/portal-api/records?kind=chat", "", c, ""); w.Code != 200 {
		t.Fatal("existing session affected")
	}
	if w := request(a, "GET", "/", "", nil, ""); w.Code != 200 {
		t.Fatal("homepage affected")
	}
	a.db.Exec("UPDATE login_bans SET expires=?", time.Now().Add(-time.Second).Unix())
	loginCookie(t, a)
}
