def L(h):
    h=h.lstrip('#');c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    a,b=L(a),L(b);return (max(a,b)+0.05)/(min(a,b)+0.05)
T=dict(canvas='#F7F7F5',surface='#FFFFFF',subtle='#EFEFEB',hover='#F2F1FC',border='#DAD9D3',
 edge='#85837A',ink='#17171C',muted='#5A5952',faint='#6E6D66',
 accent='#4F3CC9',accentH='#3F2EB0',accentP='#33248F',accentTint='#EEEBFC',onAccent='#FFFFFF',
 danger='#B42318',dangerTint='#FDECEA',success='#1E7A46',successTint='#E7F5EC',warn='#8A5A00',warnTint='#FDF3DC',focus='#4F3CC9')
S={'Applied':('#F0F1F5','#3A4256','#5B647A'),'Screen':('#E6F1FB','#0B4F80','#1C6FB0'),
 'Interview':('#FBEFE2','#7A3E06','#B4610F'),'Offer':('#E5F5EC','#14603A','#1F8A53'),'Closed':('#F3F2F0','#55534D','#8C8A83')}
P=[('ink','surface'),('ink','canvas'),('ink','subtle'),('ink','hover'),('muted','surface'),('muted','canvas'),('muted','subtle'),('muted','hover'),('faint','surface'),
('onAccent','accent'),('onAccent','accentH'),('onAccent','accentP'),('accent','surface'),('accent','accentTint'),('accentH','hover'),
('edge','surface'),('edge','canvas'),('edge','subtle'),('edge','hover'),('border','surface'),('focus','surface'),('focus','canvas'),
('danger','surface'),('danger','dangerTint'),('success','successTint'),('success','surface'),('warn','warnTint')]
for a,b in P: print(f"| {a} {T[a]} | {b} {T[b]} | {cr(T[a],T[b]):.2f}:1 |")
for k,(bg,fg,dot) in S.items(): print(f"| {k} | text {fg} on {bg} {cr(fg,bg):.2f}:1 | border/dot {dot} on {bg} {cr(dot,bg):.2f}:1, on white {cr(dot,'#FFFFFF'):.2f}:1 |")
