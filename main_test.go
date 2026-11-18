package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testApp(t *testing.T) *app {
	t.Helper()
	db, e := openDB(filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	salt := "test"
	return &app{db: db, origin: "https://portal.test", salt: salt, password: passwordHash("test-password-over-twenty-characters", salt), secure: true, model: "test-model", client: &http.Client{Timeout: time.Second}, slots: make(chan struct{}, 2), attempts: map[string]attempt{}}
}
func request(a *app, method, path, body string, c *http.Cookie, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Origin", origin)
	r.Header.Set("Content-Type", "application/json")
	if c != nil {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func loginCookie(t *testing.T, a *app) *http.Cookie {
	t.Helper()
	w := request(a, "POST", "/portal-api/login", `{"password":"test-password-over-twenty-characters"}`, nil, a.origin)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	c := w.Result().Cookies()[0]
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode {
		t.Fatal("insecure cookie")
	}
	return c
}
func TestAuthenticationAndIsolation(t *testing.T) {
	a := testApp(t)
	for _, route := range []string{"status", "quota", "models", "records?kind=chat"} {
		w := request(a, "GET", "/portal-api/"+route, "", nil, "")
		if w.Code != 401 {
			t.Fatalf("%s leaked without login", route)
		}
	}
	if w := request(a, "POST", "/portal-api/login", `{"password":"test-password-over-twenty-characters"}`, nil, "https://evil.test"); w.Code != 403 {
		t.Fatal("cross-origin login accepted")
	}
	if w := request(a, "POST", "/portal-api/login", `{"password":"wrong"}`, nil, a.origin); w.Code != 401 {
		t.Fatal("wrong password accepted")
	}
	c := loginCookie(t, a)
	if w := request(a, "GET", "/portal-api/records?kind=chat", "", c, ""); w.Code != 200 {
		t.Fatal(w.Code)
	}
	request(a, "POST", "/portal-api/logout", "{}", c, a.origin)
	if w := request(a, "GET", "/portal-api/records?kind=chat", "", c, ""); w.Code != 401 {
		t.Fatal("logout failed")
	}
}
func TestRecordLifecycle(t *testing.T) {
	a := testApp(t)
	c := loginCookie(t, a)
	w := request(a, "POST", "/portal-api/records", `{"kind":"read","title":"article","body":"summary"}`, c, a.origin)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var rec record
	json.Unmarshal(w.Body.Bytes(), &rec)
	if rec.ID == "" {
		t.Fatal("missing id")
	}
	w = request(a, "GET", "/portal-api/records?kind=read", "", c, "")
	if !strings.Contains(w.Body.String(), "summary") {
		t.Fatal("record missing")
	}
	request(a, "DELETE", "/portal-api/records", `{"id":"`+rec.ID+`"}`, c, a.origin)
	w = request(a, "GET", "/portal-api/records?kind=read", "", c, "")
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal("delete failed")
	}
}
func TestAIRequestAndSecretBoundary(t *testing.T) {
	a := testApp(t)
	a.key = "secret-test-key"
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret-test-key" {
			t.Error("no auth")
		}
		if r.URL.Path != "/v1/responses" {
			t.Error("wrong path")
		}
		var in map[string]any
		json.NewDecoder(r.Body).Decode(&in)
		if in["store"] != false || in["model"] != "test-model" {
			t.Error("wrong request")
		}
		io.WriteString(w, `{"output":[{"type":"message","content":[{"type":"output_text","text":"hello"}]}]}`)
	}))
	defer up.Close()
	a.upstream = up.URL
	c := loginCookie(t, a)
	w := request(a, "POST", "/portal-api/generate", `{"prompt":"hi","mode":"chat"}`, c, a.origin)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "hello") {
		t.Fatal(w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), a.key) {
		t.Fatal("key leaked")
	}
}
func TestLimitAndRoutes(t *testing.T) {
	a := testApp(t)
	for i := 0; i < 10; i++ {
		request(a, "POST", "/portal-api/login", `{"password":"wrong"}`, nil, a.origin)
	}
	if w := request(a, "POST", "/portal-api/login", `{}`, nil, a.origin); w.Code != 429 {
		t.Fatal("rate limit absent")
	}
	for _, p := range []string{"/", "/chat/", "/tools/", "/read/", "/lab/", "/status/", "/quota/", "/portal-assets/app.js"} {
		w := request(a, "GET", p, "", nil, "")
		if w.Code != 200 {
			t.Fatal(p, w.Code)
		}
	}
	for _, p := range []string{"/v1/models", "/.env", "/portal-assets/../../main.go"} {
		if w := request(a, "GET", p, "", nil, ""); w.Code != 404 {
			t.Fatal("unowned path served", p)
		}
	}
}
func TestSessionsPersistAndExpire(t *testing.T) {
	a := testApp(t)
	c := loginCookie(t, a)
	a.db.Exec("UPDATE sessions SET expires=?", time.Now().Add(-time.Hour).Unix())
	if a.authenticated(&http.Request{Header: http.Header{"Cookie": {c.String()}}}) {
		t.Fatal("expired accepted")
	}
}
func TestUpstreamFailureDoesNotExposeResponse(t *testing.T) {
	a := testApp(t)
	a.key = "secret"
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		io.Copy(w, bytes.NewBufferString(`{"error":"secret-token-and-internal-host"}`))
	}))
	defer up.Close()
	a.upstream = up.URL
	c := loginCookie(t, a)
	w := request(a, "POST", "/portal-api/generate", `{"prompt":"hi","mode":"chat"}`, c, a.origin)
	if w.Code != 502 || strings.Contains(w.Body.String(), "secret-token") {
		t.Fatal("upstream error leaked")
	}
	_, _, _ = a.upstreamRequest(context.Background(), "/v1/models", nil)
}

func TestGeneratedImagesArePrivateAndPersistent(t *testing.T) {
	a := testApp(t)
	a.key = "test-key"
	t.Setenv("PORTAL_DB", filepath.Join(t.TempDir(), "portal.db"))
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII="}]}`)
	}))
	defer up.Close()
	a.upstream = up.URL
	c := loginCookie(t, a)
	w := request(a, "POST", "/portal-api/generate", `{"mode":"image","prompt":"leaf"}`, c, a.origin)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var out struct {
		Images []struct {
			URL string `json:"url"`
		} `json:"images"`
	}
	json.Unmarshal(w.Body.Bytes(), &out)
	if len(out.Images) != 1 {
		t.Fatal("missing image")
	}
	if got := request(a, "GET", out.Images[0].URL, "", nil, ""); got.Code != 401 {
		t.Fatal("image accessible without login")
	}
	got := request(a, "GET", out.Images[0].URL, "", c, "")
	if got.Code != 200 || got.Header().Get("Content-Type") != "image/png" {
		t.Fatal("image not persisted", got.Code)
	}
}
