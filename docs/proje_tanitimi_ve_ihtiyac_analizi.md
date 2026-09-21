# SporTakip (Compound Athletic) - Proje Tanıtımı, Yetenekler ve İhtiyaç Analizi

Bu doküman, **SporTakip** projesinin ne amaçla geliştirildiğini, mevcut yeteneklerini, kullanıcı rollerine sunduğu değeri, desteklediği platformları ve geleceğe yönelik ihtiyaç/yol haritası analizini içermektedir.

---

## 1. Proje Genel Bakış ve Doğuş Hikayesi

**SporTakip**, butik spor salonları ve stüdyolar (fonksiyonel antrenman, grup dersleri, pilates, boks ve PT/bireysel antrenman) için tasarlanmış, **mobil öncelikli (PWA)** bir salon operasyon, hızlı yoklama ve otomatik hakediş yönetim sistemidir.

### Çözülen Temel Sahadaki Sorunlar (Pain Points)
Proje, salonun manuel ve hata riski yüksek Excel tablosunu (`SampleExcel.xlsx`) ortadan kaldırarak şu temel problemleri çözmek üzere hayata geçirilmiştir:
1. **Salonda Hızlı İşlem İhtiyacı:** Antrenörlerin antrenman esnasında veya molalarda terliyken cep telefonundan 1-2 saniyede yoklama alabilmesi.
2. **Kapasite ve Yığılma Karmaşası (BR-03):** Butik stüdyolarda aynı saat diliminde birden fazla hocanın grup veya özel ders koyması sonucu salonun aşırı kalabalıklaşması ve ekipman sırası oluşması.
3. **Manuel Hesap Hataları ve Alacak Takibi:** Parçalı (taksitli/açık hesap) ödemelerin unutulması ve üyelerin kalan ders haklarının gözle sayılmasından kaynaklanan gelir kayıpları.
4. **Hakediş ve Gelir Dağılımı Anlaşmazlıkları:** Salon sahibi ile salonda ders veren antrenörler arasındaki paylaşımlar, salon işletme payı (`PAY`) kesintileri ve bir hocanın başka bir hocanın dersine girmesi durumunda uygulanan **%40 İkame Hoca Kuralı**nın hatasız hesaplanması.

---

## 2. Projenin Temel Yetenekleri ve Modülleri

### A. ⚡ Hızlı Yoklama (Mobile-First Floor Screen)
- **1-Dokunuşla Katılım:**
  - **Geldi (Attended):** Sporcu derse katıldı; üyenin kalan ders sayacından -1 düşer.
  - **Gelmedi / Hak Yandı (Missed - 3 Saat Kuralı):** Seansa en az 3 saat kala haber verilmeyen iptallerde veya habersiz devamsızlıklarda ders yandı sayılır ve haktan -1 düşer.
  - **Mazeretli İptal / Telafi (Excused):** En az 3 saat önce haber verilen durumlarda ders hakkı düşmez, telafi hakkı korunur.
- **Segmentli Görsel Ders Barı:** Üyenin kaç dersi kaldığını Hevy / Whoop / Apple Fitness tarzı görsel set barlarıyla gösterir.
- **İkame Hoca Seçici (%40 Kuralı):** Derse asıl hoca yerine başka bir antrenör girdiğinde seans birim ücretinin %40'ını otomatik olarak ikame hocaya yazar; kalan %60 asıl hocada kalır.
- **Hızlı Filtre Çipleri:** *Tüm Aktif Paketler*, *⚡ Son 1-2 Dersi Kalanlar*, *💳 Borçlu Üyeler*.

### B. 🏢 Canlı Stüdyo Doluluk & Saatlik Kapasite Paneli (BR-03)
- **Saatlik Slot İzleme:** 09:00 - 21:00 arası her saat dilimi için salondaki toplam sporcu sayısını anlık hesaplar.
- **Kapasite Eşikleri:**
  - 🟢 **Rahat (0 - 3 Kişi):** Salonda ideal çalışma alanı.
  - 🟡 **Doluyor (4 - 5 Kişi):** Yeni seans eklerken dikkatli olunmalı.
  - 🔴 **Kritik Dolu (6+ Kişi):** Salon kapasitesi aşıldı ikazı.
- **Tek Dokunuşla Filtreleme:** Saat slotuna tıklandığında o saatte salonda hangi hocanın kaç sporcusu olduğu anında listelenir.

