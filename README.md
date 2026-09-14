# DSDST Warehouse

Panel uygulamasından bağımsız, mobil öncelikli sipariş toplama PWA'sı. Ürün, sipariş, BOM ve stok verilerini yalnızca panelin Warehouse API'sinden okur. Yerel olarak yalnızca aktif toplama ilerlemesi saklanır.

## Mimari

```text
Browser/PWA → aynı origin /api → Warehouse Express BFF → Panel Warehouse API
                                      └─ x-api-key yalnızca burada eklenir
```

Browser hiçbir API anahtarı veya panel adresi bilmez. BFF yalnızca tanımlı sipariş, pick-plan ve scan rotalarını kabul eder; genel amaçlı proxy değildir. Panel yanıtları önbelleğe alınmaz, anahtar içeren alanlar veya metinler frontend'e dönmeden redakte edilir.

## Yerel geliştirme

```bash
node --version # 22.12 veya daha yeni olmalı
cp .env.example .env
# .env içindeki panel adresi ve Warehouse API anahtarını doldurun
npm install
npm run dev
```

Uygulama `http://localhost:3006` adresinde açılır. Geliştirmede Vite, `/api` isteklerini yerel BFF'nin 3007 portuna aktarır. Production'da Express hem statik frontend'i hem de `/api` rotalarını 3006 portundan sunar. BFF sunucudan sunucuya bağlandığı için panelde browser CORS izni gerekmez.

API anahtarı `read:warehouse_orders`, `read:products`, `read:bom` ve `write:warehouse_status` izinlerine sahip olmalıdır.

```env
PANEL_API_BASE_URL=http://panel-address:3000
WAREHOUSE_API_KEY=replace-with-warehouse-api-key
```

Bu değişkenler Vite build argümanı değildir. `.env`, Docker build context'ine de alınmaz.

## Docker

```bash
cp .env.example .env
# .env değerlerini doldurun
docker compose up --build -d
```

Cloudflare tarafında `depo.dsdst.com` origin'i `http://<sunucu>:3006` hedefine yönlendirilebilir.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

Service worker yalnızca uygulama kabuğunu önbelleğe alır. Warehouse API istekleri önbelleğe alınmaz; çevrimdışı yazma işlemleri engellenir.

`npm run build` sonrasında frontend çıktısı ayrıca API anahtarı ve yasaklı env adları için taranır.
