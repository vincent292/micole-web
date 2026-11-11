#!/usr/bin/env python3
"""TTY for the authorized EAS credential download; sensitive output stays hidden."""
import os,sys,pty,select,termios,tty,re
os.umask(0o077)
project='/private/tmp/micole-signing-authorized'
cli='/Users/vincentariassaavedra/.npm/_npx/1c8fd65cc0a6ce28/node_modules/eas-cli/bin/run'
pid,master=pty.fork()
if pid==0:
    os.chdir(project)
    os.environ['EAS_NO_VCS']='1'
    os.execvp('node',['node',cli,'credentials','-p','android'])
old=termios.tcgetattr(sys.stdin.fileno())
buffer=b''
ansi=re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07')
def emit(raw):
    value=ansi.sub('',raw.decode('utf-8','replace')).replace('\r','')
    if re.search(r'password|key alias|private key|client id|client email|BEGIN.*KEY|END.*KEY',value,re.I):
        value='[dato privado omitido]'
    value=re.sub(r'[A-Za-z0-9+/=_-]{100,}','[valor largo omitido]',value)
    sys.stdout.write(value+'\n');sys.stdout.flush()
try:
    tty.setraw(sys.stdin.fileno())
    while True:
        ready,_,_=select.select([master,sys.stdin.fileno()],[],[],1)
        if master in ready:
            try: data=os.read(master,65536)
            except OSError: break
            if not data:break
            buffer+=data
            while b'\n' in buffer:
                line,buffer=buffer.split(b'\n',1);emit(line)
        if sys.stdin.fileno() in ready:
            data=os.read(sys.stdin.fileno(),1024)
            if not data:break
            os.write(master,data)
        ended,status=os.waitpid(pid,os.WNOHANG)
        if ended:break
finally:
    termios.tcsetattr(sys.stdin.fileno(),termios.TCSADRAIN,old)
    os.close(master)
