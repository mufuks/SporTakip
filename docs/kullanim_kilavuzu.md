# ⚡ SporTakip (Compound Athletic) | Hızlı Kullanım Kılavuzu

> **Butik Stüdyolar, Eğitmenler ve Sporcular İçin Pratik Başlangıç Rehberi**

Bu kılavuz; SporTakip platformunu en verimli şekilde kullanabilmeniz için roller bazında adım adım hazırlanmıştır.

---

## 📌 İçindekiler
1. [Giriş ve Giriş Bilgileri](#1-giriş-ve-giriş-bilgileri)
2. [🏃‍♂️ Sporcu (Atlet) Portalı](#2-🏃‍♂️-sporcu-atlet-portalı)
3. [🏋️ Koç / Eğitmen Masası](#3-🏋️-koç--eğitmen-masası)
4. [🏢 Salon Sahibi & Yönetici Paneli](#4-🏢-salon-sahibi--yönetici-paneli)
5. [🛡️ Süper Admin (Platform Yöneticisi)](#5-🛡️-süper-admin-platform-yöneticisi)
6. [📱 Uygulamayı Telefona İndirme (PWA)](#6-📱-uygulamayı-telefona-i̇ndirme-pwa)
7. [💡 Sıkça Sorulan Sorular ve Püf Noktaları](#7-💡-sıkça-sorulan-sorular-ve-püf-noktaları)

---

## 1. Giriş ve Giriş Bilgileri

Sistemde şifre unutma derdi yoktur; **şifresiz SMS / OTP doğrulama** kullanılır.

### 🔑 Test Hesapları (Doğrulama Kodu: `123456`)

| Rol | Kullanıcı | Telefon Numarası | SMS / OTP | Neler Görebilir? |
| :--- | :--- | :--- | :---: | :--- |
| **🛡️ Süper Admin** | Platform Yöneticisi | `+90 555 000 00 00` | `123456` | Tüm roller, kullanıcı rol atamaları, sistem ayarları |
| **🏢 Salon Sahibi** | SalonSahibi_1 (Sinan) | `+90 532 111 22 33` | `123456` | Ciro, kasa, bordrolar, paket yönetimi, üye listesi |
| **🏋️ Eğitmen / Koç** | Hoca_1 (Gülçin) | `+90 532 444 55 66` | `123456` | Saatlik yoklama, öğrenciye program yazma, hakediş |
| **🏃‍♂️ Sporcu / Atlet** | Atlet_1 | `+90 555 123 45 67` | `123456` | Seans rezervasyonu, idman kaydetme, kişisel program |

> **Giriş Adımı:**
> 1. Sağ üstteki **"Giriş Yap"** butonuna tıklayın.
> 2. Telefon numaranızı girip **"Doğrulama Kodu Gönder"** deyin.
> 3. Kodu (`123456`) girip **"Giriş Yap"** butonuna basın.

---

## 2. 🏃‍♂️ Sporcu (Atlet) Portalı

Sporcu ekranı antrenman motivasyonunu ve seans takibini kolaylaştırmak üzere tasarlanmıştır:

### A. Kalan Ders ve Paket Durumu
- Ana ekranda yer alan **yeşil Volt segmentli ilerleme çubuğu** ile tamamlanan ve kalan derslerinizi anında görürsünüz.
- Paketinizin son kullanım tarihi ve kalan gün sayısı kart üzerinde şeffaf şekilde gösterilir.

### B. Seans Rezervasyonu ve 3 Saat Kuralı
- **2 Haftalık Takvim:** Bulunduğunuz hafta ve gelecek haftanın seanslarını gün gün inceleyebilirsiniz.
- **Tek Tıkla Rezervasyon:** İstediğiniz saatteki seans kartında **"Derse Katıl"** butonuna basarak yerinizi ayırtabilirsiniz.
- **3 Saat İptal Kuralı:** 
  - Seansa 3 saatten fazla varken iptal ederseniz ders hakkınız **yanmaz**, iade edilir.
  - Seansa 3 saatten az süre kalmışsa sistem uyarı verir; yapılan geç iptallerde ders hakkı düşer.

### C. Size Özel Hazırlanan Programlar (Personal Workouts)
- Antrenörünüz size özel bir antrenman şablonu yazdığında, **Antrenman** sekmesinde en üstte **`🎯 KİŞİYE ÖZEL PROGRAM`** altın rozetiyle görünür.
- **"İdmanı Başlat"** diyerek doğrudan hocanızın belirlediği hareketler ve set sayılarıyla çalışmaya başlayabilirsiniz.

### D. Canlı İdman, Ghost Weight ve Dinlenme Sayacı
- **Ghost Weight (Geçen Haftaki Ağırlık):** Egzersiz kartlarının üstünde beliren `💡 Son İdman: X kg × Y tekrar` hapına dokunduğunuzda, önceki idmandaki ağırlıklar otomatik olarak set kutularına doldurulur (Progressive Overload takibi).
- **Akıllı Dinlenme Sayacı:** Bir seti tamamlayıp tiklediğinizde sağ altta **dinlenme sayacı** başlar. Süre bittiğinde telefonunuz titreşir ve atletik zil sesi çalar.

---

## 3. 🏋️ Koç / Eğitmen Masası

Antrenörlerin salonda cep telefonundan 1 saniyede yoklama almasını ve öğrencilerini takip etmesini sağlar.

### A. Hibrit Mod Anahtarı (`[ 🏃 Sporcu | 🏢 Salon ]`)
- Koçlar oturum açtığında sağ üstte mod anahtarı belirir:
  - **Sporcu Modu:** Kendi antrenmanlarınızı kaydetmek ve salonda çalışmak için.
  - **Salon Masası:** Yoklama almak, kapasiteyi görmek ve öğrencileri yönetmek için.

### B. 1 Dokunuşla Kilitli Yoklama ("Geldiyse Gelmiştir")
- Salona sporcu girdiğinde seans kartındaki **`✓ Geldi`** butonuna tek bir dokunuş yeterlidir.
- Sistem yoklamayı kilitler (`✓ BU SEANSTA GELDİ`), öğrencinin paketinden 1 ders otomatik düşer ve hocanın hakedişine prim yazılır.

### C. İkame Hoca Kuralı (%40 Kuralı)
- Eğer başka bir eğitmenin sporcusu sizin dersinize katıldıysa sistem bunu otomatik algılar ve kartta **`🦁 İkame Seans: %40 Hak Ediş Yazılacak`** rozeti gösterir. Birim ders ücretinin %40'ı derse fiilen giren size yazılır.

### D. Öğrenciye Özel Antrenman Yazma
1. Alt menüden **"Üyeler"** sekmesine geçin.
2. İlgili sporcunun kartındaki **`🏋️ Program Yaz`** butonuna tıklayın.
3. Açılan şablon oluşturucuda egzersizleri seçin, hedef set/tekrar ve dinlenme sürelerini girip **"Şablonu Kaydet"** deyin.
4. Program anında öğrencinin mobil ekranına düşer!

### E. Egzersiz Kataloğu Yönetimi
- **Antrenman ➔ Egzersizler** sekmesinden salona özel yeni hareketler tanımlayabilir (`+ Yeni Egzersiz`), hedef kas grubu (Göğüs, Sırt, Bacak vb.), ekipman ve form talimatlarını girebilirsiniz.

### F. Kişisel Hakediş Takibi
- **Hakediş** sekmesinden o ay girdiğiniz toplam ders sayısını, ikame derslerinizi ve hak ettiğiniz toplam prim tutarını şeffafça görebilirsiniz (Salon sahibinin cirosu koçlara gizlidir).

---

## 4. 🏢 Salon Sahibi & Yönetici Paneli

Salonun tüm operasyonel, idari ve finansal süreçlerini tek ekrandan yönetir.

### A. Finans ve Kasa Göstergeleri
- **Ciro & Kasa:** Aylık toplam satış cirosu, fiilen kasaya giren nakit/kredi kartı tahsilatları ve açık hesap (öğrencilerden bekleyen alacaklar).
- **Gelir Paylaşımı:** Salonun net işletme payı ile hocalara ödenecek toplam hakediş tutarları.

### B. Standart Paket Tanımlama & Fiyat Listesi
- **Paketler** sekmesinden **`+ Yeni Paket`** butonuna basarak:
  - Paket Adı (örn: *12 Seans Fonksiyonel Grup*, *10 Seans PT*)
  - Seans Sayısı ve Geçerlilik Süresi (gün)
  - Standart Liste Fiyatı belirleyebilirsiniz.

### C. Üye Kaydı ve Sağlık / Sakatlık Uyarısı (Medical Conditions)
- Yeni üye eklerken veya düzenlerken **"Sağlık Durumu / Sakatlık / Alerji"** alanına not düşebilirsiniz (örn: *Bel fıtığı L4-L5, omuz impingement*).
- Bu not, tüm antrenörlerin yoklama ve üye ekranında kırmızı **`⚠️ Sakatlık Uyarısı`** rozeti olarak gösterilir; sakatlığa aykırı hareket verilmesi önlenir.

### D. Esnek Fiyatlı Paket Satışı & Tahsilat
- Bir üyeye paket satışı yaparken liste fiyatı otomatik gelir; ancak o sporcuya özel indirim veya farklı fiyat girebilirsiniz.
- Tahsilat tutarını girerek kalan kısmı "Açık Hesap" olarak borç hanesine kaydedebilirsiniz.

### E. Aylık Eğitmen Bordroları
- **Bordrolar** sekmesinde hangi antrenörün kaç ders verdiği, ikame seansları ve net ödenmesi gereken prim bordrosu tek tıkla listelenir.

---

## 5. 🛡️ Süper Admin (Platform Yöneticisi)

- **Kullanıcı Yönetimi:** Sistemdeki tüm kullanıcıların rolleri (`Admin`, `Coach`, `Athlete`) tek tıkla güncellenebilir.
- **Kadro & Antrenör Tanımlama:** Bir kullanıcıya koçluk rolü verildiğinde tek butonla eğitmen profili oluşturulabilir ve varsayılan prim payı tanımlanabilir.

---

## 6. 📱 Uygulamayı Telefona İndirme (PWA)

SporTakip bir **Progressive Web App (PWA)** olarak tasarlanmıştır; App Store veya Google Play'e gerek kalmadan ana ekrana yüklenebilir:

### 🍏 iPhone / iPad (iOS Safari)
1. Safari tarayıcısında salon adresini açın (`http://...`).
2. Alttaki **Paylaş** (kare ve yukarı ok) simgesine dokunun.
3. Menüyü kaydırıp **"Ana Ekrana Ekle" (Add to Home Screen)** seçeneğini seçin.
4. Sağ üstteki **"Ekle"** butonuna basın. Uygulama tıpkı yerel bir iOS uygulaması gibi tam ekran açılacaktır.

### 🤖 Android (Chrome)
1. Chrome tarayıcısında adresi açın.
2. Sağ üstteki **üç nokta (⋮)** menüsüne dokunun.
3. **"Uygulamayı Yükle"** veya **"Ana Ekrana Ekle"** seçeneğine dokunun.

---

## 7. 💡 Sıkça Sorulan Sorular ve Püf Noktaları

- **S: İnternet yavaşladığında uygulama donar mı?**  
  *C:* Hayır! App-Shell önbellekleme mimarisi sayesinde uygulama kabuğu ve arayüz 5 milisaniyede telefon hafızasından yüklenir.
- **S: Üye seansı iptal ettiğinde antrenör prim alabilir mi?**  
  *C:* Seansa 3 saatten az kala yapılan iptallerde öğrencinin seans hakkı düşer ve eğitmenin hakedişine yazılır.
- **S: Bir eğitmen aynı zamanda salonda sporcu olabilir mi?**  
  *C:* Evet! Eğitmenler sisteme girdiklerinde otomatik olarak 999 seanslık ücretsiz personel paketine sahip olurlar ve diledikleri gibi rezervasyon yapabilirler.
- **S: Kendi telefonumdaki dinlenme sayacı sesi duyulmuyor?**  
  *C:* iOS ve Android'de seslerin çalabilmesi için sayfada en az bir kez dokunma yapılmış olması gerekir; ayrıca telefonunuzun sessiz mod anahtarını (mute switch) kontrol ediniz.

---
*SporTakip © 2026 Compound Athletic — Tüm Hakları Saklıdır.*
