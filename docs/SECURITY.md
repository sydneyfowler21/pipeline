# Security notes

## Client IP

The server does not trust the leftmost `X-Forwarded-For` value. A client can set that hop before the request reaches a proxy, which would mint a new per-IP rate-limit bucket and forge the address stored on sessions and sign-in history.

`TRUSTED_PROXY_HOPS` is how many reverse proxies append the peer they saw. The client address is that many entries from the right. The default is 1, which matches Render's one proxy. `render.yaml` sets it explicitly. If the header is shorter than that, or the chosen entry is not an IP, the socket remote address is used instead. `TRUSTED_PROXY_HOPS=0` ignores `X-Forwarded-For` entirely and uses the socket. That is the local and test setting.

Login, signup, password-reset, and demo rate limits, plus session rows and `auth_events`, all call this helper. There is no second reader of `X-Forwarded-For` or `X-Real-IP`.

Login limits are keyed three ways: trusted IP, account plus trusted IP, and account with no IP in the key. The last one stays in force when the address changes, so rotating IPs cannot buy unlimited attempts on one account.

## Login failures and lockout

Failure responses are deliberately generic for no-enumeration. A locked account, a wrong password, and an unknown email all return HTTP 401 with the body `{"error":"Email or password is incorrect."}`. The body has no `retryAfterSeconds`, and the status, body, and headers match across those three cases. An unknown email still runs argon2id verify against a dummy hash.

The lock starts at 5 failures: 1 minute, then doubling, capped at 1 hour. When a lock starts, the server emails that account's owner once. Later attempts during the same lock do not send another message. A new lock, after the previous one has expired, sends one email again. The message says the account was temporarily locked, the unlock time in the user's time zone, a one-time reset-password link, and the IP and device from the trusted-hop helper. Unknown emails get no mail.

The sign-in screen is owned by the client, not this API. After a few failed attempts it may show one hint, identical for every email: "Having trouble? Reset your password, or check your email."
