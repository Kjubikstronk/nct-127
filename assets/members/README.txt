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


SIZE THEM BEFORE YOU COMMIT
---------------------------

The card is about 300px wide, so 640px on the long edge is already twice
what any screen needs. Straight-from-the-source promo shots are 2000-4096px
and 1-2 MB each; seven of those made an 8.5 MB lineup section, which is most
of a mobile data allowance spent on detail nobody can see at card size.

There is no resizer in build.js on purpose — every image encoder is a
dependency, and this repo has none. One line of the ffmpeg already on this
machine does it:

    ffmpeg -i Taeyong.jpg -vf scale=640:-2 -c:v libwebp -quality 82 Taeyong.webp

That lands each portrait at 25-90 kB with no visible loss at card size.
Delete the oversized original afterwards, or both files sit in the repo.


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
