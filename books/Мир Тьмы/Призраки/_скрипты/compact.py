import sys,re
src,dst,a,b=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
L=open(src,encoding='utf-8').read().split('\n')[a-1:b]
hdr=re.compile(r'^(WRAITH: THE OBLIVION 20TH ANNIVERSARY EDITION|TRAITS|RULES|CHARACTER|SETTING|THE SHADOW|SYSTEMS|DRAMA|STORYTELLING|SPECTRES|THE RISEN|\d{1,3})$')
paras=[];cur=None
def flush():
    global cur
    if cur: paras.append(f"[{cur[0]}] "+' '.join(cur[1]))
    cur=None
for i,l in enumerate(L,a):
    s=l.strip().replace('\f','')
    if not s or hdr.match(s): continue
    short_title = len(s)<45 and not re.search(r'[.,;:]$',s) and s[0].isupper() and not s.startswith('•')
    if cur is None: cur=[i,[s]]
    else:
        prev=cur[1][-1]
        if short_title and re.search(r'[.!?”)]$',prev):
            flush(); cur=[i,[s]]
        else: cur[1].append(s)
    if re.search(r'[.!?”]$',s) and len(s)>60: flush()
flush()
open(dst,'w',encoding='utf-8').write('\n'.join(paras))
print(len(paras), sum(len(p) for p in paras))
