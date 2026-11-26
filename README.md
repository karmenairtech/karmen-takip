# Kar-Men Proje Takip

KARMEN MRP-ERP Dönüşüm Projesi iş takip ekranı. Veriler Firebase (Firestore) üzerinde tutulur, giriş Google veya e-posta/şifre ile yapılır. Telefona uygulama gibi kurulabilir (PWA).

## Klasör yapısı

| Yol | Ne işe yarar |
|---|---|
| `docs/` | Sitenin kendisi (GitHub Pages bu klasörü yayınlar) |
| `docs/config.js` | Firebase proje bilgileri ve her zaman yönetici olan hesap |
| `firestore.rules` | Veritabanı güvenlik kuralları |
| `firebase.json`, `.firebaserc` | İleride Firebase Hosting'e geçmek isterseniz kullanılır |

> `karmen-veri.json` (önceki kayıtlar) bu klasörde **yoktur** ve GitHub'a **yüklenmemelidir**. Herkese açık depoda herkes görebilir.

## Kurulum (program kurmadan, yalnızca tarayıcıdan)

### 1. Güvenlik kurallarını yayınlayın
Firebase Console → **Firestore Database** → **Kurallar (Rules)** sekmesi. İçindekini silin, `firestore.rules` dosyasının tamamını yapıştırın, **Yayınla (Publish)**.

### 2. GitHub deposunu açın
1. github.com → **New repository** → ad: `karmen-takip` → **Public** → Create.
2. **Add file → Upload files** → bu klasördeki her şeyi (docs klasörü dahil) sürükleyip bırakın → **Commit changes**.

### 3. GitHub Pages'i açın
Depoda **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, klasör: **/docs** → **Save**.
1–2 dakika sonra site şu adreste açılır: `https://KULLANICI-ADINIZ.github.io/karmen-takip/`

### 4. Site adresini Firebase'e tanıtın
Firebase Console → **Authentication → Settings → Authorized domains → Add domain** → `KULLANICI-ADINIZ.github.io` yazın (https ve klasör olmadan).

### 5. İlk giriş ve verilerin aktarılması
1. Siteyi açın, **planlama.karmen@gmail.com** ile Google girişi yapın (bu hesap her zaman yöneticidir).
2. Ana ekranda **Yetkilendirme** → **Kayıtları içe aktar** → `karmen-veri.json` dosyasını seçin.
3. Aynı ekranda her kişinin e-postasını, sistem rolünü ve modül yetkilerini girip **Kaydet**. Ad Soyad, işlerdeki "Sorumlu" adıyla birebir aynı olmalı.

### 6. Telefona kurulum
- **Android (Chrome):** siteyi açın → menü (⋮) → **Uygulamayı yükle** veya **Ana ekrana ekle**.
- **iPhone (Safari):** siteyi açın → Paylaş → **Ana Ekrana Ekle**.

## Ana ekran
Giriş yapınca ana ekranda modül kutuları açılır: **Proje Takip**, **Stok**, **Dış İş Takip**, **Personel Takip** ve **Planlama** (aktif); Satınalma ve Sipariş Takip (hazırlanıyor). Hazırlanan modüller açıldığında planlanan kapsamı ve ilgili proje işlerini gösterir. Her ekrandaki üst çubuktan ana ekrana dönülür.

## Planlama
Alt menüler: **Genel bakış · İş emirleri · Gün sonu girişi · Planlama çizelgesi · İş akış şemaları · İş istasyonları**.

