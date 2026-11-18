package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Only a configured, directly connected proxy may supply the normalized header.
// HAProxy overwrites this header and accepts Cloudflare IP headers only from its
// published edge ranges. X-Forwarded-For is deliberately not trusted here.
func (a *app) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	peer = peer.Unmap()
	for _, prefix := range a.trustedProxies {
		if prefix.Contains(peer) {
			if ip, err := netip.ParseAddr(r.Header.Get("X-Portal-Client-IP")); err == nil {
				return ip.Unmap().String()
			}
		}
	}
	return peer.String()
}
func (a *app) securityEvent(event, ip string) {
	if a.securityLog != nil {
		a.securityLog.Printf("portal_security event=%s ip=%s", event, ip)
	}
}
func (a *app) configureSecurity() error {
	for _, item := range strings.Split(os.Getenv("PORTAL_TRUSTED_PROXIES"), ",") {
		if strings.TrimSpace(item) == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(strings.TrimSpace(item))
		if err != nil {
			return fmt.Errorf("invalid trusted proxy CIDR")
		}
		a.trustedProxies = append(a.trustedProxies, prefix)
	}
	dir := filepath.Join(filepath.Dir(env("PORTAL_DB", "portal.db")), "security")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(dir, "auth.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	a.securityLog = log.New(f, "", log.Ldate|log.Ltime|log.LUTC)
	return nil
}
func securityCommand() bool {
	if len(os.Args) < 2 || (os.Args[1] != "security-ban" && os.Args[1] != "security-unban") {
		return false
	}
	if len(os.Args) < 3 {
		log.Fatal("IP address required")
	}
	ip, err := netip.ParseAddr(os.Args[2])
	if err != nil {
		log.Fatal("invalid IP address")
	}
	db, err := openDB(env("PORTAL_DB", "portal.db"))
	if err != nil {
		log.Fatal("cannot open security database")
	}
	defer db.Close()
	if os.Args[1] == "security-unban" {
		_, err = db.Exec("DELETE FROM login_bans WHERE ip=?", ip.Unmap().String())
	} else {
		if len(os.Args) != 4 {
			log.Fatal("ban duration required")
		}
		seconds, e := strconv.Atoi(os.Args[3])
		if e != nil || seconds < 1 || seconds > 604800 {
			log.Fatal("invalid ban duration")
		}
		_, err = db.Exec("INSERT INTO login_bans(ip,expires) VALUES(?,?) ON CONFLICT(ip) DO UPDATE SET expires=max(expires,excluded.expires)", ip.Unmap().String(), time.Now().Unix()+int64(seconds))
		if err == nil {
			_, err = db.Exec("DELETE FROM login_bans WHERE expires<?", time.Now().Unix())
		}
	}
	if err != nil {
		log.Fatal("security database update failed")
	}
	return true
}
