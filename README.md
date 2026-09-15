# DSDST Warehouse WMS

Panel uygulamasından bağımsız, mobil öncelikli sipariş toplama PWA'sı. Ürün, sipariş, BOM, stok ve toplama ilerlemesi için paneli tek veri kaynağı olarak kullanır; picking progress browser depolamasında tutulmaz.

Telefon ve tablette uygulama bir **Warehouse Operations Terminal** olarak; desktop'ta responsive sidebar, KPI dashboard, paket/lokasyon/hareket tabloları, kullanıcı aktivitesi, kapasite analizi ve salt-okunur 3D depo haritasıyla bir **Warehouse Management & Visualization System** olarak çalışır. İki deneyim de aynı BFF ve Panel DB verisini kullanır.

## Mimari

```text
Browser/PWA → aynı origin /api → Warehouse Express BFF → Panel Warehouse API
                 └─ HttpOnly JWT         └─ x-api-key + panel JWT yalnızca burada eklenir
```

Browser hiçbir API anahtarı, panel adresi veya JavaScript tarafından okunabilir JWT bilmez. Login sonucu BFF tarafından `HttpOnly`, `SameSite=Strict` cookie'ye çevrilir. BFF yalnızca tanımlı auth, toplama ve Warehouse Admin rotalarını kabul eder; genel amaçlı proxy değildir. Panel yanıtları önbelleğe alınmaz, anahtar/token içeren alanlar veya metinler frontend'e dönmeden redakte edilir.

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
# HTTPS üzerinden yayınlıyorsanız Secure cookie kullanın:
COOKIE_SECURE=true
```

Bu değişkenler Vite build argümanı değildir. `.env`, Docker build context'ine de alınmaz.

## Docker

```bash
cp .env.example .env
# .env değerlerini doldurun
docker compose up --build -d
```

Cloudflare tarafında `depo.dsdst.com` origin'i `http://<sunucu>:3006` hedefine yönlendirilebilir. Browser uygulamaya HTTPS ile ulaşıyorsa `.env` içinde `COOKIE_SECURE=true` kullanın; yalnız doğrudan HTTP ile yerel testte `false` bırakın.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

Service worker yalnızca uygulama kabuğunu önbelleğe alır. Warehouse API istekleri önbelleğe alınmaz; çevrimdışı yazma işlemleri engellenir. Login paneldeki mevcut kullanıcı adı/e-posta ve şifre ile yapılır; ayrı Warehouse kullanıcısı oluşturulmaz.

`npm run build` sonrasında frontend çıktısı ayrıca API anahtarı ve yasaklı env adları için taranır.

## Toplama geçmişi

Ana sayfadaki **Toplama Geçmişi** bağlantısı tamamlanan toplama oturumlarını gösterir. Bugün, dün, son 7 gün ve özel tarih aralığı yanında kullanıcı, SKU, ürün adı, sipariş/toplama numarası ve durum filtreleri bulunur. Özet kartları ve kullanıcı bazlı günlük operasyon özeti her zaman bugünün yerel gün sınırlarıyla hesaplanır.

Sipariş tamamlanırken isteğe bağlı operasyon notu Panel API'ye gönderilir. Kalıcı session/item/component snapshot'ı, ağırlık hesapları ve duplicate koruması Panel repository'sindeki tek transaction içinde uygulanır; Warehouse uygulaması bu kayıtları yalnız okur ve silme rotası sunmaz.

## Kamera ile tarama

Toplama adımındaki **Kamera ile Tara** düğmesi cihazın arka kamerasıyla QR ve yaygın 1D barkodları okur. Etikette kodlanan lokasyon, barkod veya SKU değeri mevcut sunucu doğrulamasına gönderilir. Kamera erişimi production'da HTTPS (veya yerel geliştirmede localhost) gerektirir; izin verilmezse manuel giriş kullanılmaya devam eder.

## Warehouse Admin

Yetkili kullanıcılar ana sayfadaki **Warehouse Admin** kartından mal kabul, etiketleme, paket yerleştirme, taşıma, lokasyon, sayım, baskı geçmişi ve merkezi şablon ekranlarına ulaşır. Mal Kabul ekranına CSV yüklenmez: kullanıcı Panel ürün master importunda tanımlanmış lotu girer, ortak server-side oturuma katılır ve tedarikçi no → etiket → önerilen lokasyon → raf okutma akışını tamamlar. Aktif oturum ve ilerleme kontrollü polling ile telefon, tablet ve PC'de ortak görünür; refresh işlem durumunu kaybettirmez. Etiketleme ve tüm paket/lokasyon adımları manuel girişin yanında aynı kamera tarayıcısını kullanır.

Erişim menüde gizlenmekle kalmaz: Panel API her işlem için ilgili `warehouse:*` kullanıcı yetkisini ayrıca kontrol eder. `admin` rolü tüm Warehouse Admin izinlerine sahiptir.

## 3D depo haritası

`/warehouse-map` route'u React lazy import ile ayrı chunk olarak üretilir. Three.js, React Three Fiber ve Drei kodu mobil başlangıç bundle'ına veya PWA precache manifestine alınmaz; kullanıcı haritayı açtığında yüklenir. Paketler tek `InstancedMesh` içinde çizilir. Kamera, seçim ve arama state'i 8 saniyelik snapshot yenilemelerinde korunur.

Harita salt-okunurdur. Paket taşıma, stok düzeltme ve yerleştirme mevcut yetkili operasyon akışlarına yönlendirilir. Canlı kapasite ve rezervasyonlar layout JSON'dan değil Panel API'den gelir.

Yeni kullanıcı izinleri:

- `warehouse:view_map`
- `warehouse:view_analytics`