- **İş istasyonları:** İş İstasyonları.xlsx'teki 38 istasyon + akışlarda geçen DEPO-1, BKL-1, MNT-3 tek tuşla yüklenir. Her istasyon ayrı güncellenir: bölüm, durum (Çalışıyor / Bakımda / Arızalı / Pasif), operatör, günlük çalışma, hedef verim, bakım tarihleri, not. Kartta o an çalışılan iş ve kuyruk görünür.
- **İş akış şemaları:** Ürün İş Akış Şemaları.xlsx'teki 22 ürün tek tuşla yüklenir. Her operasyon: ad, tanım, istasyon, alternatif istasyon, önceki operasyon(lar), dk/adet, hazırlık dk, sorumlu, kalite kontrol noktası, SOP no. "Önceki" alanına göre diyagram çizilir; paralel hatlar birleşme noktasında buluşur. Durum Excel'deki gibi hesaplanır (İstasyon / Süre / SOP bekleniyor, Tamam); kopuk bağlantılar uyarılır.
- **İş emirleri:** şema seçilerek açılır, operasyonlar şemadan kopyalanır. Siparişe üretim ya da stoka üretim. İlerleme %, verimlilik % (plan süre ÷ gerçek süre), fire ve kalite oranı, termine göre tahmini bitiş ve risk, siparişe bağlı iş emirlerinin toplam ilerlemesi. **Yazdır** sahada elle doldurulacak A4 iş emri kağıdını verir (tarih, yapılan adet, fire, süre, operatör, imza sütunlarıyla).
- **Gün sonu girişi:** kağıt iş emirlerindeki günlük bilgiler (yapılan adet, fire, süre, operatör, bitti) tüm açık iş emirleri için tek ekrandan toplu girilir. Tablete geçildiğinde operasyonlarda Başlat / Duraklat / Bitir de kullanılabilir.
- **Planlama çizelgesi:** açık iş emirleri öncelik ve termine göre, öncül operasyonlar ve istasyon doluluğu dikkate alınarak istasyonlara yerleştirilir (her istasyon aynı anda tek iş; alternatif istasyon boşsa ona verilir). Termine yetişmeyen iş emirleri kırmızı görünür.
- **Fire / hurda:** operasyon bazında girilir; genel bakışta son 30 günün istasyon bazında fire oranı (özellikle lazer / plazma) görünür.
- **Deneme iş emirleri:** Ayarlar'dan 15 örnek iş emri eklenip tek tuşla silinir. Örnek süreler yalnızca bu iş emirlerine yazılır, akış şemaları değişmez.
- **Yetkiler:** iş emri oluşturma/düzenleme · operasyon ve gün sonu girişi · akış şeması düzenleme · istasyon ve ayarlar · iş emri silme. Kullanıcı seviyesi gün sonu/operasyon girişi yapar; Düzenleyici hepsini.

## Teklifler (Sipariş Takip → Teklifler)
- Müşteri (yazarak arama), yetkili, şantiye, teslim süresi/türü, ödeme, geçerlilik, para birimi (varsayılan USD), dil (TR/EN).
- Kalemler stoktan, ölçüden ya da serbest; W/H/N ölçü, renk, varyasyon, açıklama. Stok kartındaki fotoğraf teklifte görsel olarak çıkar; serbest kaleme görsel yüklenebilir.
- Müşteri iskontosu cari karttan gelir, kalem bazında değiştirilebilir. PDF'te iskonto ve liste fiyatı görünmez; net birim fiyat yazılır.
- Teklif no: KRM-YYAAGG-NNN. Gönderilmiş teklifte değişiklik REV02, REV03… olarak saklanır.
- Düğmeler: PDF indir, WhatsApp gönder, Mail gönder (cari yetkilisi ya da yazılan numara/e-posta), Siparişe dönüştür, Kopya oluştur. Durumlar: taslak, gönderildi, müşteri onayladı, siparişe dönüştü, kaybedildi (neden), süresi doldu.
- Satış liste fiyatları: `satis_fiyat` koleksiyonu; Excel'den toplu yükleme (Stok kodu, Liste fiyatı, Para birimi) ya da stok kartından tek tek.
- Ayarlar: firma bilgileri, genel şartlar (TR/EN), varsayılan geçerlilik ve teslim süresi, kaşe.

## Sevkiyat
- Sipariş Takip'ten ayrıldı. Sevk bekleyen siparişler, sevkiyat kaydı (irsaliye, araç, teslim alan, kalem miktarları), paketleme listesi PDF'i ve WhatsApp / e-posta ile müşteriye gönderim.
- Yetki: `sv.sevk`.

## Planlama (v30)
- Genel bakış: sipariş kartları; termine 7 günden az kalan kırmızı, 7–14 gün turuncu, 14 günden fazla yeşil.
- Planlanacak işler: sipariş bazında "Siparişi iş emrine dönüştür" (her kalem ayrı alt iş emri) ya da ürün bazında (benzer işler).
- İş emirleri: ana sipariş satırı, tıklayınca alt iş emirleri.
- Boyasız yüzeylerde (galvaniz, ham, paslanmaz) renk kodu yok; iş emrinde boya adımı atlanır.

