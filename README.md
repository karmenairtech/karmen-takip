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
2. **Ekip ve yetkiler** → **Kayıtları içe aktar** → `karmen-veri.json` dosyasını seçin.
3. Aynı panelde her kişinin e-postasını ve rolünü yazıp **Ekibi kaydet**. Ad Soyad, işlerdeki "Sorumlu" adıyla birebir aynı olmalı.

### 6. Telefona kurulum
- **Android (Chrome):** siteyi açın → menü (⋮) → **Uygulamayı yükle** veya **Ana ekrana ekle**.
- **iPhone (Safari):** siteyi açın → Paylaş → **Ana Ekrana Ekle**.

## Roller

| Rol | Yetki |
|---|---|
| Yönetici | İş ekler, düzenler, siler; ekibi ve yetkileri yönetir; kayıt içe aktarır |
| Üye | Geri bildirim yazar; sorumlusu olduğu işlerin tamamlanma oranını günceller; kendi geri bildirimini silebilir |
| İzleyici | Yalnızca görür |

Ekipte olmayan biri giriş yaparsa "Erişim izni bekleniyor" ekranını görür ve hiçbir veriyi okuyamaz. E-posta/şifre ile kaydolanlar e-postalarını doğrulamadan giremez.

## Güncelleme
Değişen dosyaları GitHub'da aynı yere tekrar yükleyin. Telefonlar yeni sürümü bir sonraki açılışta alır. Uygulama kabuğunu tamamen yenilemek gerekirse `docs/sw.js` içindeki `karmen-takip-v1` değerini `v2` yapın.

## Bilinen sınırlar
- iPhone'da ana ekrandan açılan uygulamada Google penceresi açılmazsa e-posta/şifre ile giriş yapın.
- 17:45 hatırlatma bildirimi bu sürümde yok; Firebase Blaze planı ve zamanlanmış fonksiyon gerektirir.
