MEMBER PHOTOS — drop them in here
=================================

Name each file after the member, any of .jpg .jpeg .png .webp .avif:

    Taeyong.jpg
    Johnny.jpg
    Yuta.jpg
    Doyoung.jpg
    Jaehyun.jpg
    Jungwoo.jpg
    Haechan.jpg

Matching is case-insensitive, so haechan.jpg works too. Run `node build.js`
(or just push — the scheduled job rebuilds every 6 hours) and the cards pick
them up. Any member without a file keeps the striped placeholder, so a
partial set is fine.

Square-ish crops look best; the frame is 3:4 and crops to fill.


WHY THIS IS A FOLDER AND NOT AUTOMATIC
--------------------------------------

Every other image on this site arrives with an API response and is hotlinked
from the source CDN: album art from Apple Music, thumbnails from YouTube.
Those are always era-correct because each record carries its own cover and
the video feed only returns recent uploads.

Member portraits have no such source. There is no keyless API for them. The
freely-licensed photos on Wikimedia Commons are mostly 2019-2023, so using
those would fill the lineup with exactly the mix of stale eras this folder
exists to avoid.

Current-era portraits are promotional photos. Whether to use them, and under
what terms, is the site owner's call — hence a folder you fill rather than a
fetch that happens on its own.


IF YOU'D RATHER NOT
-------------------

The placeholders are deliberate design, not breakage: a diagonal stripe with
the member's name. The lineup section reads fine without photos.
