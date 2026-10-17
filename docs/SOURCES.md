# Տեխնիկական աղբյուրներ

Բոլորը ստուգված են 17.10.2026-ին։ «ՀԱՍՏԱՏՎԱԾ»-ը վերաբերում է փաստաթղթում նշված վարքին, ոչ մեր ծրագրի իրական հեռախոսային ընդունմանը։ Ճամփորդական տվյալների հետազոտություն այս փուլում չի կատարվել։

| Պիտակ | Պաշտոնական աղբյուր | Ինչ է հաստատում |
|---|---|---|
| ՀԱՍՏԱՏՎԱԾ | [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) | Public repository-ն հասանելի է Free-ով, ճյուղից և արմատային պանակից հրապարակման Settings → Pages քայլերը։ |
| ՀԱՍՏԱՏՎԱԾ | [Chrome install criteria](https://web.dev/articles/install-criteria) | HTTPS, manifest, name/short_name, start_url, 192/512 պատկերակներ և standalone display։ Ներքին install prompt-ը կախված է դիտարկչի պայմաններից։ |
| ՀԱՍՏԱՏՎԱԾ | [Chrome criteria update](https://developer.chrome.com/blog/update-install-criteria) | Menu-ից տեղադրելու և install prompt-ի չափանիշները նույնը չեն։ Offline-ի համար service worker-ը առանձին է իրականացվում։ |
| ՀԱՍՏԱՏՎԱԾ | [Apple Safari Home Screen](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios) | Share → Add to Home Screen → Open as Web App, երբ հասանելի է → Add։ |
| ՀԱՍՏԱՏՎԱԾ | [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) | `api=1`, destination, travelmode, origin-ի բացակայությամբ ընթացիկ դիրք։ Mobile browser-ում մինչև 3 միջանկյալ waypoint, այլ աջակցվող դեպքերում մինչև 9։ Որոշ Google Maps արտադրանքներ waypoint-ներ անտեսում են։ Ամբողջ օրվա գործառույթը դեռ չի իրականացվել։ |
| ՀԱՍՏԱՏՎԱԾ | [Leaflet download](https://leafletjs.com/download.html) | Կայուն 1.9.4 տարբերակ, CSS/JS SRI hash-եր, տեղային օգտագործման ձև։ |
| ՀԱՍՏԱՏՎԱԾ | [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) | HTTPS tile URL, տեսանելի attribution, Referer, HTTP cache-ի պահպանում, bulk download/offline prefetch-ի արգելք։ |

Leaflet ներբեռնումները՝ `https://unpkg.com/leaflet@1.9.4/dist/` և [1.9.4 license](https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE)։

Ստացված հիմնական ֆայլերի SHA-256-ը համընկնում է Leaflet-ի պաշտոնական էջի SRI արժեքների հետ.

- leaflet.js՝ `db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a`
- leaflet.css՝ `a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6`

Կախվածության արտոնագիրը պահված է `vendor/leaflet/LICENSE`-ում։ Այնտեղ նշված հեղինակները գրադարանի հեղինակներն են, ոչ ճամփորդների անձնական տվյալներ։
# Բ2 հավելում · 17.10.2026

ՀԱՍՏԱՏՎԱԾ տեխնիկական փաստաթղթերով, ոչ սարքային ընդունմամբ.

- Maps mobile browser՝ առավելագույնը 3 intermediate waypoint, այլ միջավայրերում՝ մինչև 9. https://developers.google.com/maps/documentation/urls/get-started
- Chrome English՝ Install and create shortcut → Install. https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid
- SamsungBrowser/version՝ պաշտոնական UA նշան. https://developer.samsung.com/browser/user-agent-string-format.html
- HTML translate=no. https://html.spec.whatwg.org/multipage/dom.html#the-translate-attribute
- Google notranslate meta. https://www.chromium.org/developers/design-documents/translate/
- GitHub ֆայլերի upload. https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

Ռուսերեն տեղադրման անունը և Z Fold 4 արդյունքը սեփականատիրոջ հաղորդումն են։ Play Protect-ի պատճառը և իրական հեռախոսում notranslate արդյունքը չստուգված են։ Ստորև սկզբնական փուլի աղբյուրների պատմությունն է։