### C. 📅 Geniş Aylık Seans Takvimi
- Aylık ızgara (Pzt - Paz) üzerinde gün bazında toplam seans ve sporcu sayısı.
- Doluluk durumuna göre gün hücrelerinde renkli durum noktaları.
- Güne tıklandığında saatlik detay paneli ve doğrudan **"+ Bu Güne Seans Ekle"** aksiyonu.

### D. 📊 Yönetim Paneli (Dashboard) & Eğitmen Kadrosu
- **Canlı Finansal Metrikler:** Aktif Sporcular, Bu Ayki Ciro, Tahsil Edilen Kasa, Açık Hesap (Kalan Alacak), Yapılan Ders Sayısı.
- **Gelir Dağılım Kartı:** Salon Sahibi (İşletme) Payı vs. Hocaların Hakedişleri.
- **Dinamik Eğitmen Kadrosu:** Yeni hoca tanımlama (Rol: Salon Sahibi, Eğitmen, PT), telefon ve varsayılan prim yüzdesi.

### E. 👥 Sporcular & Paket Yönetimi
- Arama (300ms debounce destekli) ve filtreleme.
- Sporcu sağlık/antrenman notları (menisküs, bel fıtığı vb. hassasiyetler).
- Paket Satış Modülü: Paket seçimi (Grup 8, Grup 12, PT), salon işletme kesintisi (%10, %30, %40, %0), sorumlu eğitmen ataması ve peşinat/kısmi tahsilat girişi.

### F. 💰 Kasa, Tahsilat & Dinamik Aylık Bordro
- Parçalı tahsilat yönetimi (Nakit, Havale/EFT, Kredi Kartı).
- Ay bazında her antrenörün girdiği ders sayısı, ders başı prim kazancı, paket hakediş payı, toplam hak edilen net tutar ve salon işletme geliri.

### G. 💬 Akıllı WhatsApp Şablon Entegrasyonu (PRD Madde 4)
Yoklama kartından tek tıkla 3 hazır atletik şablonu WhatsApp Web/App üzerinden doldurarak gönderme:
1. **Ders & 3 Saat Kuralı Hatırlatması:** Randevu saati ve telafi/iptal kuralı hatırlatması.
2. **Paket Bitiş & Yenileme Uyarısı:** Son 1-2 dersi kalan üyeye erken rezervasyon çağrısı.
3. **Kalan Bakiye & Borç Hatırlatması:** Açık hesabı kalan üyeye nazik ödeme hatırlatması.

### H. ☀️ / 🌙 Çift Tema Desteği
- **Açık Tema (Varsayılan):** Nike Training Club / Apple Fitness+ esintili porselen beyazı kartlar, neon volt (`#CCFF00`) ve zümrüt yeşili rozetler.
- **Koyu Tema:** Hevy / Whoop tarzı Obsidian Dark atletik mod.

---

## 3. Hedef Kitle ve Kullanıcı Rollerine Sağlanan Değer

