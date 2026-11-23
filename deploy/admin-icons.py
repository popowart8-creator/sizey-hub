"""Generate distinct admin PWA PNG icons without third-party dependencies."""
from pathlib import Path
import struct,zlib
def png(size,path):
    pixels=bytearray()
    def inside_round(x,y,left,top,right,bottom,r):
        px=max(left+r,min(x,right-r));py=max(top+r,min(y,bottom-r))
        return (x-px)**2+(y-py)**2<=r*r
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            u=x*512/size;v=y*512/size
            color=(25,25,25,255)
            if inside_round(u,v,91,117,421,397,52):color=(244,237,230,255)
            # bag handle
            if 156<u<356 and 90<v<170 and (abs(u-256)>74 or v<114) and inside_round(u,v,156,70,356,192,94):color=(198,168,141,255)
            if inside_round(u,v,91,117,421,397,52):color=(244,237,230,255)
            # bold A
            if 200<v<329:
                left=257-(v-200)*.44;right=257+(v-200)*.44
                if left<u<right and not (v>246 and 257-(v-246)*.23<u<257+(v-246)*.23):color=(28,28,28,255)
                if 276<v<294 and 204<u<310:color=(28,28,28,255)
            if (u-382)**2+(v-385)**2<61**2:color=(213,172,136,255)
            # checkmark
            if 364<v<405 and (abs(v-(u+12))<8 and 353<u<378 or abs(v-(-u+770))<8 and 373<u<411):color=(25,25,25,255)
            pixels.extend(color)
    def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    output=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels),9))+chunk(b'IEND',b'')
    Path(path).write_bytes(output)
for size in (180,192,512):png(size,f'dist/admin/admin-icon-{size}.png')
