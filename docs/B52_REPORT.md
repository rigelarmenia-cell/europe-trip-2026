# Խելառներ · Բ5.2 · 0.5.2 · 18.10.2026

Բ5.1-ը սեփականատիրոջ փոխանցմամբ Claude-ն ընդունել է։ Այս հանձնումը ներառում է Բ5.1-ի ամբողջ փոփոխությունները և Բ5.2 անունն ու պատկերակները՝ 9157b00ce032beebe3b983ca18fbc79a6cd38454-ի նկատմամբ։ Ժամկետը՝ 19:00։ ZIP-ը ՉԻ ՎԵՐԲԵՌՆՎԵԼ։

Փոփոխություններ
- manifest name/short_name, title, brand, aria-label, footer, help-dialog և GROUP_MESSAGE՝ «Խելառներ»։
- Ավելացվել է apple-mobile-web-app-title։
- RIGEL-ի վեց PNG-ն պատճենված են artifacts/icons-khelarner-ից՝ առանց փոփոխության։ Manifest՝ 192/512/maskable 512, Apple՝ 180, favicon՝ 64, brand՝ mark.png։
- Հին icons/icon.svg-ը հեռացված է։ Favicon/brand և sw.js FILES-ն օգտագործում են PNG-ները։
- RELEASE 0.5.2, footer՝ «Խելառներ · Բ5.2 · 0.5.2»։
- localStorage storagePrefix-ը, SW cache PREFIX-ը, URL-ը, repository-ի անունը, manifest description/id/start_url/scope-ը չեն փոխվել։
- Բ5.1-ի lib/map.js ուղղումը պահպանված է, այլ գործառույթ չի ավելացվել։

Տվյալներ
trip.json՝ v2026-10-18-13, սկզբնաղբյուրի բայթային պատճեն։
SHA-256՝ 9b11a7356a1091ab74bc39e3376bb1ad9ad4e90f59e290fe068cf0737a7b5f71

Ստուգումներ
- npm test՝ 85/85 PASS։
- browser-smoke՝ Edge 12/12 և WebKit 12/12 PASS։
- browser-b5՝ Edge 4/4 և WebKit 4/4 PASS։
- Manifest/Apple/favicon՝ HTTP 200, ճիշտ բնական չափեր։ Brand PNG-ն բեռնվում է։
- 320–1400px՝ առանց հորիզոնական ոլորման։ Offline վերաբացում և նշումների պահպանում՝ PASS։
- JS սխալներ՝ 0։
- 390px վերնագրով նկարները տեսողական դիտված են՝ artifacts/b52-edge-390.png և artifacts/b52-webkit-390.png։
- Թեստերի ապացույցները՝ docs/verification-b52-*։
- Իրական հեռախոսային նոր փորձ չի ներկայացվում։ Նախորդ T կարգավիճակները չեն բարձրացվել։

Հանձնում
europe-trip-2026-B5-2-update.zip՝ 9157b00-ի նկատմամբ, Բ5.1 + Բ5.2 + անփոփոխ v13։
Ջնջվող միակ ֆայլը՝ icons/icon.svg։ Ցանկը ներառված է docs/DELETE_B52.txt-ում։
Վերբեռնման ժամանակ ZIP-ը միայնակ չի ջնջում հին ֆայլը. այն պետք է ջնջել առանձին, երբ վերբեռնումը թույլատրվի։
Այս փուլում ZIP-ը չի վերբեռնվել, կենդանի կայքը չենք փոփոխել։

Վերջնական փաթեթի ստուգում՝ 37 փոփոխված/նոր ֆայլ, 1 ջնջվող՝ icons/icon.svg։ ZIP integrity և բոլոր ֆայլերի բայթային համեմատությունը՝ PASS։
Բ5.1-ի նշանների կրկնակի ստուգում՝ Edge 4/4, WebKit 4/4 PASS, JS 0։
Սկզբնաղբյուրի վեց պատկերակների բայթային համեմատությունը, Բ5.1 map-ի պահպանումը, storage/cache PREFIX-ի անփոփոխությունը և SW FILES-ի առկայությունը՝ PASS։
privacy-check՝ PASS, 256 տեքստային ֆայլ։
