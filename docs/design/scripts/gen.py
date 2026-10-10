import os
HEAD = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s · pipeline</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
<script>
tailwind.config={theme:{extend:{fontFamily:{sans:['Geist','system-ui','sans-serif'],mono:['Geist Mono','ui-monospace','monospace']},
colors:{canvas:'var(--canvas)',surface:'var(--surface)',subtle:'var(--subtle)',hov:'var(--hover)',line:'var(--border)',edge:'var(--edge)',
ink:'var(--ink)',muted:'var(--muted)',faint:'var(--faint)',accent:'var(--accent)',accenth:'var(--accent-hover)',accentp:'var(--accent-pressed)',
tint:'var(--accent-tint)',danger:'var(--danger)',dangertint:'var(--danger-tint)',success:'var(--success)',successtint:'var(--success-tint)',warn:'var(--warn)',warntint:'var(--warn-tint)'},
boxShadow:{e1:'0 1px 2px rgba(23,23,28,.06),0 1px 1px rgba(23,23,28,.04)',e2:'0 4px 12px -2px rgba(23,23,28,.10),0 2px 4px rgba(23,23,28,.05)',e3:'0 24px 48px -12px rgba(23,23,28,.28)'}}}}
</script>
<style>
:root{--canvas:#F7F7F5;--surface:#FFFFFF;--subtle:#EFEFEB;--hover:#F2F1FC;--border:#DAD9D3;--edge:#85837A;--ink:#17171C;--muted:#5A5952;--faint:#6E6D66;
--accent:#4F3CC9;--accent-hover:#3F2EB0;--accent-pressed:#33248F;--accent-tint:#EEEBFC;--danger:#B42318;--danger-tint:#FDECEA;--success:#1E7A46;--success-tint:#E7F5EC;--warn:#8A5A00;--warn-tint:#FDF3DC}
body{font-family:Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 0}
.num{font-variant-numeric:tabular-nums}
.pin{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;background:#E2136E;color:#fff;font:600 11px/1 Geist,sans-serif;box-shadow:0 0 0 2px #fff;flex:none;vertical-align:middle}
.ring-f{outline:2px solid var(--accent);outline-offset:2px}
.chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px 0 7px;border-radius:999px;font-size:12.5px;font-weight:550;border:1px solid;white-space:nowrap}
.chip svg{width:13px;height:13px;stroke-width:2.25}
.st-Applied{background:#F0F1F5;color:#3A4256;border-color:#5B647A55}.st-Screen{background:#E6F1FB;color:#0B4F80;border-color:#1C6FB055}
.st-Interview{background:#FBEFE2;color:#7A3E06;border-color:#B4610F55}.st-Offer{background:#E5F5EC;color:#14603A;border-color:#1F8A5355}
.st-Closed{background:#F3F2F0;color:#55534D;border:1px dashed #8C8A83}
.dot-Applied{background:#5B647A}.dot-Screen{background:#1C6FB0}.dot-Interview{background:#B4610F}.dot-Offer{background:#1F8A53}.dot-Closed{background:#8C8A83}
.bar-Applied{background:#5B647A}.bar-Screen{background:#1C6FB0}.bar-Interview{background:#B4610F}.bar-Offer{background:#1F8A53}.bar-Closed{background:repeating-linear-gradient(135deg,#8C8A83 0 4px,#B9B7B0 4px 7px)}
.sk{background:linear-gradient(90deg,#EFEFEB 0%%,#F7F7F5 50%%,#EFEFEB 100%%);border-radius:6px}
.anno{border-top:1px dashed #E2136E66}
</style></head><body class="bg-canvas text-ink">
"""
TAIL = "<script>lucide.createIcons();document.querySelectorAll('[aria-pressed=true]').forEach(e=>{const p=e.parentElement;p.scrollLeft=e.offsetLeft-p.clientWidth/2+e.clientWidth/2});</script></body></html>"
ICON = dict(Applied='send',Screen='phone',Interview='users',Offer='badge-check',Closed='archive')
def ic(n,c='w-4 h-4'): return f'<i data-lucide="{n}" class="{c}"></i>'
def chip(s): return f'<span class="chip st-{s}">{ic(ICON[s])}{s}</span>'
def pin(n): return f'<span class="pin">{n}</span>'

def logo(sz='text-[17px]'):
    return f'''<a class="flex items-center gap-2 font-semibold tracking-tight {sz}"><span class="grid place-items-center w-7 h-7 rounded-lg bg-ink text-white"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h7M4 12h11M4 17h16"/><circle cx="15" cy="7" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></span>pipeline</a>'''

def shell(body, demo=True, active='Applications'):
    nav = ''.join(f'<a class="h-11 px-3 inline-flex items-center rounded-md text-[14px] font-medium {"text-ink bg-subtle" if n==active else "text-muted hover:text-ink"}" {"aria-current=page" if n==active else ""}>{n}</a>' for n in ['Applications','Settings'])
    banner = f'''<div class="bg-warntint text-warn text-[13px] border-b border-[#E9D6A8]"><div class="max-w-[1200px] mx-auto px-4 sm:px-8 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"><span class="inline-flex items-center gap-1.5 font-medium">{ic("flask-conical","w-4 h-4")}Demo account</span><span class="text-[#6E4700]">Sample data, deleted in 23 h. Email and password can't be changed.</span><a class="ml-auto underline underline-offset-2 font-medium min-h-[32px] inline-flex items-center">Create your own account</a></div></div>''' if demo else ''
    return f'''{banner}<header class="bg-surface border-b border-line"><div class="max-w-[1200px] mx-auto h-16 px-4 sm:px-8 flex items-center gap-6">{logo()}<nav class="hidden md:flex gap-1">{nav}</nav>
<button class="ml-auto h-11 pl-1 pr-2 inline-flex items-center gap-2 rounded-full border border-line hover:border-edge" aria-label="Account menu"><span class="w-8 h-8 rounded-full bg-tint text-accent grid place-items-center text-[13px] font-semibold">AD</span><span class="hidden sm:inline text-[13.5px] text-muted">alex.demo@example.test</span>{ic("chevron-down","w-4 h-4 text-muted")}</button></div></header>
<nav class="md:hidden bg-surface border-b border-line px-2 flex">{''.join(f'<a class="flex-1 h-11 grid place-items-center text-[14px] font-medium {"text-ink shadow-[inset_0_-2px_0_var(--ink)]" if n==active else "text-muted"}">{n}</a>' for n in ['Applications','Settings'])}</nav>
<main class="max-w-[1200px] mx-auto px-4 sm:px-8 py-6 sm:py-10">{body}</main>'''

def notes(title, items):
    li=''.join(f'<li class="flex gap-3">{pin(i+1) if not str(t).startswith("•") else "<span class=w-5></span>"}<span>{str(t).lstrip("•")}</span></li>' for i,t in enumerate(items))
    return f'''<section class="anno mt-10 bg-white"><div class="max-w-[1200px] mx-auto px-4 sm:px-8 py-6"><p class="text-[11px] font-semibold tracking-[.12em] uppercase text-[#B0105A]">Annotations · {title}</p><ol class="mt-3 grid md:grid-cols-2 gap-x-10 gap-y-2.5 text-[13px] leading-5 text-[#3d3d44]">{li}</ol></div></section>'''

BTN_P='h-11 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-white text-[14px] font-medium shadow-e1 hover:bg-accenth active:bg-accentp'
BTN_S='h-11 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-surface border border-edge text-ink text-[14px] font-medium hover:bg-hov'
BTN_G='h-11 px-3 inline-flex items-center justify-center gap-2 rounded-lg text-ink text-[14px] font-medium hover:bg-subtle'
INP='h-11 w-full rounded-lg border border-edge bg-surface px-3 text-base sm:text-[15px] placeholder:text-faint'
def field(label,val='',ph='',hint='',err='',req=False,typ='text',extra='',focus=False):
    b = 'border-danger ring-1 ring-danger' if err else ('ring-f border-accent' if focus else '')
    msg = f'<p class="mt-1.5 text-[13px] text-danger flex gap-1.5">{ic("circle-alert","w-4 h-4 mt-px flex-none")}{err}</p>' if err else (f'<p class="mt-1.5 text-[13px] text-muted">{hint}</p>' if hint else '')
    v = f'value="{val}"' if val else ''
    return f'''<label class="block"><span class="text-[14px] font-medium">{label}{' <span class="text-muted font-normal">(required)</span>' if req else ''}</span>{extra}
<input type="{typ}" {v} placeholder="{ph}" class="{INP} mt-1.5 {b}" {'aria-invalid="true"' if err else ''}>{msg}</label>'''

APPS=[('Globex','Software Engineer II','Applied',19,'Notes edited · Oct 8','G','#0E7490'),
('Northwind Labs','Full-Stack Engineer','Interview',3,'Moved to Interview · Oct 6','N','#7C3AED'),
('Initech','Platform Engineer','Screen',7,'Moved to Screen · Oct 2','I','#B45309'),
('Acme Robotics','Frontend Engineer','Offer',25,'Moved to Offer · Sep 14','A','#BE123C'),
('Hooli','Senior Frontend Engineer','Closed',29,'Moved to Closed · Sep 10','H','#475569')]
def mono(l,c,s='w-10 h-10 text-[15px]'): return f'<span class="{s} rounded-lg grid place-items-center font-semibold text-white flex-none" style="background:{c}">{l}</span>'

def list_header(count='5 applications', disabled=False):
    return f'''<div class="flex flex-wrap items-end gap-4 justify-between"><div><h1 class="text-[26px] sm:text-[30px] font-semibold tracking-tight">Applications</h1><p class="text-muted text-[14px] mt-1">{count} · sorted by last activity</p></div>
<button class="{BTN_P}">{ic("plus")}Add application</button></div>'''

def toolbar(q='',act='All'):
    filt=''.join(f'<button class="h-11 sm:h-9 px-3 rounded-full border text-[13px] font-medium inline-flex items-center gap-1.5 {"bg-ink text-white border-ink" if s==act else "bg-surface border-edge hover:bg-hov"}" aria-pressed="{"true" if s==act else "false"}">{"" if s=="All" else f"<span class=\'w-2 h-2 rounded-full dot-{s}\'></span>"}{s}<span class="num {"text-white/75" if s==act else "text-muted"}">{0 if q else n}</span></button>' for s,n in [('All',5),('Applied',1),('Screen',1),('Interview',1),('Offer',1),('Closed',1)])
    return f'''<div class="mt-6 flex flex-col lg:flex-row gap-3 lg:items-center"><div class="relative lg:w-80">{ic("search","w-4 h-4 absolute left-3 top-3.5 text-muted")}<input class="{INP} pl-9" placeholder="Search company or role" value="{q}" aria-label="Search applications">{f'<button class="absolute right-0 top-0 w-11 h-11 grid place-items-center text-muted hover:text-ink" aria-label="Clear search">{ic("x")}</button>' if q else ''}</div>
<div class="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1" role="group" aria-label="Filter by stage">{filt}</div></div>'''

def cards_only(rows):
    out=''
    for (co,ro,st,d,la,l,c) in rows:
        out+=f'<div class="flex gap-3 p-4 border-t border-line first:border-t-0">{mono(l,c)}<span class="min-w-0 flex-1"><span class="block font-semibold text-[15px] truncate">{co}</span><span class="block text-[13.5px] text-muted truncate">{ro}</span><span class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">{chip(st)}<span class="num text-[13px]">{d} days</span><span class="text-[12.5px] text-muted">{la.split(" · ")[1]}</span></span></span></div>'
    return f'<div class="mt-5 bg-surface border border-line rounded-xl shadow-e1 overflow-hidden">{out}</div>'
def table(rows, hover=1, focus=None):
    trs=''
    for i,(co,ro,st,d,la,l,c) in enumerate(rows):
        state = 'bg-hov shadow-[inset_3px_0_0_var(--accent)]' if i==hover else ''
        f = ' ring-f relative z-10' if i==focus else ''
        trs+=f'''<a class="group grid grid-cols-[minmax(0,1.6fr)_150px_120px_minmax(0,1.1fr)_28px] items-center gap-4 px-5 min-h-[68px] border-t border-line first:border-t-0 cursor-pointer {state}{f}">
<span class="flex items-center gap-3 min-w-0">{mono(l,c)}<span class="min-w-0"><span class="block font-semibold text-[15px] truncate {'underline underline-offset-2' if i==hover else ''}">{co}</span><span class="block text-[13.5px] text-muted truncate">{ro}</span></span></span>
<span>{chip(st)}</span><span class="num text-[14px]">{d} days</span><span class="text-[13.5px] text-muted truncate">{la}</span>{ic("chevron-right","w-5 h-5 text-muted group-hover:text-ink")}</a>'''
    cards=''
    for i,(co,ro,st,d,la,l,c) in enumerate(rows):
        cards+=f'''<a class="flex gap-3 p-4 border-t border-line first:border-t-0 {'bg-hov' if i==hover else ''}">{mono(l,c)}<span class="min-w-0 flex-1"><span class="flex items-start gap-2"><span class="min-w-0 flex-1"><span class="block font-semibold text-[15px] truncate">{co}</span><span class="block text-[13.5px] text-muted truncate">{ro}</span></span>{ic("chevron-right","w-5 h-5 text-muted mt-0.5")}</span>
<span class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">{chip(st)}<span class="num text-[13px]">{d} days</span><span class="text-[12.5px] text-muted">{la.split(" · ")[1]}</span></span></span></a>'''
    head='<div class="grid grid-cols-[minmax(0,1.6fr)_150px_120px_minmax(0,1.1fr)_28px] gap-4 px-5 h-10 items-center text-[12px] font-medium uppercase tracking-[.06em] text-muted bg-subtle/60 border-b border-line"><span>Company · role</span><span>Stage</span><span>In stage</span><span>Last activity ↓</span><span></span></div>'
    return f'''<div class="mt-5 bg-surface border border-line rounded-xl shadow-e1 overflow-hidden"><div class="hidden md:block">{head}{trs}</div><div class="md:hidden">{cards}</div></div>'''

S={}
# ---------- auth pages
def auth_wrap(card, side=True):
    pitch = f'''<div class="hidden lg:flex flex-col justify-between p-12 bg-ink text-white rounded-2xl relative overflow-hidden"><div>{logo().replace("bg-ink text-white","bg-white text-ink")}</div>
<div><p class="text-[13px] uppercase tracking-[.14em] text-white/60">Job search, with receipts</p><h2 class="mt-3 text-[34px] leading-[1.15] font-semibold tracking-tight max-w-[440px]">Every stage you've been through, and how long each one took.</h2>
<div class="mt-8 bg-white text-ink rounded-xl p-4 max-w-[420px] shadow-e3"><div class="flex items-center gap-3">{mono('A','#BE123C','w-9 h-9 text-[14px]')}<div><p class="font-semibold text-[14px]">Acme Robotics</p><p class="text-[12.5px] text-muted">Frontend Engineer</p></div><span class="ml-auto">{chip('Offer')}</span></div>
<div class="mt-4 flex h-2.5 rounded-full overflow-hidden gap-0.5"><span class="bar-Applied" style="width:10%"></span><span class="bar-Screen" style="width:13%"></span><span class="bar-Interview" style="width:7%"></span><span class="bar-Screen" style="width:10%"></span><span class="bar-Interview" style="width:20%"></span><span class="bar-Offer" style="width:40%"></span></div>
<p class="mt-2 text-[12px] text-muted">6 stage changes · Screen and Interview revisited · 67 days</p></div></div>
<p class="text-[13px] text-white/60">Append-only history. Fictional demo data.</p></div>'''
    return f'''<div class="min-h-[860px] max-lg:min-h-0 p-4 sm:p-6 grid lg:grid-cols-[1fr_1fr] gap-6 max-w-[1320px] mx-auto"><div class="flex flex-col"><div class="lg:hidden py-2">{logo()}</div><div class="flex-1 grid place-items-center py-8 lg:py-0">{card}</div>
<p class="text-center text-[12.5px] text-muted pb-2">A portfolio project · <a class="underline underline-offset-2">Source on GitHub</a></p></div>{pitch}</div>'''

def signin():
    card=f'''<div class="w-full max-w-[400px]"><h1 class="text-[28px] font-semibold tracking-tight">Track a job search the honest way</h1><p class="mt-2 text-muted text-[15px]">See every stage an application went through and how many days each one took.</p>
<button class="{BTN_P} w-full mt-7 h-12 text-[15px]">{ic("play")}Try the demo {pin(1)}</button><p class="mt-2 text-[13px] text-muted text-center">No sign-up. Sample data, deleted after 24 hours.</p>
<div class="my-7 flex items-center gap-3 text-[12.5px] text-muted"><span class="h-px flex-1 bg-line"></span>or sign in<span class="h-px flex-1 bg-line"></span></div>
<div role="alert" class="mb-4 rounded-lg bg-dangertint text-danger text-[14px] px-3 py-2.5 flex gap-2">{ic("circle-alert","w-4 h-4 mt-0.5 flex-none")}<span>Email or password is incorrect. {pin(2)}</span></div>
<div class="space-y-4">{field("Email","alex@example.test",typ="email")}
<div>{field("Password","••••••••••••••",typ="password",extra='<a class="float-right text-[13.5px] text-accent underline underline-offset-2 min-h-[24px]">Forgot password?</a>')}</div></div>
<button class="{BTN_S} w-full mt-5">Sign in</button><p class="mt-5 text-center text-[14px] text-muted">New here? <a class="text-accent font-medium underline underline-offset-2">Create an account</a> {pin(3)}</p></div>'''
    return auth_wrap(card)+notes("Landing / sign in",[
    "<b>Try the demo</b> is the primary button and the first focus stop after the skip link. Pressed: label becomes “Setting up your demo…” with a spinner, button disabled (aria-busy). Failure: inline alert “Couldn't start the demo. Try again.” — no navigation.",
    "No user enumeration (SPEC): one message for wrong email, wrong password, or unknown user. Lockout reads “Too many attempts. Try again in 1 minute.” with the remaining time; fields stay filled except password.",
    "Sign in is secondary on this page on purpose: the audience is a hiring manager with no account. Enter submits the form.",
    "Right panel (≥1024px only) sells the idea with a real-looking stage strip from the demo data. Hidden on mobile so Try the demo sits above the fold at 390×844.",
    "Lockout and rate-limit states disable Sign in with a visible reason under the button, not just a greyed control."])

def signup():
    card=f'''<div class="w-full max-w-[400px]"><h1 class="text-[28px] font-semibold tracking-tight">Create your account</h1><p class="mt-2 text-muted text-[15px]">We'll email a link to confirm your address.</p>
<div class="mt-7 space-y-4">{field("Email","jordan@example.test",typ="email",req=True)}
{field("Password","correct horse",typ="password",req=True,err="Use at least 12 characters. This one has 11.",focus=False)}
<div class="-mt-1 flex items-center gap-2 text-[13px] text-muted">{pin(1)}<span>12–128 characters. We also check it isn't in a known data breach.</span></div>
{field("Confirm password",typ="password",req=True)}</div>
<p class="mt-4 text-[13px] text-muted flex gap-2">{ic("globe","w-4 h-4 mt-0.5 flex-none")}<span>Time zone: America/Denver, from your browser. You can change it in Settings. {pin(3)}</span></p>
<button class="{BTN_P} w-full mt-6">Create account</button>
<div class="mt-4 rounded-lg border border-line bg-subtle/60 p-3 text-[13px] text-muted flex gap-2">{ic("shield-alert","w-4 h-4 mt-0.5 flex-none text-warn")}<span>{pin(2)} Breached password example: “This password has appeared in a data breach. Choose a different one.”</span></div>
<p class="mt-5 text-center text-[14px] text-muted">Already have an account? <a class="text-accent font-medium underline underline-offset-2">Sign in</a> · <a class="text-accent font-medium underline underline-offset-2">Try the demo</a></p></div>'''
    return auth_wrap(card)+notes("Sign up",[
    "Length rule is shown before typing and validated on blur and submit, never per keystroke. Max 128 enforced with a message, not a silent maxlength.",
    "HIBP result comes from the server on submit. If HIBP is down the API fails open (SPEC); the UI says nothing.",
    "After submit, always the same screen: “If that email can be used, we've sent a link.” (no enumeration) → Verify email screen.",
    "Submit button: pressed shows spinner + “Creating account…”, disabled while pending. Server error keeps every field except passwords.",
    "Time zone is read from the browser (Intl.DateTimeFormat().resolvedOptions().timeZone) and sent with sign-up; falls back to America/Denver if missing or not a valid IANA name.","Show/hide password toggle (eye icon, 44px) is part of the Password input component; omitted here for clarity."])

def verify():
    card=f'''<div class="w-full max-w-[420px]"><span class="w-12 h-12 rounded-xl bg-tint text-accent grid place-items-center">{ic("mail-check","w-6 h-6")}</span>
<h1 class="mt-5 text-[28px] font-semibold tracking-tight">Check your email</h1><p class="mt-2 text-muted text-[15px] leading-6">If that email can be used, we've sent a link to <b class="text-ink font-medium">jordan@example.test</b>. Open it to confirm your address. {pin(1)}</p>
<div class="mt-6 rounded-lg border border-line bg-surface p-4 text-[14px]"><p class="font-medium">Didn't get it?</p><p class="text-muted mt-1">Check spam, or send it again.</p>
<button class="{BTN_S} mt-3" disabled aria-disabled="true" style="opacity:.55;cursor:not-allowed">{ic("rotate-cw")}Resend link</button><p class="mt-2 text-[13px] text-muted">You can resend in 0:42. {pin(2)}</p></div>
<div class="mt-6 rounded-lg bg-successtint text-success p-3 text-[14px] flex gap-2">{ic("circle-check","w-4 h-4 mt-0.5 flex-none")}<span><b>Email confirmed.</b> You can add applications now. {pin(3)}</span></div>
<p class="mt-6 text-[14px] text-muted">You can sign in before confirming, but you can't add applications until you do. <a class="text-accent underline underline-offset-2">Continue to app</a></p></div>'''
    return auth_wrap(card)+notes("Verify email",[
    "Copy never confirms whether the address exists (SPEC no-enumeration).",
    "Resend is disabled with a visible countdown reason (rate limit). Not a silent grey button.",
    "Success state after the link is opened (route /verify?token=…). Expired/used link: “This link has expired or was already used.” + Resend.",
    "Unverified users inside the app see a persistent banner “Confirm your email to add applications · Resend link”, and Add application is disabled with that reason as a tooltip and helper text."])

def forgot():
    a=f'''<div class="w-full max-w-[400px]"><a class="text-[14px] text-muted inline-flex items-center gap-1 min-h-[44px]">{ic("arrow-left")}Back to sign in</a><h1 class="mt-3 text-[28px] font-semibold tracking-tight">Reset your password</h1><p class="mt-2 text-muted text-[15px]">Enter your email and we'll send a reset link. It works once and expires in 30 minutes.</p>
<div class="mt-6">{field("Email","alex@example.test",typ="email",focus=True)}</div><button class="{BTN_P} w-full mt-5">Send reset link</button>
<div class="mt-5 rounded-lg bg-successtint text-success p-3 text-[14px] flex gap-2">{ic("circle-check","w-4 h-4 mt-0.5 flex-none")}<span>If that email can be used, we've sent a link. {pin(1)}</span></div></div>'''
    return auth_wrap(a)+notes("Forgot password",["Same message whether or not the account exists. Shown after submit replacing the button area; the field stays filled so the user can spot a typo.","Rate limited per IP and account: “Too many requests. Try again in a few minutes.” Demo accounts get the same generic message (they can't reset)."])

def reset():
    a=f'''<div class="w-full max-w-[400px]"><h1 class="text-[28px] font-semibold tracking-tight">Choose a new password</h1><p class="mt-2 text-muted text-[15px]">For alex@example.test</p>
<div class="mt-6 space-y-4">{field("New password","••••••••••••••••",typ="password",hint="12–128 characters, not found in a known data breach.")}{field("Confirm new password","••••••••••••••",typ="password",err="Passwords don't match.")}</div>
<div class="mt-4 rounded-lg border border-line bg-subtle/60 p-3 text-[13.5px] text-muted flex gap-2">{ic("log-out","w-4 h-4 mt-0.5 flex-none")}<span>{pin(1)} Saving signs you out on every device, including this one. You'll sign in again with the new password.</span></div>
<button class="{BTN_P} w-full mt-5">Save password</button>
<div class="mt-5 rounded-lg bg-dangertint text-danger p-3 text-[14px] flex gap-2">{ic("link-2-off","w-4 h-4 mt-0.5 flex-none")}<span>{pin(2)} This link has expired or was already used. <a class="underline font-medium">Send a new link</a></span></div></div>'''
    return auth_wrap(a)+notes("Reset password",["Reset revokes all sessions (SPEC) — said before the action, not after.","Invalid/expired/used token state replaces the form entirely (shown below it here for the mock). Success → sign-in page with “Password changed. Sign in with your new password.”"])

# ---------- list
def lst():
    return shell(list_header()+toolbar()+table(APPS)+f'''<p class="mt-3 text-[13px] text-muted flex items-center gap-2">{pin(1)} Row 2 shows hover: tint + 3px accent edge + underlined company. {pin(2)} Whole row is one link (44px+).</p>''')+notes("Application list",[
    "Hover is never fill-only: tint fill + 3px inset accent edge (7.44:1 on white) + company underline. Pressed: accent-tint fill. Focus-visible: 2px accent outline, offset 2px.",
    "Row = one &lt;a&gt; to the detail page; min height 68px desktop, card ≥ 88px mobile. Chevron darkens on hover.",
    "Sort is fixed: last activity = greatest(latest event, updated_at), newest first (SPEC). Column header shows ↓ but is not a control in slice 1.",
    "Last activity names its source: “Moved to Interview · Oct 6” or “Notes edited · Oct 8” (Globex, fixture A3) so the order never looks wrong.",
    "Stage filter chips + search are client-side over the loaded list (not in SPEC, see open question 1). No results: “No applications match ‘xyz’ in Offer.” + Clear filters.",
    "Wrap: ≥768 table with truncating company/role (title attr has the full text); &lt;768 cards with chip/days/date wrapping onto a second line; filter row scrolls horizontally with edge fade.",
    "Demo banner “Create your own account”: signs the demo user out first (POST sign-out), then opens /signup. No confirm — the demo data is throwaway and the banner already says so.","Days in stage uses computeTimeline for today in the user's time zone; “1 day”, “0 days” → “Today”."])

def empty():
    return shell(list_header('0 applications')+f'''<div class="mt-6 bg-surface border border-dashed border-edge rounded-xl px-6 py-16 text-center"><span class="mx-auto w-12 h-12 rounded-xl bg-tint text-accent grid place-items-center">{ic("list-plus","w-6 h-6")}</span>
<h2 class="mt-4 text-[19px] font-semibold">No applications yet</h2><p class="mt-1.5 text-muted text-[15px] max-w-[420px] mx-auto">Add the first job you applied to. Its history starts at Applied on the date you choose.</p>
<button class="{BTN_P} mt-6">{ic("plus")}Add application</button> {pin(1)}</div>
''',demo=False)+notes("Empty list",["Empty state has a single primary action and no search/filter bar (nothing to search yet). For unverified users the button is disabled and the text reads “Confirm your email to add applications.” with a Resend link.","No results from search/filter is a different state — see 16-list-no-results."])
def noresults():
    return shell(list_header()+toolbar('quantum','Offer')+f'''<div role="status" class="mt-5 bg-surface border border-line rounded-xl px-6 py-14 text-center"><span class="mx-auto w-12 h-12 rounded-xl bg-subtle text-muted grid place-items-center">{ic("search-x","w-6 h-6")}</span><h2 class="mt-4 text-[19px] font-semibold">No applications match “quantum” in Offer {pin(1)}</h2><p class="text-muted text-[15px] mt-1.5">Try another search, or look in all stages.</p>
<div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center"><button class="{BTN_S}">Show all stages</button><button class="{BTN_G}">{ic("x")}Clear search and filter {pin(2)}</button></div></div>''')+notes("List · search + stage filter, no results",["The message names both the query and the active stage, announced via role=status. The count line keeps the total; a polite live region says “0 shown”.","Two ways out: drop just the stage (Show all stages) or clear both. The ✕ in the search field is a 44px button; Esc in the field clears it.","•Search matches company or role, case-insensitive, debounced 200ms. Stage chips are single-select (All + 5 stages) with counts for the current search. Both live in the URL (?q=&stage=) so Back and reload keep them. Mobile: full-width search, chips scroll horizontally beneath, and the active chip is scrolled into view on load."])

def loading():
    rows=''.join(f'<div class="flex items-center gap-4 px-5 h-[68px] border-t border-line first:border-t-0"><span class="sk w-10 h-10 rounded-lg"></span><span class="flex-1 space-y-2"><span class="sk block h-3.5 w-40"></span><span class="sk block h-3 w-28"></span></span><span class="sk h-6 w-24 rounded-full"></span><span class="sk h-3.5 w-16 hidden md:block"></span><span class="sk h-3.5 w-32 hidden md:block"></span></div>' for _ in range(5))
    return shell(f'''<div class="flex flex-wrap items-end gap-4 justify-between"><div><h1 class="text-[26px] sm:text-[30px] font-semibold tracking-tight">Applications</h1><p class="sk h-3.5 w-44 mt-3"></p></div><button class="{BTN_P}">{ic("plus")}Add application</button></div>
<div class="mt-5 bg-surface border border-line rounded-xl overflow-hidden" aria-busy="true" aria-label="Loading applications">{rows}</div>''')+notes("Loading",["Skeleton matches the real row geometry so nothing jumps. Shimmer disabled under prefers-reduced-motion. Shown only after 150ms; Add application stays usable.","Screen readers get aria-busy plus a polite “Loading applications” live region."])

def error():
    return shell(f'''{list_header("—")}<div role="alert" class="mt-6 bg-surface border border-line rounded-xl px-6 py-14 text-center"><span class="mx-auto w-12 h-12 rounded-xl bg-dangertint text-danger grid place-items-center">{ic("cloud-off","w-6 h-6")}</span>
<h2 class="mt-4 text-[19px] font-semibold">Couldn't load your applications</h2><p class="mt-1.5 text-muted text-[15px]">Check your connection and try again. Nothing was changed.</p><button class="{BTN_S} mt-6">{ic("rotate-cw")}Try again</button> {pin(1)}</div>''')+notes("Error",["Retry refetches (TanStack Query). While retrying, the button shows a spinner and “Trying again…”. 401 → sign-in with “Your session ended. Sign in again.” 5xx/network → this state. Never shows raw error text."])

def form():
    body=f'''<a class="text-[14px] text-muted inline-flex items-center gap-1 min-h-[44px] hover:text-ink">{ic("arrow-left")}Applications</a>
<div class="mt-2 grid lg:grid-cols-[1fr_320px] gap-8"><div class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-8"><h1 class="text-[24px] font-semibold tracking-tight">Add application</h1>
<div role="alert" class="mt-5 rounded-lg bg-dangertint text-danger text-[14px] px-3 py-2.5 flex gap-2">{ic("circle-alert","w-4 h-4 mt-0.5 flex-none")}<span>Fix 3 fields to save. {pin(1)}</span></div>
<div class="mt-6 grid sm:grid-cols-2 gap-5">{field("Company","Initech",req=True)}{field("Role",req=True,err="Enter a role, up to 120 characters.")}</div>
<div class="mt-5">{field("Job posting link","example.test/initech/platform",err="Use a link that starts with http:// or https://")}</div>
<div class="mt-5 sm:w-1/2">{field("Applied on","Oct 12, 2026",req=True,err="Can't be in the future. Today is Oct 9, 2026.")}</div>
<label class="block mt-5"><span class="text-[14px] font-medium">Notes</span><span class="text-muted text-[13px] ml-2">Running summary of this application</span><textarea rows="4" class="mt-1.5 w-full rounded-lg border border-edge px-3 py-2.5 text-base sm:text-[15px]">Referred by a former teammate. Platform team, hybrid.</textarea><span class="block text-right text-[12.5px] text-muted num">54 / 5,000</span></label>
<div class="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end"><button class="{BTN_G}">Cancel</button><button class="{BTN_P}">Save application</button></div></div>
<aside class="space-y-4"><div class="bg-surface border border-line rounded-xl p-5"><p class="text-[13px] font-semibold uppercase tracking-[.08em] text-muted">Edit mode {pin(2)}</p>
<label class="block mt-3"><span class="text-[14px] font-medium">Applied on</span><div class="mt-1.5 h-11 rounded-lg bg-subtle border border-line px-3 flex items-center gap-2 text-[15px] text-muted">{ic("lock","w-4 h-4")}Sep 25, 2026</div><p class="mt-1.5 text-[13px] text-muted">Set when the application was created. History starts here, so it can't change.</p></label></div>
<div class="bg-surface border border-line rounded-xl p-5 text-[14px]"><p class="font-medium flex items-center gap-2">{pin(3)}Save failed</p><div class="mt-2 rounded-lg bg-dangertint text-danger p-3 flex gap-2">{ic("circle-alert","w-4 h-4 mt-0.5 flex-none")}Couldn't save. Your changes are still here. <a class="underline font-medium">Try again</a></div></div>
<div class="bg-surface border border-line rounded-xl p-5 text-[14px]"><p class="font-medium flex items-center gap-2">{pin(4)}Saved</p><div class="mt-2 rounded-lg bg-ink text-white p-3 flex gap-2 shadow-e2">{ic("circle-check","w-4 h-4 mt-0.5 flex-none text-[#7EE2A8]")}Application added. It starts in Applied.</div></div></aside></div>'''
    return shell(body)+notes("Add / edit application",["Errors validate on blur and on submit; summary at top lists the count and links to each field; focus moves to the first invalid field. aria-invalid + aria-describedby on each.","Edit uses the same form titled “Edit application”; Applied on is read-only with the reason (SPEC: not editable after creation). Delete lives on the detail page.","Save failures keep the input (SPEC). Save button: spinner + “Saving…”, disabled while pending.","Success: toast bottom-center (mobile) / bottom-right (desktop), 5s, then navigate to the detail page. Toast text 15.6:1 on ink.","Mobile: single column; Cancel below Save; the aside cards are annotation-only."])

TL=[('Applied','Aug 3, 2026',7,None,False,1),('Screen','Aug 10',9,'Recruiter call',False,1),('Interview','Aug 19',5,'Tech screen',False,1),('Screen','Aug 24',7,'Re-screened for a different team',False,2),('Interview','Aug 31',14,'Late-evening invite',False,2),('Offer','Sep 14',25,'Verbal offer',True,1)]
def detail_body():
    items=''
    for i,(s,d,n,note,cur,v) in enumerate(TL[::-1]):
        items+=f'''<li class="relative pl-10 pb-6 last:pb-0"><span class="absolute left-[11px] top-7 bottom-0 w-px bg-line {'hidden' if i==len(TL)-1 else ''}"></span><span class="absolute left-0 top-0.5 w-6 h-6 rounded-full grid place-items-center text-white dot-{s} {'ring-4 ring-[#E5F5EC]' if cur else ''}">{ic(ICON[s],"w-3.5 h-3.5")}</span>
<div class="flex flex-wrap items-center gap-x-3 gap-y-1"><span class="font-semibold text-[15px]">{s}</span>{'<span class="text-[12px] font-medium px-2 h-6 inline-flex items-center rounded-full border border-edge text-muted">Visit 2</span>' if v==2 else ''}{'<span class="text-[12px] font-semibold px-2 h-6 inline-flex items-center rounded-full bg-ink text-white">Current</span>' if cur else ''}<span class="ml-auto num text-[14px] font-medium">{n} days{' so far' if cur else ''}</span></div>
<p class="text-[13.5px] text-muted mt-0.5">Entered {d}</p>{f'<p class="mt-1.5 text-[14px]">“{note}”</p>' if note else ''}</li>'''
    tot=[('Applied',7,1),('Screen',16,2),('Interview',19,2),('Offer',25,1)]
    bars=''.join(f'<div class="grid grid-cols-[92px_1fr_auto] items-center gap-3 text-[14px]"><span class="font-medium">{s}</span><span class="h-2.5 rounded-full bg-subtle overflow-hidden"><span class="block h-full rounded-full bar-{s}" style="width:{d/25*100}%"></span></span><span class="num text-right w-[110px]">{d} days <span class="text-muted">· {v} visit{"s" if v>1 else ""}</span></span></div>' for s,d,v in tot)
    return f'''<a class="text-[14px] text-muted inline-flex items-center gap-1 min-h-[44px] hover:text-ink">{ic("arrow-left")}Applications</a>
<div class="mt-2 flex flex-wrap items-start gap-4"><div class="flex items-center gap-4 min-w-0">{mono('A','#BE123C','w-14 h-14 text-[22px]')}<div class="min-w-0"><h1 class="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight">Acme Robotics</h1><p class="text-muted text-[15px]">Frontend Engineer</p></div></div>
<div class="flex items-center gap-2 w-full sm:w-auto sm:ml-auto"><button class="{BTN_P} flex-1 sm:flex-none">{ic("arrow-right-left")}Move to stage {pin(1)}</button><button class="{BTN_S}">{ic("pencil")}<span class="hidden sm:inline">Edit</span></button><button class="{BTN_S} w-11 px-0" aria-label="More actions">{ic("ellipsis")}</button></div></div>
<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-muted">{chip('Offer')}<span class="num"><b class="text-ink font-medium">25 days</b> in Offer</span><span>Applied Aug 3, 2026</span><a class="text-accent underline underline-offset-2 inline-flex items-center gap-1 min-h-[32px]">Job posting{ic("external-link","w-3.5 h-3.5")}</a></div>
<div class="mt-8 grid lg:grid-cols-[1fr_380px] gap-6 items-start"><section class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><div class="flex items-center"><h2 class="text-[17px] font-semibold">Stage history</h2><span class="ml-auto text-[13px] text-muted">Newest first · 6 changes {pin(2)}</span></div><ol class="mt-5">{items}</ol></section>
<div class="space-y-6"><section class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><h2 class="text-[17px] font-semibold">Time per stage {pin(3)}</h2><p class="text-[13px] text-muted mt-0.5">All visits added up · 67 days total</p><div class="mt-5 space-y-3.5">{bars}</div></section>
<section class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><h2 class="text-[17px] font-semibold">Notes</h2><p class="mt-2 text-[15px] leading-6">Panel went well; waiting on offer details.</p><p class="mt-3 text-[12.5px] text-muted">Running summary. Stage notes say what changed. {pin(4)}</p></section></div></div>'''
def detail():
    return shell(detail_body())+notes("Application detail",["Primary action. ⋯ menu: Edit (mobile), Copy link, Delete application… (danger, confirm dialog: “Delete Acme Robotics? Its 6 stage changes are deleted too. This can't be undone.”).","Timeline is newest first; each visit row: stage icon + name (never color alone), “Visit 2” tag on revisits, entered date (user's time zone), days, optional event note. Current visit says “so far” and counts to today. Fixture A1: Aug 31 entry is the late-evening UTC case.","Per-stage totals sum every visit (Screen 9+7=16, Interview 5+14=19). Bars scale to the longest total; Closed bars are hatched. Visit count stated in text.","No edit/delete on events anywhere: history is append-only. Hint under the timeline on first view: “Stage changes can't be edited. Made a mistake? Move it again.”","Mobile: header actions wrap to a full-width row; totals card stacks under the timeline."])

def move():
    opts=''
    for s in ['Applied','Screen','Interview','Offer','Closed']:
        cur = s=='Offer'; sel = s=='Closed'
        opts+=f'''<label class="flex items-center gap-3 min-h-[48px] px-3 rounded-lg border {'border-accent bg-tint ring-1 ring-accent' if sel else 'border-line'} {'opacity-60 cursor-not-allowed bg-subtle' if cur else 'cursor-pointer'}"><span class="w-5 h-5 rounded-full border-2 {'border-accent grid place-items-center' if sel else 'border-edge'}">{'<span class="w-2.5 h-2.5 rounded-full bg-accent"></span>' if sel else ''}</span><span class="w-6 h-6 rounded-full grid place-items-center text-white dot-{s}">{ic(ICON[s],"w-3.5 h-3.5")}</span><span class="font-medium text-[15px]">{s}</span>{'<span class="ml-auto text-[13px] text-muted">Current stage</span>' if cur else ('<span class="ml-auto text-[13px] text-muted">Revisit</span>' if s in ('Applied','Screen','Interview') else '')}</label>'''
    dlg=f'''<div role="dialog" aria-modal="true" class="bg-surface w-full sm:max-w-[480px] rounded-t-2xl sm:rounded-2xl shadow-e3 p-5 sm:p-6"><div class="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-line"></div><div class="flex items-start"><div><h2 class="text-[19px] font-semibold">Move Acme Robotics</h2><p class="text-[14px] text-muted mt-0.5">Adds a new entry to its history. Nothing is overwritten.</p></div><button class="{BTN_G} w-11 px-0 -mr-2 -mt-2 ml-auto" aria-label="Close">{ic("x","w-5 h-5")}</button></div>
<fieldset class="mt-5"><legend class="text-[14px] font-medium mb-2">New stage {pin(1)}</legend><div class="grid gap-2">{opts}</div></fieldset>
<div class="mt-5"><label class="block sm:w-1/2"><span class="text-[14px] font-medium">When <span class="text-muted font-normal">(optional)</span></span><div class="mt-1.5 flex gap-2"><input class="{INP}" value="Oct 7, 2026"></div><span class="block mt-1.5 text-[12.5px] text-muted">Leave empty for now. Between Sep 14 and today. {pin(2)}</span></label>
</div><label class="block mt-4"><span class="text-[14px] font-medium">Note <span class="text-muted font-normal">(optional)</span></span><textarea rows="2" class="mt-1.5 w-full rounded-lg border border-edge px-3 py-2.5 text-base sm:text-[15px]">Declined, relocating</textarea><span class="flex justify-between mt-1 text-[12.5px] text-muted"><span>What changed.</span><span class="num">20 / 280 {pin(4)}</span></span></label>
<div class="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end"><button class="{BTN_G}">Cancel</button><button class="{BTN_P}">Move to Closed {pin(3)}</button></div></div>'''
    return f'''<div class="relative">{shell(detail_body())}<div class="absolute inset-0 bg-[rgba(23,23,28,.45)] flex items-end sm:items-start justify-center sm:pt-24">{dlg}</div></div>'''+notes("Move-stage dialog (sheet on mobile)",["Radio list with icon + name. Current stage is disabled with the visible reason “Current stage” (prevents the 409). Earlier stages carry a “Revisit” hint. Arrow keys move between options; focus starts on the first enabled option.","Date is optional; empty = now. Picker disables future dates and dates before the latest event (Sep 14). Server 422s map to: “Can't be in the future.” / “Can't be before the last change (Sep 14, 2026).”","Button label names the target stage. Pending: “Moving…” spinner. Success: dialog closes, new row animates into the top of the timeline, toast “Moved to Closed.”; focus returns to Move to stage. Error keeps the selection, date and note.","Mobile ≤639px: bottom sheet, full width, drag handle, Esc / swipe down / Close all dismiss; content scrolls above the sticky action row.","Stage-change note: up to 280 characters with a live counter (aria-live polite at 260+). At 260+ the counter turns warn; over 280 it turns danger, reads “12 characters over”, and Move is disabled with that reason. The server enforces 280 too."])

def settings_nav(cur):
    items=[('Security','shield'),('Preferences','sliders-horizontal')]
    side=''.join(f'<a class="h-11 px-3 rounded-lg flex items-center gap-2 text-[14px] font-medium {"bg-surface border border-edge shadow-[inset_3px_0_0_var(--accent)] text-ink font-semibold" if n==cur else "text-muted hover:text-ink hover:underline"}" {"aria-current=page" if n==cur else ""}>{ic(i)}{n}</a>' for n,i in items)
    seg=''.join(f'<a class="flex-1 h-11 rounded-md grid place-items-center text-[14px] font-medium {"bg-surface border border-edge shadow-e1 text-ink font-semibold" if n==cur else "text-muted hover:text-ink hover:underline"}" {"aria-current=page" if n==cur else ""}>{n}</a>' for n,i in items)
    return side, f'<div class="lg:hidden mt-5 p-1 rounded-lg bg-subtle flex">{seg}</div>'
def settings_page(cur, inner, demo=False):
    side,seg=settings_nav(cur)
    return shell(f'''<h1 class="text-[26px] sm:text-[30px] font-semibold tracking-tight">Settings</h1>{seg}<div class="mt-6 lg:mt-8 grid lg:grid-cols-[200px_1fr] gap-8 items-start"><nav class="hidden lg:flex flex-col gap-1" aria-label="Settings sections">{side}</nav><div class="min-w-0 space-y-6">{inner}</div></div>''',demo=demo,active='Settings')
def pw_card(demo):
    if demo:
        lbls=''.join(f'<label class="block"><span class="text-[14px] font-medium">{l}</span><div class="mt-1.5 h-11 rounded-lg bg-subtle border border-line"></div></label>' for l in ["Current password","New password","Confirm new password"])
        body=f'''<div class="mt-4 rounded-lg bg-warntint text-warn p-3 text-[14px] flex gap-2">{ic("lock","w-4 h-4 mt-0.5 flex-none")}<span>Demo accounts can't change their password. <a class="underline font-medium">Create your own account</a> to use this. {pin(1)}</span></div>
<div class="mt-4 grid gap-4 max-w-[440px] opacity-60">{lbls}</div><button class="{BTN_P} mt-5 opacity-50 cursor-not-allowed" disabled aria-disabled="true">Change password</button>'''
    else:
        body=f'''<div class="mt-4 grid gap-4 max-w-[440px]">{field("Current password","••••••••••••",typ="password")}{field("New password","••••••••••••••••",typ="password",hint="12–128 characters, not found in a known data breach.")}{field("Confirm new password","••••••••••••••••",typ="password",focus=True)}</div>
<div class="mt-4 rounded-lg border border-line bg-subtle/60 p-3 text-[13.5px] text-muted flex gap-2 max-w-[560px]">{ic("log-out","w-4 h-4 mt-0.5 flex-none")}<span>Changing your password signs out your other 2 devices. You stay signed in here. {pin(4)}</span></div>
<button class="{BTN_P} mt-5">Change password</button>'''
    return f'''<section id="password" class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><h2 class="text-[17px] font-semibold">Password</h2>{'' if demo else '<p class="text-[13.5px] text-muted mt-0.5">Forgot it? Sign out and use “Forgot password?” for a reset link.</p>'}{body}</section>'''
def sessions_card():
    sess=[('Chrome on macOS',True,'203.0.113.24','Active now'),('Safari on iPhone',False,'198.51.100.7','Last seen Oct 7, 6:12 PM'),('Firefox on Windows',False,'192.0.2.81','Last seen Sep 30, 9:40 AM')]
    rows=''
    for k,(a,cur,ip,seen) in enumerate(sess):
        hv = ' !bg-dangertint !border-danger !text-danger' if k==1 else ''
        act = '<span class="text-[12.5px] text-muted text-right max-w-[130px] hidden sm:block">Sign out here from the account menu</span>' if cur else f'<button class="h-11 px-3 inline-flex items-center gap-1.5 rounded-lg border border-edge text-[14px] font-medium hover:bg-dangertint hover:border-danger hover:text-danger{hv}" aria-label="Sign out {a}">{ic("log-out","w-4 h-4")}Sign out</button>'
        badge = "<span class='text-[12px] px-2 h-6 inline-flex items-center rounded-full bg-successtint text-success'>This device</span>" if cur else ""
        rows+=f'<li class="flex items-center gap-4 py-4 border-t border-line first:border-t-0"><span class="w-10 h-10 rounded-lg bg-subtle grid place-items-center text-muted flex-none">{ic("smartphone" if "iPhone" in a else "monitor")}</span><span class="min-w-0 flex-1"><span class="flex flex-wrap items-center gap-2 font-medium text-[15px]">{a}{badge}{f" {pin(2)}" if k==1 else ""}</span><span class="block text-[13.5px] text-muted num">{ip} · {seen}</span></span>{act}</li>'
    return f'''<section id="sessions" class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><div class="flex flex-wrap items-start gap-3"><div><h2 class="text-[17px] font-semibold">Active sessions</h2><p class="text-[13.5px] text-muted mt-0.5">3 devices are signed in.</p></div>
<button class="{BTN_S} sm:ml-auto text-danger !border-danger hover:bg-dangertint">{ic("log-out")}Sign out everywhere {pin(1)}</button></div><ul class="mt-4">{rows}</ul>
<div class="mt-2 rounded-lg bg-ink text-white p-3 flex items-center gap-2 shadow-e2 text-[14px] max-w-[420px]">{ic("circle-check","w-4 h-4 text-[#7EE2A8]")}Signed out Firefox on Windows. {pin(3)}</div></section>'''
def history_card():
    ev=[('Signed in','circle-check','Chrome on macOS','203.0.113.24','Oct 9, 11:42 AM'),('Sign-in failed','circle-x','Chrome on macOS','203.0.113.24','Oct 9, 11:41 AM'),('Signed out a device','log-out','Chrome on macOS','203.0.113.24','Oct 8, 4:20 PM'),('Password changed','key-round','Chrome on macOS','203.0.113.24','Sep 12, 7:05 PM'),('Email confirmed','mail-check','Safari on iPhone','198.51.100.7','Sep 2, 8:03 AM')]
    erows=''.join(f'<tr class="border-t border-line align-top"><td class="py-3 pr-4"><span class="inline-flex items-center gap-2 font-medium {"text-danger" if "failed" in a else ""}">{ic(i,"w-4 h-4")}{a}</span><span class="md:hidden block text-[13px] text-muted mt-0.5 pl-6">{dv} · {ip}</span></td><td class="py-3 pr-4 text-muted max-md:hidden">{dv}</td><td class="py-3 pr-4 text-muted num max-md:hidden">{ip}</td><td class="py-3 text-muted num whitespace-nowrap text-right md:text-left">{t}</td></tr>' for a,i,dv,ip,t in ev)
    return f'''<section class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><h2 class="text-[17px] font-semibold">Sign-in history</h2><p class="text-[13.5px] text-muted mt-0.5">Your last 50 security events, in America/Denver time.</p>
<table class="mt-4 w-full text-[14px]"><thead><tr class="text-left text-[12px] uppercase tracking-[.06em] text-muted"><th class="pb-2 font-medium">Event</th><th class="pb-2 font-medium max-md:hidden">Device</th><th class="pb-2 font-medium max-md:hidden">IP address</th><th class="pb-2 font-medium text-right md:text-left">When</th></tr></thead><tbody>{erows}</tbody></table></section>'''
def twofa():
    return f'''<section class="bg-surface border border-dashed border-edge rounded-xl p-5 sm:p-6"><div class="flex items-start gap-3"><span class="w-10 h-10 rounded-lg bg-tint text-accent grid place-items-center flex-none">{ic("shield-check")}</span><div class="flex-1"><h2 class="text-[17px] font-semibold flex flex-wrap items-center gap-2">Two-factor authentication <span class="text-[12px] font-medium px-2 h-6 inline-flex items-center rounded-full border border-edge text-muted">Coming in slice 2</span></h2>
<p class="text-[14px] text-muted mt-1">Use an authenticator app code at sign-in, with 10 single-use recovery codes.</p><button class="{BTN_S} mt-4 opacity-50 cursor-not-allowed" disabled>Set up 2FA</button><p class="mt-2 text-[13px] text-muted">Not available yet. {pin(5)}</p></div></div></section>'''
def security():
    return settings_page('Security', sessions_card()+pw_card(False)+twofa()+history_card())+notes("Settings › Security",["Sign out everywhere: confirm “Sign out everywhere? You'll be signed out on all 3 devices, including this one.” → sign-in page with “You've been signed out everywhere.”","Per-session Sign out (row 2 shows its hover/pressed state: danger tint + danger border + danger text). Immediate, no confirm (low risk; the person can sign in again). Spinner while pending, then the row leaves and focus moves to the next row's button or the card heading. The current device has no button and says where to sign out instead.","Success toast names the device. Failure: inline under the row “Couldn't sign out this device. Try again.”","Change password: current + new + confirm; the side effect is stated before saving. Errors: “Current password is incorrect.” (counts toward lockout), plus the sign-up length/breach/match rules. Success: this session is rotated, toast “Password changed. Your other devices were signed out.”, fields clear, the session list refreshes.","2FA slot keeps its final layout; the disabled button has a visible reason.","•Sessions show device/browser (parsed user agent) and IP only — no location. Mobile: sections switch with a segmented control; history device/IP drop to a second line."])
def security_demo():
    return settings_page('Security', pw_card(True), demo=True)+notes("Settings › Security · demo account",["Password form is disabled with the reason above it and a way out. “Create your own account” signs the demo user out first, then opens sign-up. Sessions, 2FA slot and history render as for any user (not repeated here)."])
def prefs():
    zs=[('America/Denver','UTC−6'),('America/Detroit','UTC−4'),('America/Edmonton','UTC−6')]
    opts=''.join(f'<li class="h-11 px-3 flex items-center gap-2 rounded-md {"bg-hov shadow-[inset_3px_0_0_var(--accent)] font-medium" if k==1 else ""}">{ic("check","w-4 h-4 text-accent") if k==0 else "<span class=w-4></span>"}<span class="flex-1 truncate">{z}</span><span class="text-[12.5px] text-muted num">{o}</span></li>' for k,(z,o) in enumerate(zs))
    inner=f'''<section class="bg-surface border border-line rounded-xl shadow-e1 p-5 sm:p-6"><h2 class="text-[17px] font-semibold">Time zone</h2><p class="text-[13.5px] text-muted mt-0.5 max-w-[560px]">Used for stage dates and days in stage. Detected from your browser when you signed up.</p>
<div class="mt-5 max-w-[440px]"><span class="text-[14px] font-medium">Time zone {pin(1)}</span><div class="mt-1.5"><button class="{INP} text-left flex items-center gap-2 ring-f !border-accent" aria-expanded="true" role="combobox">{ic("globe","w-4 h-4 text-muted")}<span class="flex-1">America/Denver</span>{ic("chevrons-up-down","w-4 h-4 text-muted")}</button>
<div class="mt-2 rounded-xl bg-surface border border-line shadow-e2 p-1.5 text-[14px]"><div class="relative mb-1">{ic("search","w-4 h-4 absolute left-3 top-3.5 text-muted")}<input class="{INP} pl-9" value="America/De" aria-label="Search time zones"></div><ul role="listbox">{opts}</ul></div></div>
<p class="mt-3 text-[13px] text-muted">Your browser reports America/Denver. <a class="text-accent underline underline-offset-2">Use browser time zone</a> {pin(2)}</p>
<div class="mt-4 rounded-lg border border-line bg-subtle/60 p-3 text-[13.5px] text-muted flex gap-2">{ic("info","w-4 h-4 mt-0.5 flex-none")}<span>Changing it re-counts days in stage with the new zone. Your history itself doesn't change. {pin(3)}</span></div>
<div class="mt-5 flex flex-wrap items-center gap-3"><button class="{BTN_P}">Save</button><span role="status" class="text-[14px] text-success inline-flex items-center gap-1.5">{ic("circle-check","w-4 h-4")}Saved. Dates now use America/Denver. {pin(4)}</span></div></div></section>'''
    return settings_page('Preferences', inner)+notes("Settings › Preferences",["Searchable combobox (shadcn Command in a Popover; full-height Sheet on mobile) over the IANA list with each zone's current UTC offset. Type-ahead, arrows, Enter selects, Esc closes. Shown open here, with Detroit hovered.","When the saved zone differs from the browser's, the hint offers a one-tap switch; when they match, the link is hidden (shown here for the mock).","Side effect explained before saving: only display and day counts change; events stay stored in UTC.","Save is disabled with “No changes to save” until the value changes; pending “Saving…”; success inline (role=status); error inline “Couldn't save your time zone. Try again.” keeping the selection. Demo accounts can change it."])

def states():
    def cell(lbl, html): return f'<div class="flex flex-col items-start gap-2"><span class="text-[11.5px] uppercase tracking-[.08em] text-muted">{lbl}</span>{html}</div>'
    btns=[('Primary',BTN_P,['','!bg-accenth','!bg-accentp','ring-f','opacity-50 cursor-not-allowed'],'Add application'),('Secondary',BTN_S,['','!bg-hov !border-ink','!bg-tint !border-accentp','ring-f','opacity-50 cursor-not-allowed'],'Edit'),('Ghost',BTN_G,['','!bg-subtle underline underline-offset-2','!bg-line','ring-f','opacity-50'],'Cancel'),('Destructive',BTN_S+' text-danger !border-danger',['','!bg-dangertint','!bg-[#F9D7D3]','ring-f','opacity-50'],'Delete')]
    rows=''
    for n,base,mods,t in btns:
        rows+=f'<div class="grid grid-cols-2 md:grid-cols-[110px_repeat(6,minmax(0,1fr))] gap-4 items-center py-4 border-t border-line"><span class="font-medium text-[14px] col-span-2 md:col-span-1">{n}</span>'+''.join(cell(l,f'<button class="{base} {m}">{t}</button>') for l,m in zip(['Default','Hover','Pressed','Focus-visible','Disabled'],mods))+cell('Loading',f'<button class="{base} opacity-90" aria-busy="true"><span class="w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin"></span>Saving…</button>')+'</div>'
    inputs=f'<div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-2">'+cell('Default',f'<input class="{INP}" placeholder="Company">')+cell('Hover',f'<input class="{INP} !border-ink" placeholder="Company">')+cell('Focus',f'<input class="{INP} ring-f !border-accent" value="Northw">')+cell('Error',f'<input class="{INP} !border-danger ring-1 ring-danger" value="">')+cell('Disabled + reason',f'<div class="w-full"><div class="h-11 rounded-lg bg-subtle border border-line px-3 flex items-center gap-2 text-muted">{ic("lock","w-4 h-4")}Sep 25, 2026</div><p class="text-[12.5px] text-muted mt-1">Can&rsquo;t change after creation</p></div>')+'</div>'
    r=lambda c,l: f'<div class="flex items-center gap-3 px-4 h-[60px] rounded-lg border border-line bg-surface {c}"><span class="font-semibold">Northwind Labs</span>{chip("Interview")}<span class="ml-auto text-muted text-[13px]">{l}</span></div>'
    rowst='<div class="grid md:grid-cols-4 gap-4 mt-2">'+cell('Row default',r('','')) + cell('Row hover',r('!bg-hov shadow-[inset_3px_0_0_var(--accent)] [&>span:first-child]:underline','')) + cell('Row pressed',r('!bg-tint shadow-[inset_3px_0_0_var(--accentp)]',''))+cell('Row focus-visible',r('ring-f',''))+'</div>'
    chips='<div class="flex flex-wrap gap-3 mt-2">'+''.join(chip(s) for s in ICON)+'</div>'
    toasts=f'''<div class="grid md:grid-cols-3 gap-4 mt-2"><div class="rounded-lg bg-ink text-white p-3 flex gap-2 shadow-e2 text-[14px]">{ic("circle-check","w-4 h-4 mt-0.5 text-[#7EE2A8]")}Moved to Interview.</div><div class="rounded-lg bg-ink text-white p-3 flex gap-2 shadow-e2 text-[14px]">{ic("circle-alert","w-4 h-4 mt-0.5 text-[#FFA39A]")}Couldn't move it. Try again.<a class="ml-auto underline">Retry</a></div><div class="rounded-lg bg-dangertint text-danger p-3 flex gap-2 text-[14px]">{ic("circle-alert","w-4 h-4 mt-0.5")}Inline alert</div></div>'''
    menu=f'''<div class="w-60 rounded-xl bg-surface border border-line shadow-e2 p-1.5 text-[14px]"><div class="h-11 px-3 rounded-md flex items-center gap-2">{ic("pencil")}Edit</div><div class="h-11 px-3 rounded-md flex items-center gap-2 bg-hov shadow-[inset_3px_0_0_var(--accent)] font-medium">{ic("link")}Copy link<span class="ml-auto text-[11px] text-muted">hover/active</span></div><div class="h-px bg-line my-1"></div><div class="h-11 px-3 rounded-md flex items-center gap-2 text-danger">{ic("trash-2")}Delete application…</div></div>'''
    body=f'''<h1 class="text-[26px] font-semibold tracking-tight">Interaction states</h1><p class="text-muted mt-1 text-[14px]">Every hover adds an edge, outline or underline — never a fill change alone. Focus-visible is a 2px accent outline, 2px offset (7.44:1 on white, 6.94:1 on canvas).</p>
<section class="mt-6 bg-surface border border-line rounded-xl p-5 sm:p-6"><h2 class="font-semibold">Buttons · 44px tall · cursor: pointer (disabled: not-allowed + visible reason)</h2>{rows}</section>
<section class="mt-6 bg-surface border border-line rounded-xl p-5 sm:p-6"><h2 class="font-semibold">Inputs · border edge #85837A 3.80:1 on white</h2>{inputs}</section>
<section class="mt-6 bg-surface border border-line rounded-xl p-5 sm:p-6"><h2 class="font-semibold">List rows · hover adds 3px accent edge + underline</h2>{rowst}</section>
<div class="mt-6 grid lg:grid-cols-[1fr_auto] gap-6"><section class="bg-surface border border-line rounded-xl p-5 sm:p-6"><h2 class="font-semibold">Stage chips · icon + label + border style (Closed dashed)</h2>{chips}<h2 class="font-semibold mt-6">Feedback</h2>{toasts}</section><section class="bg-surface border border-line rounded-xl p-5 sm:p-6"><h2 class="font-semibold mb-3">Menu</h2>{menu}</section></div>'''
    return shell(body,demo=False)+notes("States sheet",["Contrast numbers per state are in BRIEF §7 (computed by contrast.py)."])

def hero():
    return f'''<style>.pin{{display:none!important}}</style><div style="width:1600px;height:900px" class="relative overflow-hidden bg-[#F2F1EC]"><div class="absolute inset-0" style="background:radial-gradient(900px 500px at 75% 10%,#E4DFFB 0,transparent 60%),radial-gradient(700px 500px at 0% 100%,#E3EFE8 0,transparent 60%)"></div>
<div class="absolute left-[80px] top-[64px] w-[1180px] h-[760px] rounded-2xl bg-surface shadow-e3 border border-[#d4d2ca] overflow-hidden"><div class="h-10 bg-[#ECEBE6] border-b border-line flex items-center gap-2 px-4"><span class="w-3 h-3 rounded-full bg-[#E5615A]"></span><span class="w-3 h-3 rounded-full bg-[#E3B341]"></span><span class="w-3 h-3 rounded-full bg-[#5BB463]"></span><span class="mx-auto h-6 w-[360px] rounded-md bg-white text-[12px] text-muted grid place-items-center">pipeline-demo.onrender.com/applications/acme-robotics</span></div>
<div style="width:1440px;transform:scale(.8194);transform-origin:0 0" class="bg-canvas">{shell(detail_body(),demo=False).replace('max-w-[1200px]','max-w-[1300px]')}</div></div>
<div class="absolute right-[70px] top-[150px] w-[340px] h-[690px] rounded-[44px] bg-ink p-3 shadow-e3"><div class="w-full h-full rounded-[34px] overflow-hidden bg-canvas"><div style="width:390px;transform:scale(.811);transform-origin:0 0"><div class="h-14 bg-surface border-b border-line flex items-center px-4">{logo()}<span class="ml-auto w-8 h-8 rounded-full bg-tint text-accent grid place-items-center text-[13px] font-semibold">AD</span></div><div class="px-4 pt-6"><div class="flex items-end justify-between"><div><h1 class="text-[26px] font-semibold tracking-tight">Applications</h1><p class="text-muted text-[13.5px] mt-1">Sorted by last activity</p></div><span class="h-11 px-4 inline-flex items-center gap-2 rounded-lg bg-accent text-white text-[14px] font-medium">{ic("plus")}Add</span></div>{cards_only(APPS)}</div></div></div></div></div>'''

SCREENS=[('01-signin','Sign in',signin),('02-signup','Sign up',signup),('03-verify-email','Verify email',verify),('04-forgot-password','Forgot password',forgot),('05-reset-password','Reset password',reset),
('06-list','Applications',lst),('07-list-empty','Empty',empty),('08-list-loading','Loading',loading),('09-list-error','Error',error),('10-application-form','Add application',form),
('11-detail','Acme Robotics',detail),('12-move-stage','Move stage',move),('13-settings-security','Settings',security),('13b-settings-security-demo','Settings',security_demo),('16-list-no-results','Applications',noresults),('17-settings-preferences','Settings',prefs),('14-states','States',states),('15-readme-hero','README hero',hero)]
os.makedirs('../mocks',exist_ok=True)
for f,t,fn in SCREENS:
    open(f'../mocks/{f}.html','w').write(HEAD%t+fn()+TAIL)
print('ok')
