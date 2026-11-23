"""Render the minimal admin A icon to iOS and Android PNGs using the standard library."""
from pathlib import Path
import struct,zlib,math
def png(size,path):
    pixels=bytearray()
    def segment(x,y,ax,ay,bx,by,width):
        dx,dy=bx-ax,by-ay
        t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
        return (x-ax-t*dx)**2+(y-ay-t*dy)**2<=(width/2)**2
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            u=(x+.5)*512/size;v=(y+.5)*512/size
            # A single white monoline A on a near-black square.
            white=segment(u,v,170,355,256,150,32) or segment(u,v,256,150,342,355,32) or segment(u,v,203,290,309,290,32)
            pixels.extend((255,255,255,255) if white else (24,24,24,255))
    def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    output=b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels),9))+chunk(b'IEND',b'')
    Path(path).write_bytes(output)
for size in (180,192,512):png(size,f'dist/admin/admin-icon-{size}.png')