| Kullanıcı Rolü | Karşılaşılan Sorun | SporTakip'in Sunduğu Değer / Çözüm |
| :--- | :--- | :--- |
| **Salon Sahibi / İşletmeci (Admin - Örn: Sinan)** | Salon cirosunu, eldeki nakdi ve tahsil edilmemiş alacakları takip edememek; ay sonu hakediş hesaplarında belirsizlik yaşamak. | Genel finansı, kasayı ve bekleyen alacakları anlık görür. Salon payını net izler. Ay sonu her hocanın bordrosunu kuruşu kuruşuna tek tıkla hesaplar. |
| **Eğitmenler / Antrenörler (Coaches - Örn: Gülçin ve PT'ler)** | Yoklama defterleri veya karmaşık Excel ile vakit kaybetmek; başkasının yerine derse girdiğinde hakkının kaybolmasından çekinmek. | Cepten 1 saniyede yoklama alır. Saatlik doluluğu görerek ders yığılmasını önler. İkame girdiği derslerde %40 hakedişi otomatik kazanır. Aylık bordrosunu şeffafça takip eder. |
| **Sporcular / Üyeler (Müşteri)** | Tıkış tıkış salonda alet sırası beklemek; kalan dersini bilmemek veya son dakika iptallerinde mağduriyet yaşamak. | Saatlik kapasite kontrolü sayesinde ferah antrenman alanı. WhatsApp üzerinden zamanında gelen seans ve paket bilgilendirmeleri. Parçalı ödeme esnekliği. |

---

## 4. Çalıştırılmak İstenen Platformlar

1. **Mobil Cihazlar (Akıllı Telefonlar - iOS & Android):**
   - **PWA (Progressive Web App):** Uygulama mağazası sürecine ihtiyaç duymadan, Safari veya Chrome üzerinden *"Ana Ekrana Ekle"* seçeneğiyle yerel mobil uygulama gibi tam ekran çalışır.
   - Sahada antrenörlerin tek elle pratik kullanımına uygun buton ve kart tasarımları.
2. **Masaüstü & Tablet (Windows, macOS, iPad, Android Tablet):**
   - Salon danışma/resepsiyon bilgisayarı veya tabletlerde yönetim paneli, geniş aylık seans takvimi ve hakediş bordrosu ekranları.
3. **Sunucu & Altyapı:**
   - **Backend:** .NET 10 / ASP.NET Core Web API
   - **Veritabanı:** Sıfır konfigürasyonlu, taşınabilir tek dosya SQLite (`sportakip.db`).
   - Salonda yerel bir mini PC'de veya bulut ortamında (Linux VPS, Docker container, Azure/AWS) kolayca barındırılabilir.

---

## 5. İnceleme, İstek ve İhtiyaç Belirleme (Brainstorming & Yol Haritası)

Sistemin mevcut çekirdeği tamamlanmış olup, işletmenin ihtiyaçlarına göre değerlendirilebilecek potansiyel geliştirme başlıkları aşağıdadır:

### 1. Kullanıcı Girişi ve Yetkilendirme (Auth / Login)
- **Mevcut Durum:** Sistem tek oturumlu/açık mimaridedir; tüm kullanıcılar aynı ekranlara erişebilir.
- **İhtiyaç / Seçenek:** 
  - Hocaların sadece kendi sporcularını, kendi derslerini ve kendi hakedişlerini görmesi;
  - Salon sahibinin ise genel ciro, kasa ve diğer hocaların hakedişlerini görebilmesi için basit PIN veya şifreli rol bazlı yetkilendirme eklenebilir.

### 2. Otomatik Bildirim Sistemi (Arka Plan Servisi)
- **Mevcut Durum:** WhatsApp şablonları butona tıklandığında istemci üzerinden açılmaktadır.
- **İhtiyaç / Seçenek:**
  - Dersten 24 saat veya 3 saat önce üyelere arka planda otomatik SMS veya WhatsApp Business API ile hatırlatma gönderilmesi.

### 3. Paket Dondurma (Freeze) & Geçerlilik Süresi Yönetimi
- **Mevcut Durum:** Paketler kalan hak bazlı takip edilmektedir; katı son kullanma tarihi işletilmemektedir.
- **İhtiyaç / Seçenek:**
  - Sporcunun seyahat, sakatlık veya sağlık raporu durumlarında paketi resmi olarak "Donduruldu" durumuna alma ve takvim süresini öteleme.

### 4. Salon Gider ve Masraf Takibi
- **Mevcut Durum:** Yalnızca üye paket satış gelirleri ve tahsilatlar kaydedilmektedir.
- **İhtiyaç / Seçenek:**
  - Salonun sabit giderleri (kira, aidat, faturalar, temizlik, ekipman) ve hocalara verilen avansların sisteme işlenerek net salon kârının hesaplanması.

### 5. Raporlama ve Dışa Aktarma (PDF / Excel)
- **Mevcut Durum:** Raporlar ekranda canlı tablo olarak görüntülenmektedir.
- **İhtiyaç / Seçenek:**
  - Ay sonu eğitmen bordrosunun veya borçlu üyeler listesinin tek tıkla PDF veya Excel formatında çıktısının alınabilmesi.

### 6. Üye Portalı (Sporcu Arayüzü)
- **Mevcut Durum:** Sistem sadece işletme ve antrenörler tarafından kullanılmaktadır.
- **İhtiyaç / Seçenek:**
  - Üyelerin kendi cep telefonlarından kalan ders haklarını görmesi ve boş saat slotlarına kendilerinin rezervasyon yapabilmesi.