## Sipariş Takip
- **Sipariş girişi:** müşteri (Cari'deki müşteri kartlarından), proje bilgileri (proje adı ve tipi, müteahhit, şantiye yetkilisi, teslim adresi, sevkiyat şekli), müşteri sipariş no, teklif no, ödeme şartı, istenen ve verilen termin, öncelik, not ve ek dosyalar (PDF/görsel, en fazla 5 MB).
- **Kalemler:** stokta arama, ölçüden ekleme (seri ürünlerde genişlik × yükseklik → kod; kart yoksa açılır) ya da serbest kalem. Her kalemde renk, varyasyon seçimleri, özel istek, mahal/etiket ve kalem termini vardır. Varyasyon stok kartında değil, sipariş satırında tutulur.
- **Renk teyidi:** siparişin varsayılan rengi yeni kalemlere gelir. Farklı renk seçilen kalemde "emin misiniz" sorulur. Onaylarken renk özeti açılır ve her renk ayrı işaretlenmeden onay verilmez. Müşterinin daha önce hiç kullanmadığı renk ya da aynı projede farklı renk varsa uyarı çıkar. Renk örnekleri ekranda yaklaşıktır.
- **Planlama havuzu:** onaylanan siparişlerin (acil dahil) kalemleri Planlama'daki **Planlanacak işler** sekmesine düşer. Aynı ürün + renk + varyasyondaki kalemler tek satırda toplanır. Oradan iş emrine çevrilir (iş akış şeması stok kodundan seçilir; birden çok sipariş tek iş emrinde birleşebilir) ya da stoktan karşılanır (stok siparişe ayrılır, stok kartında "siparişlere ayrılan" görünür).
- **Termin:** istenen, verilen (onay için zorunlu), tahmini bitiş (bağlı iş emirlerinden) ve gerçek sevk. Verilen termin değişince neden sorulur ve kayda geçer. Tahmini bitiş verilen termini geçerse "termin riski" çıkar.
- **Revizyon:** onaylı siparişte yapılan değişiklik revizyon numarasıyla kaydedilir; iş emri açılmış kalem değişirse kalem işaretlenir ve planlamaya uyarı düşer.
- **Satış fiyatları:** ayrı belgede tutulur (`siparis_fiyat`); yalnızca `sp.fiyat` yetkisi olanlar görür ve girer.
- **Sevkiyat:** irsaliye no, araç, teslim alan ve kalem bazında miktar. Kısmi sevk desteklenir. Stoktan karşılanan miktar sevk edilince stoktan çıkış hareketi yazılır. Her sevkiyat için paketleme listesi PDF'i alınır. Fatura numarası (Bilsoft) elle işaretlenir.
- **Satın alma bağlantısı:** sipariş kartından o sipariş için satın alma talebi açılır; bağlı talepler ve satın alma siparişleri kartta görünür.
- **Sipariş teyit formu:** renk örnekli, isteğe göre fiyatlı A4 PDF; müşteri onayı için.
- **Ayarlar:** varyasyon listesi (`önekler | Varyasyon adı: seçenek, seçenek`) ve sık kullanılan RAL renkleri.
- **Yetkiler:** `sp.edit` sipariş girme/onaylama, `sp.fiyat` satış fiyatları, `sp.sevk` sevkiyat, `sp.cfg` ayarlar, `sp.delete` silme. Eski tip (üye/izleyici) kayıtlara sipariş işlemi açılmaz; Yetkilendirme ekranından verilmelidir.

## Satınalma
- **Akış:** talep (ihtiyaç bildirimi) → onay → gerekirse fiyat talebi (birden çok firmaya) ve teklif karşılaştırma → sipariş → tedarikçiye gönderim → mal kabul (stoğa giriş) → e-Fatura eşleştirme.
- **Onay:** KDV hariç tutar *büyük sipariş sınırı* (varsayılan 100.000 TL) ve üstündeyse büyük onaycılar (Feyzullah KILIÇ, Birkan KILIÇ), altındaysa küçük onaycılar (Vildan, Hasan Hüseyin ERGUN) onaylar; büyük onaycılar küçükleri de onaylayabilir. Talebin tutarı son alış fiyatlarından tahmin edilir. Onaylı talepten açılan sipariş, tutar seviyesi aşılmadıkça yeniden onaya gitmez; talepsiz sipariş kendi tutarına göre onaya gider. Onaycı kendi açtığı kaydı açarken onaylamış olur. Sınır ve onaycılar *Ayarlar*'dan değiştirilir.
- **Sipariş ve fiyat talep formu (PDF):** logo, firma ve tedarikçi bilgileri (unvan, adres, vergi no, yetkili), sipariş / talep / fiyat talep / proforma numaraları, termin, ödeme, teslim yeri, kalemlerin stok kodu, tanımı ve tedarikçi ürün kodu, tutarlar, standart sipariş şartları ve imza alanları.
- **Gönderim:** *WhatsApp* ve *E-posta* düğmeleri. Telefonda PDF doğrudan paylaşım ekranına gelir; bilgisayarda PDF indirilir ve tedarikçinin WhatsApp sohbeti ya da e-posta taslağı hazır metinle açılır. Gönderimler kaydedilir. (Tamamen otomatik gönderim için Blaze planı ve sunucu fonksiyonu gerekir.)
- **Mal kabul:** gelen ve reddedilen miktar ayrı girilir; sağlam miktar stoğa giriş hareketi olur, ret ve iadeler tedarikçinin kalite puanına işlenir. Kısmi teslim desteklenir. *Tedarikçiye iade* stoktan çıkış yazar.
- **e-Fatura:** UBL-TR XML ya da .zip yüklenir. Tedarikçi vergi numarasıyla bulunur (yoksa kart açılır). Satırlar tedarikçi ürün kodu → sipariş kalemi → ad benzerliğiyle stok kartlarına eşleştirilir; onaylanan eşleşmeler öğrenilir (cari_eslesme), sonraki faturalar kendiliğinden eşleşir. Eşleşmeyenler için seçilen kod grubundan yeni kart açılır, nakliye/hizmet satırları stoğa işlenmez. Fiyatlar fiyat arşivine işlenir, sipariş fiyatından sapmalar gösterilir. Stok girişi normalde mal kabulde yapılır; istenirse faturadan da yapılabilir.
- **Fiyat arşivi:** tek kaynak stok kartındaki arşivdir; kayıtlarda kaynak (sipariş, e-Fatura, teklif), belge ve tedarikçi tutulur. Teklif fiyatları güncel alış fiyatını değiştirmez. Kartta *tedarikçiye göre fiyatlar* tablosu vardır.
- **Stok bağlantısı:** stok kartında yoldaki miktar (açık siparişler) ve *Talep aç* düğmesi; talep formunda *Kritik seviyedeki stokları ekle* (hedef: maksimum stok ya da minimumun 2 katı, yoldaki düşülür).
- **Tedarikçi puanı (son 6 ay):** termine uyum %35 (her gecikme günü −10), kalite %30 (ret + iade), fiyat %20 (aynı ürünün diğer tedarikçi fiyatlarına göre), iletişim ve hizmet %15 (elle). A 85+, B 70–84, C 70 altı; önceki 6 ayla karşılaştırılır.
- **Özetler:** onay bekleyenler, geciken ve 7 gün içinde gelecek siparişler, aylık satın alma, tedarikçi dağılımı, en çok alınan ürünler. Deneme verileri tek düğmeyle eklenir ve silinir.

## Cari
- Müşteriler ve tedarikçiler aynı modülde iki sekmede; bir firma ikisi birden olabilir. Unvan, kısa ad, Bilsoft muhasebe kodu, vergi dairesi/no, MERSİS, adres, telefon, WhatsApp, e-posta, vade, para birimi, IBAN, yetkililer.
- Tedarikçi kartında satın alma geçmişi, alınan ürünler ve son fiyatlar, faturalar ve puan ayrıntısı; müşteri kartında bağlı iş emirleri (Sipariş Takip modülü açılınca siparişler).
- *Stok kartlarındaki tedarikçileri aktar*: stok kartlarına yazılmış tedarikçi adlarından cari kart açar ve kartları bağlar.
- Cari bakiye (borç/alacak) şimdilik muhasebe programında (Bilsoft) tutulur.

## CV Arşivi
- İş görüşmesine gelen / başvuru yapan adaylar **Mavi yaka** ve **Beyaz yaka** sekmelerinde tutulur.
- **Ortak alanlar:** ad soyad*, telefon*, e-posta, doğum yılı, askerlik, il/ilçe, ehliyet, ulaşım; başvurulan pozisyon*, departman, başvuru tarihi*, kaynak (Kariyer.net, İŞKUR, referans…), referans kişi; eğitim, okul, bölüm, toplam deneyim, son işyeri ve pozisyon, ayrılış nedeni; beklenen net ücret, ne zaman başlayabileceği; durum, genel puan, notlar.
- **Mavi yaka:** meslek/ustalık, seviye (usta, kalfa, operatör…), vardiya, teknik resim, kullanabildiği makineler, belgeler (MYK, ustalık, kaynakçı sertifikası, forklift, İSG…), uygulama/deneme işi sonucu.
- **Beyaz yaka:** iki yabancı dil ve seviyesi, bilgisayar/yazılımlar (Excel, AutoCAD, SolidWorks, ERP…), seyahat engeli, LinkedIn.
- **Görüşmeler:** tarih, saat, tür (yüz yüze, telefon, online, uygulama), görüşmeci, puan (1–5), not; ileri tarihli görüşme planlanabilir, sonucu sonra girilir. Durumlar: yeni başvuru → görüşme planlandı → görüşüldü → olumlu/havuzda → teklif → işe alındı / olumsuz / aday vazgeçti.
- **CV dosyası:** PDF ya da fotoğraf (en fazla 5 MB), Firestore'da 900 KB'lık parçalar halinde saklanır (Spark planında Storage yok); kart içinde görüntülenir ve indirilir.
- Aynı telefon ya da adla önceki başvuru varsa uyarır. İşe alınan aday tek tuşla **Personel Takip**'e aktarılır.
- **KVKK:** kişisel veridir; yalnızca CV Arşivi yetkisi açıkça verilenler görür (eski tip kayıtlara kapalı). Aydınlatma/onay kutusu ve saklama süresi (varsayılan 2 yıl) tutulur; süresi dolanlar işaretlenir ve toplu silinebilir.

## Stok
Stok kartları, depo adresleri, giriş–çıkış hareketleri ve alış fiyatları.

- **Stok kartı:** stok kodu (benzersiz; **Öner** ana gruba göre sıradaki kodu verir, örn. HAM-0007), stok adı, stok tanımı, ana grup, alt grup, bulunduğu depo, depo içi adres (raf-göz), birim, stok adedi, minimum (kritik) ve maksimum stok, barkod, ürün fotoğrafı, tedarikçi detayı (firma, yetkili, telefon, e-posta, tedarikçi ürün kodu, teslim süresi, minimum sipariş, alternatif tedarikçi), alış fiyatı (TL/USD/EUR, KDV) ve notlar. Kullanılmayan kalem **Pasif** yapılır.
- **Kod sistemi:** `M-0101 00001` = genel kod (M Mamul, YM Yarı mamul, H Hammadde, S Sarf, AS Al-sat, A Aksesuar) · 2 haneli ana grup · 2 haneli alt grup · 5 haneli sıra. Ana/alt grup kodları **Gruplar ve depolar** ekranındaki "Kod sistemi" alanında tutulur (`M-01 Tek sıra kanatlı menfez: 01 Dampersiz, 02 Damperli`). Kartta tip + ana grup kodu + alt grup kodu seçilip **Öner**'e basınca sıradaki kod verilir; aynı kod ikinci kez girilemez.
- **Mamul kod kataloğu:** Stok Tespit Formu'nda işaretlenen mamullerin 7.056 kodu tek tuşla yüklenir (TSK/ÇSK/Lineer menfez dampersiz-damperli, TSK damperi, dış hava panjurları: 100×100–2000×2000, 50 mm adımlı; lineer ve gizli tavan slot difüzör tekli–5'li 1000 mm; müdahale kapakları 200×200–800×800). Var olan kodlar atlanır.
- **Çok sayıda kart:** liste sunucuda süzülür ve en fazla 200 kart (Daha fazla ile artar) gösterilir; arama kod önekiyle (`M-0102`) ya da kelime/ölçüyle (`çift damperli 300x200`) yapılır. Böylece binlerce kartta da ücretsiz planın günlük okuma sınırı aşılmaz.
- Minimum stoku tanımlı olmayan (siparişe üretilen) kalem 0 olduğunda "Stok yok" görünür, uyarı sayılmaz; minimumu tanımlı kalem bitince "Stokta yok" uyarısı çıkar.
- **Stok adedi** yalnızca hareketle değişir: **+ Giriş** (irsaliye/fatura no, neden, isteğe bağlı yeni alış fiyatı), **− Çıkış** (belge/iş emri no, verildiği yer; stoktan fazlası çıkılamaz), **Sayım** (sayılan miktar girilir, fark düzeltme hareketi olur). Aynı anda iki kişi hareket girse de miktar doğru toplanır.
- **Stok hareketleri** sekmesi ay ay tüm hareketleri, kartın içindeki sekme o kalemin bütün geçmişini gösterir.
- **Alış fiyatı arşivi:** her fiyat değişikliği tarih, tedarikçi, not ve giren kişiyle saklanır; grafik ve değişim yüzdesi görünür.
- Seviye renkleri: stokta yok (kırmızı), kritik (turuncu, minimum ve altı), fazla (mavi, maksimum üstü). Üst bantta kalem sayısı, kritik, stokta yok, aylık hareket ve stok değeri (alış fiyatıyla) görünür.
- **Excel'e aktar** (stok listesi ve hareketler) ve **Toplu aktar**: .xlsx dosyası seçilir ya da satırlar yapıştırılır; sınır yok. Var olan kodlar kod önekine göre sayılarak ayıklanır (az okuma), kartlar 400'lük partilerle yazılır; kota dolup kesilirse aynı dosya tekrar yüklenince kaldığı yerden devam eder. Yeni ana/alt gruplar kod sistemine eklenir.
- **Ölçüden kod bul:** ölçü serili mamullerde (TSK, ÇSK, lineer, DHP, hava ayar damperi, yuvarlak kanal, yangın damperi, kapı transfer, müdahale kapağı, kare petek) ürün + genişlik × yükseklik girilince kod, sıradaki numaraya göre değil ölçüye göre hesaplanır (100×100 → 00001, 1000×1000 → 00190, 2000×2000 → 00780). Listede 1000×1000'e kadar olan kodlar var; üstü ayrılmıştır, kart yoksa tek tuşla açılır.
- **Genel grup:** M Mamul · YM Yarı mamul · H Hammadde · S Sarf · AS Al-sat · A Aksesuar; kartın üst kısmında ve listede görünür, boşsa stok kodundan okunur.
- **Gruplar ve depolar** ekranında ana/alt grup ve depo listesi tutulur. Buradan **5 deneme ürünü** (hareket ve fiyat geçmişiyle) eklenip tek düğmeyle silinebilir.
- **Yetkiler:** kart ekleme/düzenleme · giriş/çıkış · sayım · alış fiyatlarını görme · silme · grup ve depo listesi. Kullanıcı seviyesi giriş/çıkış yapar; Düzenleyici hepsini. **Alış fiyatları** ayrı koleksiyondadır; fiyat yetkisi olmayan veritabanından da göremez. Eski tip (Üye/İzleyici) kayıtlar stoku görür ama işlem yapamaz; işlem yetkisi Yetkilendirme ekranından verilir.

