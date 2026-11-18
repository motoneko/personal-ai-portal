package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/netip"
	"os"
	"strings"
	"time"
)

func issueRecovery(db *sql.DB, ip string, now int64) (string, error) {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return "", err
	}
	ip = addr.Unmap().String()
	var ban int64
	if err = db.QueryRow("SELECT expires FROM login_bans WHERE ip=? AND expires>?", ip, now).Scan(&ban); err != nil {
		return "", err
	}
	expires := now + 1800
	if ban < expires {
		expires = ban
	}
	raw := token()
	_, err = db.Exec("INSERT INTO login_recovery VALUES(?,?,?,?,?,?,?)", digest(raw), ip, ban, expires, "ready", now, now)
	if err != nil {
		return "", err
	}
	db.Exec("DELETE FROM login_recovery WHERE expires<?", now-86400)
	return raw, nil
}
func (a *app) recovery(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		fail(w, 405, "请通过邮件链接打开确认页面")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	var in struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Token) != 64 {
		fail(w, 410, "链接无效或已过期")
		return
	}
	id := digest(in.Token)
	now := time.Now().Unix()
	if strings.HasSuffix(r.URL.Path, "/redeem") {
		_, err := a.db.Exec(`UPDATE login_recovery SET status='pending',updated=? WHERE id=? AND status='ready' AND expires>? AND EXISTS(SELECT 1 FROM login_bans b WHERE b.ip=login_recovery.ip AND b.expires=login_recovery.ban_expiry AND b.expires>?)`, now, id, now, now)
		if err != nil {
			fail(w, 503, "暂时无法处理解封申请")
			return
		}
	}
	var ip, status string
	var expires, ban int64
	err := a.db.QueryRow("SELECT ip,status,expires,ban_expiry FROM login_recovery WHERE id=?", id).Scan(&ip, &status, &expires, &ban)
	if err == sql.ErrNoRows || expires <= now {
		fail(w, 410, "链接无效或已过期")
		return
	}
	if err != nil {
		fail(w, 503, "暂时无法读取申请")
		return
	}
	if status == "ready" {
		var current int64
		if err := a.db.QueryRow("SELECT expires FROM login_bans WHERE ip=?", ip).Scan(&current); err != nil || current != ban {
			fail(w, 410, "此次封禁已解除或发生变化，旧链接已失效")
			return
		}
	}
	jsonOut(w, 200, map[string]any{"ip": ip, "status": status, "expires": expires})
}

// Host-only commands. Tokens are delivered via captured stdout to the email
// sender, never written to logs; the database stores only their SHA-256 digest.
func recoveryCommand() bool {
	if len(os.Args) < 2 || !strings.HasPrefix(os.Args[1], "security-recovery-") {
		return false
	}
	db, err := openDB(env("PORTAL_DB", "portal.db"))
	if err != nil {
		log.Fatal("cannot open recovery database")
	}
	defer db.Close()
	now := time.Now().Unix()
	cmd := os.Args[1]
	if cmd == "security-recovery-jobs" {
		db.Exec("UPDATE login_recovery SET status='failed' WHERE status='processing' AND updated<?", now-120)
		db.Exec("UPDATE login_recovery SET status='expired' WHERE status='pending' AND expires<=?", now)
		rows, e := db.Query("SELECT id FROM login_recovery WHERE status='pending' AND expires>? ORDER BY created LIMIT 1", now)
		if e != nil {
			log.Fatal("cannot read recovery jobs")
		}
		defer rows.Close()
		ids := []string{}
		for rows.Next() {
			var id string
			if e := rows.Scan(&id); e != nil {
				log.Fatal("invalid recovery job")
			}
			ids = append(ids, id)
		}
		json.NewEncoder(os.Stdout).Encode(ids)
		return true
	}
	if len(os.Args) != 3 {
		log.Fatal("recovery argument required")
	}
	arg := os.Args[2]
	if cmd == "security-recovery-token" {
		raw, e := issueRecovery(db, arg, now)
		if e != nil {
			fmt.Println("{}")
			return true
		}
		json.NewEncoder(os.Stdout).Encode(map[string]string{"token": raw})
		return true
	}
	if len(arg) != 64 {
		log.Fatal("invalid recovery id")
	}
	switch cmd {
	case "security-recovery-claim":
		res, e := db.Exec(`UPDATE login_recovery SET status='processing',updated=? WHERE id=? AND status='pending' AND expires>? AND EXISTS(SELECT 1 FROM login_bans b WHERE b.ip=login_recovery.ip AND b.expires=login_recovery.ban_expiry AND b.expires>?)`, now, arg, now, now)
		if e != nil {
			log.Fatal("cannot claim recovery")
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			db.Exec("UPDATE login_recovery SET status='expired' WHERE id=? AND status='pending'", arg)
			fmt.Println("{}")
			return true
		}
		var ip string
		if e := db.QueryRow("SELECT ip FROM login_recovery WHERE id=?", arg).Scan(&ip); e != nil {
			log.Fatal("cannot read recovery")
		}
		json.NewEncoder(os.Stdout).Encode(map[string]string{"ip": ip})
	case "security-recovery-apply":
		_, err = db.Exec(`DELETE FROM login_bans WHERE ip=(SELECT ip FROM login_recovery WHERE id=? AND status='processing') AND expires=(SELECT ban_expiry FROM login_recovery WHERE id=? AND status='processing')`, arg, arg)
	case "security-recovery-fail":
		_, err = db.Exec("UPDATE login_recovery SET status='failed',updated=? WHERE id=? AND status='processing'", now, arg)
	case "security-recovery-finish":
		var ip, status string
		var ban int64
		err = db.QueryRow("SELECT ip,status,ban_expiry FROM login_recovery WHERE id=?", arg).Scan(&ip, &status, &ban)
		if err != nil {
			log.Fatal("unknown recovery")
		}
		if status == "processing" {
			var current int64
			e := db.QueryRow("SELECT expires FROM login_bans WHERE ip=?", ip).Scan(&current)
			if e == sql.ErrNoRows || (e == nil && current <= now) {
				status = "done"
			} else if e != nil {
				log.Fatal("cannot verify recovery")
			} else if current != ban {
				status = "failed"
			}
			if status != "processing" {
				_, err = db.Exec("UPDATE login_recovery SET status=?,updated=? WHERE id=?", status, now, arg)
			}
		}
		json.NewEncoder(os.Stdout).Encode(map[string]string{"status": status})
	default:
		log.Fatal("unknown recovery command")
	}
	if err != nil {
		log.Fatal("recovery state update failed")
	}
	return true
}