## Dış İş Takip
Dışarı çıkan personelin işleri: personel, araç, iş türü, tanım, gidilecek yer, öncelik, plan tarihi, tahmini dönüş, çıkış ve giriş saati, araç km, masraf, ödeme şekli, fiş/fatura, dönüş notu, fotoğraf/PDF ekleri ve hareket geçmişi.

- Yönetici **Araçlar ve personel** düğmesinden her aracı ayrı satır olarak girer: plaka, araç adı, **durum** (Müsait / Arızalı / Serviste) ve not. Arızalı ve servisteki araçlar işe seçilemez, çıkış yapılamaz; araç şeridinde kırmızı/turuncu görünür. Dışarı çıkan personel her satıra bir kişi yazılır.
- İş açarken araç boş bırakılabilir ("Sonra seçilecek"). Araçsız işte **Çıkış yap** denince araç seçme penceresi açılır.
- **Çıkış birleştirme:** aynı araç seçilip 1 dakika içinde birden fazla işte Çıkış yap denirse bu işler tek çıkışta birleşir (görevler, ekler ve masraflar ilk işe taşınır, diğer iş listeden kalkar). "Kendi aracı" / "Araçsız" seçeneklerinde aynı personelin işleri birleşir.
- **Çıkış yap / Giriş yap** düğmeleri saati tek dokunuşla kaydeder. Tahmini dönüş saati geçen iş kırmızıya döner.
- Ana listede yalnızca açık işler görünür. Dönüşü yapılan ve iptal edilen işler **Tamamlanan işler** arşivine geçer; arşiv dönüş tarihine göre filtrelenir (bugün, dün, bu hafta, bu ay, geçen ay).
- Bir çıkışa birden fazla iş eklenebilir (**+ İş ekle**). Her işin kendi türü, tanımı, yeri, masrafı, **masraf tipi** (Nakit / Kredi kartı / Cari hesap / Firma ödedi), **notu** ve sonucu (Bekliyor / Yapıldı / Yapılamadı) vardır.
- İşin personeli, formu düzenleme yetkisi olmasa da kendi işlerine not, masraf ve masraf tipi girip **Notları kaydet** diyebilir.
- Personel her işi ayrı ayrı **✓ Bitir** ile kapatır. İşin personeli (uygulamadaki adı işteki "Personel" adıyla aynıysa) kendi işinde çıkış/giriş ve bitirme yapabilir.
- **Günlük rapor (PDF)** seçilen günün özetini, iş listesini, personel özetini ve imza alanlarını A4 yatay PDF olarak indirir.
- Ekler Firestore'da saklanır (ücretsiz plan): fotoğraflar küçültülür, PDF en fazla 600 KB, iş başına 10 dosya.
- Kimin iş açacağı, çıkış/giriş yapacağı, sileceği veya rapor alacağı **Yetkilendirme** ekranından belirlenir.

## Personel Takip
Günlük devam (yoklama), izinler ve personel listesi.

- **Personel listesi:** ad soyad, TC kimlik no (doğrulamalı), departman, iş tanımı, ev adresi, telefon, acil durumda aranacak kişi, işe giriş tarihi ve yıllık izin hakkı. **Listeden toplu ekle** ile Excel'den kopyalanan liste (Ad Soyad; Departman; İş tanımı; Telefon) tek seferde eklenir. Ayrılan personel "İşten ayrıldı" ile işaretlenir; geçmiş kayıtları korunur.
- **Günlük yoklama:** her kişi için Fabrikada / Geç geldi / İzinsiz gelmedi / Günlük izinli / Yıllık izinli / Raporlu / Ücretsiz izinli. **✓ Geldi** tek dokunuştur; geç gelende geliş saati (mesai başlangıcına göre kaç dakika geç kaldığı hesaplanır), gelmeyende sebep istenir; sebep alanının altındaki hızlı düğmelerle (Hastalık, Ailevi mazeret, Ulaşım sorunu, Okulda, Resmi işlem, Habersiz gelmedi, Diğer) tek dokunuşla seçilir. Erken çıkış saati ve not girilebilir. **Kalan kişileri fabrikada işaretle** ile işaretlenmemişler toplu işaretlenir. Dış işte olan personelde "Dış işte" etiketi görünür.
- **İzinler:** başlangıç–bitiş tarihli izin kaydı (yıllık, günlük/saatlik, sağlık raporu, ücretsiz). Aralıktaki günler yoklamaya kendiliğinden işlenir. İş günü sayısı Pazar (ve ayara göre Cumartesi) hariç hesaplanır; resmi tatil varsa elle düzeltilir. Çakışan izinde uyarı verilir. **Yıllık izin bakiyeleri** hak, kullanılan ve kalan günü gösterir; hak girilmemişse kıdeme göre (1–5 yıl 14, 5–15 yıl 20, 15+ yıl 26 gün) hesaplanır.
- **Aylık özet:** kişi × gün renkli devam tablosu, kişi başına geldi / geç / izinsiz / izin / rapor toplamları. Hücreye tıklayınca o günün kaydı açılır. **Excel'e aktar** CSV dosyası indirir.
- **Ayarlar:** mesai başlangıcı, geç toleransı, Cumartesi çalışma günü mü.
- **Yetkiler** (Yetkilendirme ekranında "Personel" sütunu): Kullanıcı seviyesi yoklama girer; Düzenleyici izin girer, listeyi düzenler ve kişisel bilgileri görür. **Kişisel bilgiler (TC, adres, telefon)** ayrı bir işlem yetkisidir ve ayrı koleksiyonda tutulur; yetkisi olmayan bu bilgileri veritabanından da okuyamaz. Eski tip (Üye/İzleyici) kayıtlar bu modülü göremez; yetki açıkça verilmelidir.
- Kişisel veriler KVKK kapsamındadır: yalnızca gereken kişilere "Kişisel bilgileri görme" yetkisi verin.

## Yetkilendirme
Ana ekrandaki **YETKİLENDİRME** kutusu yalnızca yöneticilere görünür. Ekip listesi ve tüm yetkiler buradan yönetilir.

**Sistem rolü:** *Yönetici* her modülde tam yetkilidir ve bu ekrana girer. *Kullanıcı* yalnızca kendisine verilen modül ve işlemleri görür.

**Modül seviyeleri (her kişi, her modül için ayrı):**

| Seviye | Anlamı |
|---|---|
| Erişim yok | Modül ana ekranda görünmez, verileri okunamaz |
| Gözlemci | Kayıtları görür, değişiklik yapamaz (Dış İş'te rapor alabilir) |
| Kullanıcı | Günlük işini yapar (geri bildirim, mesaj, kendi işinin oranı; dış iş açma, çıkış–giriş, kendi işini düzenleme, rapor) |
| Düzenleyici | Modüldeki tüm işlemler |

**İşlemler** düğmesiyle kişiye özel ayar yapılır: seviyenin varsayılan işlemleri tek tek açılıp kapatılabilir (örn. Kullanıcı + "İş iptal etme"). Özelleştirilen modülde "özel" etiketi görünür.

- Proje Takip işlemleri: iş ekleme/düzenleme/silme · tüm işlerin oranı · sorumlusu olduğu işin oranı · geri bildirim
- Genel: mesaj gönderme (tablodaki **Mesaj** sütunu)
- Dış İş işlemleri: dış iş oluşturma · çıkış/giriş · kendi işini düzenleme · tüm işleri düzenleme · iptal · silme · araç ve personel listesi · günlük rapor
- Stok işlemleri: stok kartı ekleme/düzenleme · giriş/çıkış · sayım · alış fiyatlarını görme · silme · grup ve depo listesi
- Planlama işlemleri: iş emri oluşturma/düzenleme · operasyon ve gün sonu girişi · akış şeması düzenleme · istasyon ve ayarlar · iş emri silme
- Personel işlemleri: günlük yoklama · izin kaydı · personel listesi ve ayarlar · kişisel bilgileri görme (TC, adres, telefon)

Yetkiler Firestore güvenlik kurallarıyla da uygulanır; ekranda gizlenen işlem, veritabanında da reddedilir. Kaydedilen değişiklik kişinin ekranına anında yansır. Eski "Üye" kayıtları Kullanıcı, "İzleyici" kayıtları Gözlemci olarak açılır; Yetkilendirme ekranında bir kez kaydedince yeni yapıya geçer.

## E-posta/şifre hesapları
Uygulamada "kaydol" seçeneği yoktur ve e-posta doğrulaması istenmez. Hesapları yönetici açar:

1. Firebase Console → **Authentication → Users → Add user** → e-posta ve geçici şifre yazın.
2. Aynı e-postayı uygulamada **Yetkilendirme** ekranına ekleyin.
3. Şifreyi kişiye iletin; kişi giriş ekranındaki **Şifremi unuttum** ile kendi şifresini belirleyebilir.

**Sıra önemli:** Bir e-postayı ekip listesine eklemeden önce o e-postanın hesabını konsolda açın. Hesabı açılmamış bir e-posta listede durursa, başkası o adresle hesap açıp yerine girebilir.

Ek önlem olarak, konsolda **Authentication → Settings → User actions** bölümü görünüyorsa **Enable create (sign-up)** seçeneğini kapatın. Böylece dışarıdan hiç kimse hesap açamaz.

## Mesajlar
Üst çubuktaki **konuşma balonu** simgesi (zilin solunda) her ekrandan mesaj panelini açar; okunmamış sayısı mavi rozette görünür.
- **Tüm ekip:** ekip listesindeki herkes görür. Yönetici bu kanaldaki her mesajı silebilir.
- **Özel mesaj:** yalnızca gönderen ve alıcı görür; yönetici dahil başka kimse okuyamaz.
- **Ek gönderme:** ataş düğmesiyle fotoğraf ve doküman (PDF, Word, Excel vb.) gönderilir; sürükle-bırak ve yapıştırma da çalışır. Fotoğraflar küçültülür, diğer dosyalar en fazla 700 KB.
- **Sesli mesaj:** mikrofon düğmesiyle en fazla 2 dakika kayıt gönderilir. İlk kullanımda tarayıcı mikrofon izni ister.
- Mesaj gönderme yetkisi Yetkilendirme ekranındaki **Mesaj** sütunundan verilir; mesajları herkes okuyabilir.

Mesajlar anında iletilir. Herkes kendi gönderdiği mesajı (ve ekini) silebilir.

## Arama (birebir sesli / görüntülü)
Özel sohbetin başlığındaki 📞 (sesli) ve 🎥 (görüntülü) düğmeleri uygulama içinden internet üzerinden arama başlatır.
- Aranan kişide uygulama açıksa (arka planda olsa da) "… sizi arıyor" ekranı çıkar: **Aç / Reddet**.
- Görüşmede mikrofon, kamera, ön/arka kamera değiştirme ve kapatma düğmeleri vardır. 40 saniye cevap gelmezse arama cevapsız sayılır.
- Her arama sohbete kayıt olarak düşer (süre, cevapsız, reddedilen) ve **Geri ara** düğmesi bulunur.
- Arama yetkisi **Mesaj** yetkisine bağlıdır. İlk aramada tarayıcı mikrofon/kamera izni ister.
- Uygulama tamamen kapalıyken arama çalmaz. Bazı mobil/şirket ağlarında doğrudan bağlantı kurulamazsa `docs/config.js` içindeki `EXTRA_ICE` alanına bir TURN aktarma sunucusu eklenir.

## Bildirimler
Üst çubuktaki **zil** son 7 günün size ait hareketlerini gösterir; okunmamış sayısı rozette görünür. Bildirime tıklayınca ilgili kayıt açılır.

- Dış iş: size atanan işler; açtığınız işlerde çıkış, dönüş, bitirilen görev, iptal ve geciken dönüş (yöneticiler tüm hareketleri alır)
- Proje takip: sorumlusu olduğunuz işlere yazılan geri bildirimler ve değişiklikler
- Mesajlar ve 17:00 sonrası "bugünkü geri bildirim eksik" hatırlatması
- **Ayarlar** sekmesinden her kişi bildirim türlerini açıp kapatır; cihaz bildirimine izin verirse uygulama arka plandayken telefon/bilgisayar bildirimi de gelir.
- Uygulama tamamen kapalıyken bildirim gelmez (ücretsiz plan); açınca zilde görünür.

## Güncelleme
Değişen dosyaları GitHub'da aynı yere tekrar yükleyin. Telefonlar yeni sürümü bir sonraki açılışta alır. Uygulama kabuğunu tamamen yenilemek gerekirse `docs/sw.js` içindeki `karmen-takip-v1` değerini `v2` yapın.

## Bilinen sınırlar
- iPhone'da ana ekrandan açılan uygulamada Google penceresi açılmazsa e-posta/şifre ile giriş yapın.
- 17:45 hatırlatma bildirimi bu sürümde yok; Firebase Blaze planı ve zamanlanmış fonksiyon gerektirir.
- Bildirimler yalnızca uygulama açıkken gelir (arka planda veya başka sekmede olsa da). Uygulama tamamen kapalıyken bildirim için Firebase Cloud Messaging ve Blaze planı gerekir.
