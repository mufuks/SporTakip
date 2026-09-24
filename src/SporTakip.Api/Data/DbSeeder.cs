using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;

using Microsoft.Extensions.Configuration;

namespace SporTakip.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(ApplicationDbContext db, IConfiguration? configuration = null)
    {
        await db.Database.EnsureCreatedAsync();

        // Güvenli sütun kontrolü (Yalnızca SQLite migration desteği için)
        if (db.Database.IsSqlite())
        {
            try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN HeightCm INTEGER NULL;"); } catch { }
            try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN WeightKg TEXT NULL;"); } catch { }
            try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN Age INTEGER NULL;"); } catch { }
            try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN Gender TEXT NULL;"); } catch { }
        }

        // 0. Platform SuperAdmin Tohumlama (Platform Yöneticisi)
        var superAdminPhone = configuration?["SuperAdmin:Phone"] ?? "+905550000000";
        var superAdminName = configuration?["SuperAdmin:FullName"] ?? "Platform Yöneticisi";
        var superAdmin = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == superAdminPhone);
        if (superAdmin == null)
        {
            superAdmin = new AppUser
            {
                PhoneNumber = superAdminPhone,
                FullName = superAdminName,
                Roles = UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.Add(superAdmin);
            await db.SaveChangesAsync();
        }
        else if (!superAdmin.Roles.HasFlag(UserRole.SuperAdmin) || !superAdmin.Roles.HasFlag(UserRole.Admin))
        {
            superAdmin.Roles |= (UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete);
            await db.SaveChangesAsync();
        }

        // 1. Antrenörler
        if (!await db.Trainers.AnyAsync())
        {
            var sinanUser = new AppUser
            {
                PhoneNumber = "+905321112233",
                FullName = "SalonSahibi_1",
                Roles = UserRole.Coach | UserRole.Admin,
                PhoneVerified = true
            };
            var gulcinUser = new AppUser
            {
                PhoneNumber = "+905324445566",
                FullName = "Hoca_1",
                Roles = UserRole.Coach,
                PhoneVerified = true
            };
            db.Users.AddRange(sinanUser, gulcinUser);
            await db.SaveChangesAsync();

            db.Trainers.AddRange(
                new Trainer { FullName = "SalonSahibi_1", Role = "Salon Sahibi", DefaultShareRate = 0.30m, Phone = "+905321112233", UserId = sinanUser.Id, IsActive = true },
                new Trainer { FullName = "Hoca_1", Role = "Eğitmen", DefaultShareRate = 0.40m, Phone = "+905324445566", UserId = gulcinUser.Id, IsActive = true }
            );
            await db.SaveChangesAsync();
        }

        // Eski gerçek isimleri anonim test isimlerine güncelle (Sinan -> SalonSahibi_1, Gülçin -> Hoca_1)
        var oldSinanUser = await db.Users.FirstOrDefaultAsync(u => u.FullName == "Sinan");
        if (oldSinanUser != null) oldSinanUser.FullName = "SalonSahibi_1";
        var oldSinanTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.FullName == "Sinan");
        if (oldSinanTrainer != null) oldSinanTrainer.FullName = "SalonSahibi_1";

        var oldGulcinUser = await db.Users.FirstOrDefaultAsync(u => u.FullName == "Gülçin");
        if (oldGulcinUser != null) oldGulcinUser.FullName = "Hoca_1";
        var oldGulcinTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.FullName == "Gülçin");
        if (oldGulcinTrainer != null) oldGulcinTrainer.FullName = "Hoca_1";

        // SalonSahibi_1 & Hoca_1 Kullanıcı & Rol Senkronizasyonu (Numara değiştirilmişse zorla ezmeyelim)
        var trainerSinan = await db.Trainers.FirstOrDefaultAsync(t => t.FullName.Contains("SalonSahibi") || t.FullName.Contains("Sinan"));
        var trainerGulcin = await db.Trainers.FirstOrDefaultAsync(t => t.FullName.Contains("Hoca_1") || t.FullName.Contains("Gülçin"));

        if (trainerSinan != null)
        {
            AppUser? sinanUser = null;
            if (trainerSinan.UserId.HasValue)
            {
                sinanUser = await db.Users.FindAsync(trainerSinan.UserId.Value);
            }
            if (sinanUser == null && !string.IsNullOrWhiteSpace(trainerSinan.Phone))
            {
                sinanUser = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == trainerSinan.Phone);
            }
            if (sinanUser != null)
            {
                if (!sinanUser.Roles.HasFlag(UserRole.Admin)) sinanUser.Roles |= UserRole.Admin;
                if (!sinanUser.Roles.HasFlag(UserRole.Coach)) sinanUser.Roles |= UserRole.Coach;
                if (!sinanUser.Roles.HasFlag(UserRole.Athlete)) sinanUser.Roles |= UserRole.Athlete;
                if (trainerSinan.UserId != sinanUser.Id)
                {
                    trainerSinan.UserId = sinanUser.Id;
                }
            }
        }

        if (trainerGulcin != null)
        {
            AppUser? gulcinUser = null;
            if (trainerGulcin.UserId.HasValue)
            {
                gulcinUser = await db.Users.FindAsync(trainerGulcin.UserId.Value);
            }
            if (gulcinUser == null && !string.IsNullOrWhiteSpace(trainerGulcin.Phone))
            {
                gulcinUser = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == trainerGulcin.Phone);
            }
            if (gulcinUser != null)
            {
                if (!gulcinUser.Roles.HasFlag(UserRole.Coach)) gulcinUser.Roles |= UserRole.Coach;
                if (!gulcinUser.Roles.HasFlag(UserRole.Athlete)) gulcinUser.Roles |= UserRole.Athlete;
                if (trainerGulcin.UserId != gulcinUser.Id)
                {
                    trainerGulcin.UserId = gulcinUser.Id;
                }
            }
        }
        await db.SaveChangesAsync();

        // Eğitmenlerin aynı zamanda sporcu olması garantisi:
        var staffPackage = await db.Packages.FirstOrDefaultAsync(p => p.PackageType == "STAFF" || p.Name == "Eğitmen / Personel Katılımı");
        if (staffPackage == null)
        {
            staffPackage = new Package
            {
                Name = "Eğitmen / Personel Katılımı",
                PackageType = "STAFF",
                LessonCount = 999,
                DefaultPrice = 0m,
                ValidityDays = 3650,
                IsActive = true
            };
            db.Packages.Add(staffPackage);
            await db.SaveChangesAsync();
        }

        var staffUsers = await db.Users
            .Where(u => u.Roles.HasFlag(UserRole.Coach) || u.Roles.HasFlag(UserRole.Admin))
            .ToListAsync();

        foreach (var staffUser in staffUsers)
        {
            if (!staffUser.Roles.HasFlag(UserRole.Athlete))
            {
                staffUser.Roles |= UserRole.Athlete;
            }

            var staffMember = await db.Members
                .FirstOrDefaultAsync(m => m.UserId == staffUser.Id || (m.Phone != null && m.Phone == staffUser.PhoneNumber));

            if (staffMember == null)
            {
                staffMember = new Member
                {
                    FullName = staffUser.FullName,
                    Phone = staffUser.PhoneNumber,
                    UserId = staffUser.Id,
                    IsActive = true,
                    Notes = "Eğitmen / Personel Sporcu Profili"
                };
                db.Members.Add(staffMember);
                await db.SaveChangesAsync();
            }
            else if (staffMember.UserId != staffUser.Id)
            {
                staffMember.UserId = staffUser.Id;
                await db.SaveChangesAsync();
            }

            var hasActiveSub = await db.Subscriptions
                .AnyAsync(s => s.MemberId == staffMember.Id && s.Status == "Active" && (s.TotalLessons - s.CompletedLessons) > 0);

            if (!hasActiveSub)
            {
                db.Subscriptions.Add(new Subscription
                {
                    MemberId = staffMember.Id,
                    PackageId = staffPackage.Id,
                    Price = 0m,
                    TotalLessons = 999,
                    CompletedLessons = 0,
                    StartDate = DateTime.UtcNow.Date,
                    EndDate = DateTime.UtcNow.Date.AddYears(10),
                    Status = "Active",
                    Notes = "Eğitmen / Personel sınırsız seans katılım hakkı"
                });
                await db.SaveChangesAsync();
            }
        }
        await db.SaveChangesAsync();


        // 2. Paketler
        if (!await db.Packages.AnyAsync())
        {
            db.Packages.AddRange(
                new Package { Name = "Grup 8 Ders", PackageType = "GRUP", LessonCount = 8, DefaultPrice = 3000m, ValidityDays = 35, IsActive = true },
                new Package { Name = "Grup 12 Ders", PackageType = "GRUP", LessonCount = 12, DefaultPrice = 3500m, ValidityDays = 45, IsActive = true },
                new Package { Name = "Bireysel (Özel Ders / PT)", PackageType = "PT", LessonCount = 10, DefaultPrice = 12000m, ValidityDays = 45, IsActive = true }
            );
            await db.SaveChangesAsync();
        }

        var pkg8 = await db.Packages.FirstOrDefaultAsync(p => p.Name.Contains("8 Ders"));

        // 3. Egzersiz Kataloğu (15 Temel Egzersiz)
        if (!await db.Exercises.AnyAsync())
        {
            db.Exercises.AddRange(
                new Exercise
                {
                    Name = "Barbell Squat",
                    NameTr = "Barbell Squat (Çömelme)",
                    MuscleGroup = "Legs",
                    Equipment = "Barbell",
                    Instructions = "Barı trapezlere yerleştirin, göğsü dik tutarak kalçayı diz hizasına kadar indirin ve topuklardan iterek kalkın."
                },
                new Exercise
                {
                    Name = "Barbell Deadlift",
                    NameTr = "Barbell Deadlift (Yerden Kaldırma)",
                    MuscleGroup = "Back",
                    Equipment = "Barbell",
                    Instructions = "Ayaklar omuz genişliğinde, sırt düz, kalçayı geriye iterek barı bacaklara yakın şekilde yukarı çekin."
                },
                new Exercise
                {
                    Name = "Barbell Bench Press",
                    NameTr = "Barbell Bench Press (Yatarak Göğüs İtiş)",
                    MuscleGroup = "Chest",
                    Equipment = "Barbell",
                    Instructions = "Düz sehpaya uzanın, omuz bıçaklarını sıkıştırın, barı göğüs ortasına kontrollü indirip yukarı itin."
                },
                new Exercise
                {
                    Name = "Pull-Up",
                    NameTr = "Barfiks (Geniş Tutuş)",
                    MuscleGroup = "Back",
                    Equipment = "Bodyweight",
                    Instructions = "Barı omuzdan geniş tutun, göğsü bara yaklaştıracak şekilde çekin ve kontrollü inin."
                },
                new Exercise
                {
                    Name = "Push-Up",
                    NameTr = "Şınav",
                    MuscleGroup = "Chest",
                    Equipment = "Bodyweight",
                    Instructions = "Vücut düz bir çizgi halinde, dirsekleri 45 derece açıyla kırarak göğsü yere yaklaştırın ve itin."
                },
                new Exercise
                {
                    Name = "Dumbbell Overhead Press",
                    NameTr = "Dumbbell Omuz Presi",
                    MuscleGroup = "Shoulders",
                    Equipment = "Dumbbell",
                    Instructions = "Dumbbell'ları omuz hizasında tutun, merkez bölgeyi sıkarak baş üstüne doğru kontrollü itin."
                },
                new Exercise
                {
                    Name = "Barbell Bent-Over Row",
                    NameTr = "Barbell Sırt Çekiş (Row)",
                    MuscleGroup = "Back",
                    Equipment = "Barbell",
                    Instructions = "Gövdeyi 45 derece eğin, beli koruyarak barı göbeğe doğru çekin, kürek kemiklerini sıkıştırın."
                },
                new Exercise
                {
                    Name = "Dumbbell Walking Lunge",
                    NameTr = "Dumbbell Yürüyen Lunge",
                    MuscleGroup = "Legs",
                    Equipment = "Dumbbell",
                    Instructions = "İki ele dumbbell alarak öne doğru adım atın, arka diz yere yaklaşana kadar inin."
                },
                new Exercise
                {
                    Name = "Plank",
                    NameTr = "Plank (Statik Core Tutuşu)",
                    MuscleGroup = "Core",
                    Equipment = "Bodyweight",
                    Instructions = "Ön kollar üzerinde durun, karın ve kalçayı sıkarak vücudu düz bir hat halinde tutun."
                },
                new Exercise
                {
                    Name = "Kettlebell Swing",
                    NameTr = "Kettlebell Salınımı",
                    MuscleGroup = "FullBody",
                    Equipment = "Kettlebell",
                    Instructions = "Kalça menteşesi (hip hinge) hareketiyle kalçayı geriye itip patlayıcı şekilde öne itin."
                },
                new Exercise
                {
                    Name = "Dumbbell Bicep Curl",
                    NameTr = "Dumbbell Pazı Büküş",
                    MuscleGroup = "Arms",
                    Equipment = "Dumbbell",
                    Instructions = "Dirsekleri sabit tutarak dumbbell'ları omuza doğru bükün, tepe noktada sıkıştırın."
                },
                new Exercise
                {
                    Name = "Cable Tricep Pushdown",
                    NameTr = "Makaralı Arka Kol İtişi",
                    MuscleGroup = "Arms",
                    Equipment = "Cable",
                    Instructions = "Dirsekleri gövdeye sabitleyin, ip veya barı aşağı doğru iterek triceps'i tam uzatın."
                },
                new Exercise
                {
                    Name = "Hanging Leg Raise",
                    NameTr = "Asılarak Bacak Kaldırma",
                    MuscleGroup = "Core",
                    Equipment = "Bodyweight",
                    Instructions = "Bara asılın, sallanmadan karın kaslarını sıkarak bacakları paralel konuma kaldırın."
                },
                new Exercise
                {
                    Name = "Leg Press",
                    NameTr = "Bacak Presi (Makine)",
                    MuscleGroup = "Legs",
                    Equipment = "Machine",
                    Instructions = "Ayakları platforma yerleştirin, dizleri 90 derece bükene kadar indirin ve itin."
                },
                new Exercise
                {
                    Name = "Dumbbell Lateral Raise",
                    NameTr = "Dumbbell Yana Açış",
                    MuscleGroup = "Shoulders",
                    Equipment = "Dumbbell",
                    Instructions = "Dumbbell'ları yanlara omuz hizasına kadar kaldırın, omuz başlarını izole edin."
                }
            );
            await db.SaveChangesAsync();
        }

        // 4. Örnek Sporcular (Atlet_1, Atlet_2)
        if (!await db.Members.AnyAsync())
        {
            var meltemUser = new AppUser
            {
                PhoneNumber = "+905551234567",
                FullName = "Atlet_1",
                Roles = UserRole.Athlete,
                PhoneVerified = true
            };
            var canUser = new AppUser
            {
                PhoneNumber = "+905559876543",
                FullName = "Atlet_2",
                Roles = UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.AddRange(meltemUser, canUser);
            await db.SaveChangesAsync();

            var meltemMember = new Member
            {
                FullName = "Atlet_1",
                Phone = "+905551234567",
                Email = "atlet1@example.com",
                UserId = meltemUser.Id,
                IsActive = true
            };
            var canMember = new Member
            {
                FullName = "Atlet_2",
                Phone = "+905559876543",
                Email = "atlet2@example.com",
                UserId = canUser.Id,
                Notes = "⚠️ Sağ omuz sıkışması: Overhead press dikkat.",
                IsActive = true
            };
            db.Members.AddRange(meltemMember, canMember);
            await db.SaveChangesAsync();

            // Atlet_1 için Aktif Paket (8 ders, 5 tamamlandı, 3 kalan, ödendi)
            if (pkg8 != null)
            {
                var sub = new Subscription
                {
                    MemberId = meltemMember.Id,
                    PackageId = pkg8.Id,
                    PrimaryTrainerId = trainerGulcin?.Id,
                    StartDate = DateTime.UtcNow.Date.AddDays(-14),
                    EndDate = DateTime.UtcNow.Date.AddDays(14),
                    Price = pkg8.DefaultPrice,
                    TotalLessons = 8,
                    CompletedLessons = 5,
                    Status = "Active",
                    SalonShareRate = 0.30m,
                    SalonShareAmount = 900m,
                    TrainerShareAmount = 2100m
                };
                db.Subscriptions.Add(sub);
                await db.SaveChangesAsync();

                // ₺3000 tam ödendi
                db.Payments.Add(new Payment
                {
                    SubscriptionId = sub.Id,
                    Amount = 3000m,
                    PaymentDate = DateTime.UtcNow.Date.AddDays(-14),
                    PaymentMethod = "Kredi Kartı",
                    Notes = "Tam paket ödemesi"
                });
                await db.SaveChangesAsync();
            }
        }

        // Eski isimleri anonim isimlere güncelle (Meltem Yılmaz -> Atlet_1, Can Demir -> Atlet_2, Ufuk -> Atlet_3)
        var oldMeltemUser = await db.Users.FirstOrDefaultAsync(u => u.FullName == "Meltem Yılmaz");
        if (oldMeltemUser != null) oldMeltemUser.FullName = "Atlet_1";
        var oldMeltemMember = await db.Members.FirstOrDefaultAsync(m => m.FullName == "Meltem Yılmaz");
        if (oldMeltemMember != null) oldMeltemMember.FullName = "Atlet_1";

        var oldCanUser = await db.Users.FirstOrDefaultAsync(u => u.FullName == "Can Demir");
        if (oldCanUser != null) oldCanUser.FullName = "Atlet_2";
        var oldCanMember = await db.Members.FirstOrDefaultAsync(m => m.FullName == "Can Demir");
        if (oldCanMember != null) oldCanMember.FullName = "Atlet_2";

        var oldUfukUser = await db.Users.FirstOrDefaultAsync(u => u.FullName == "Ufuk");
        if (oldUfukUser != null) oldUfukUser.FullName = "Atlet_3";
        var oldUfukMember = await db.Members.FirstOrDefaultAsync(m => m.FullName == "Ufuk");
        if (oldUfukMember != null) oldUfukMember.FullName = "Atlet_3";
        await db.SaveChangesAsync();

        // 4.1. Atlet_3 (Ufuk) Atlet Profili
        var ufukUser = await db.Users
            .Include(u => u.MemberProfile)
            .FirstOrDefaultAsync(u => u.FullName == "Atlet_3" || u.FullName == "Ufuk" || u.PhoneNumber == "+905317741606");

        if (ufukUser == null)
        {
            ufukUser = new AppUser
            {
                PhoneNumber = "+905317741606",
                FullName = "Atlet_3",
                Roles = UserRole.Athlete,
                PhoneVerified = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Users.Add(ufukUser);
            await db.SaveChangesAsync();
        }

        var ufukMember = await db.Members.FirstOrDefaultAsync(m => m.UserId == ufukUser.Id || m.FullName == "Atlet_3" || m.FullName == "Ufuk");
        if (ufukMember == null)
        {
            ufukMember = new Member
            {
                FullName = "Atlet_3",
                Phone = ufukUser.PhoneNumber,
                Email = "atlet3@example.com",
                UserId = ufukUser.Id,
                Notes = "",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                HeightCm = 176,
                WeightKg = 83m,
                Age = 38,
                Gender = "Erkek"
            };
            db.Members.Add(ufukMember);
            await db.SaveChangesAsync();
        }
        else
        {
            ufukMember.FullName = "Atlet_3";
            ufukMember.UserId = ufukUser.Id;
            await db.SaveChangesAsync();
        }
        ufukMember.HeightCm ??= 176;
        ufukMember.WeightKg ??= 83m;
        ufukMember.Age ??= 38;
        ufukMember.Gender ??= "Erkek";
        await db.SaveChangesAsync();

        if (pkg8 != null && !await db.Subscriptions.AnyAsync(s => s.MemberId == ufukMember.Id))
        {
            var ufukSub = new Subscription
            {
                MemberId = ufukMember.Id,
                PackageId = pkg8.Id,
                PrimaryTrainerId = trainerGulcin?.Id,
                StartDate = DateTime.UtcNow.Date.AddDays(-5),
                EndDate = DateTime.UtcNow.Date.AddDays(30),
                Price = pkg8.DefaultPrice,
                TotalLessons = 8,
                CompletedLessons = 2,
                Status = "Active",
                SalonShareRate = 0.30m,
                SalonShareAmount = 900m,
                TrainerShareAmount = 2100m
            };
            db.Subscriptions.Add(ufukSub);
            await db.SaveChangesAsync();

            db.Payments.Add(new Payment
            {
                SubscriptionId = ufukSub.Id,
                Amount = 3000m,
                PaymentDate = DateTime.UtcNow.Date.AddDays(-5),
                PaymentMethod = "Kredi Kartı",
                Notes = "Tam paket ödemesi"
            });
            await db.SaveChangesAsync();
        }

        // 4.2. Örnek Yoklama & Hakediş Kayıtları (Bu Ay)
        if (!await db.AttendanceRecords.AnyAsync() && trainerGulcin != null && trainerSinan != null)
        {
            var meltemSub = await db.Subscriptions.FirstOrDefaultAsync(s => s.Member.FullName.Contains("Meltem"));
            if (meltemSub != null)
            {
                db.AttendanceRecords.AddRange(
                    new AttendanceRecord
                    {
                        SubscriptionId = meltemSub.Id,
                        LessonNumber = 1,
                        LessonDate = DateTime.UtcNow.Date.AddDays(-3).AddHours(19),
                        TrainerId = trainerGulcin.Id,
                        Status = "Attended",
                        UnitLessonPrice = 375m,
                        TrainerShareAmount = 150m,
                        IsSubstitute = false,
                        Notes = "Squat ve Core çalışması tamamlandı"
                    },
                    new AttendanceRecord
                    {
                        SubscriptionId = meltemSub.Id,
                        LessonNumber = 2,
                        LessonDate = DateTime.UtcNow.Date.AddDays(-1).AddHours(19),
                        TrainerId = trainerGulcin.Id,
                        Status = "Attended",
                        UnitLessonPrice = 375m,
                        TrainerShareAmount = 150m,
                        IsSubstitute = false,
                        Notes = "Bench press ve üst vücut tamamlandı"
                    }
                );
            }

            var ufukSubRecord = await db.Subscriptions.FirstOrDefaultAsync(s => s.Member.FullName.Contains("Ufuk"));
            if (ufukSubRecord != null)
            {
                db.AttendanceRecords.Add(new AttendanceRecord
                {
                    SubscriptionId = ufukSubRecord.Id,
                    LessonNumber = 1,
                    LessonDate = DateTime.UtcNow.Date.AddDays(-2).AddHours(20),
                    TrainerId = trainerGulcin.Id,
                    Status = "Attended",
                    UnitLessonPrice = 375m,
                    TrainerShareAmount = 150m,
                    IsSubstitute = true,
                    SubstituteShareAmount = 150m,
                    Notes = "İkame ders: Sinan Hoca yerine girildi (%40 prim)"
                });
            }

            await db.SaveChangesAsync();
        }


        // 5. Günün Seansları (Session Slots)
        if (!await db.SessionSlots.AnyAsync() && trainerGulcin != null && trainerSinan != null)
        {
            var today = DateTime.UtcNow.Date;

            // Slot 1a: Bugün 12:00 - 13:00 (Sinan Hoca - Core & Omurga Sağlığı, 3/6 Müsait)
            var slot1a = new SessionSlot
            {
                TrainerId = trainerSinan.Id,
                StartTime = today.AddHours(12),
                EndTime = today.AddHours(13),
                Capacity = 6,
                Title = "Core & Omurga Sağlığı",
                SessionType = "GRUP",
                Status = "Scheduled"
            };

            // Slot 1b: Bugün 14:00 - 15:00 (Gülçin Hoca - Kuvvet Gelişimi, 4/6 Doluyor)
            var slot1b = new SessionSlot
            {
                TrainerId = trainerGulcin.Id,
                StartTime = today.AddHours(14),
                EndTime = today.AddHours(15),
                Capacity = 6,
                Title = "Kuvvet Gelişimi",
                SessionType = "GRUP",
                Status = "Scheduled"
            };

            // Slot 1: Bugün 19:00 - 20:00 (Gülçin Hoca - Fonksiyonel Güç & Kondisyon, 4/6 Doluyor)
            var slot1 = new SessionSlot
            {
                TrainerId = trainerGulcin.Id,
                StartTime = today.AddHours(19),
                EndTime = today.AddHours(20),
                Capacity = 6,
                Title = "Fonksiyonel Güç & Kondisyon",
                SessionType = "GRUP",
                Status = "Scheduled"
            };

            // Slot 2: Bugün 20:00 - 21:00 (Sinan Hoca - Core & Mobilite, 6/6 Kontenjan Dolu)
            var slot2 = new SessionSlot
            {
                TrainerId = trainerSinan.Id,
                StartTime = today.AddHours(20),
                EndTime = today.AddHours(21),
                Capacity = 6,
                Title = "Core & Mobilite",
                SessionType = "GRUP",
                Status = "Scheduled"
            };

            // Slot 3: Yarın 18:00 - 19:00 (Gülçin Hoca - Metabolic Conditioning, 2/6 Müsait)
            var slot3 = new SessionSlot
            {
                TrainerId = trainerGulcin.Id,
                StartTime = today.AddDays(1).AddHours(18),
                EndTime = today.AddDays(1).AddHours(19),
                Capacity = 6,
                Title = "Metabolic Conditioning",
                SessionType = "GRUP",
                Status = "Scheduled"
            };

            db.SessionSlots.AddRange(slot1a, slot1b, slot1, slot2, slot3);
            await db.SaveChangesAsync();

            // Örnek rezervasyonlar
            var memberCan = await db.Members.FirstOrDefaultAsync(m => m.Phone == "+905559876543");

            if (memberCan != null && pkg8 != null)
            {
                var canSub = new Subscription
                {
                    MemberId = memberCan.Id,
                    PackageId = pkg8.Id,
                    PrimaryTrainerId = trainerGulcin.Id,
                    StartDate = DateTime.UtcNow.Date.AddDays(-5),
                    EndDate = DateTime.UtcNow.Date.AddDays(25),
                    Price = pkg8.DefaultPrice,
                    TotalLessons = 8,
                    CompletedLessons = 2,
                    Status = "Active",
                    SalonShareRate = 0.30m,
                    SalonShareAmount = 900m,
                    TrainerShareAmount = 2100m
                };
                db.Subscriptions.Add(canSub);
                await db.SaveChangesAsync();

                db.Reservations.Add(new Reservation
                {
                    SessionSlotId = slot1.Id,
                    MemberId = memberCan.Id,
                    SubscriptionId = canSub.Id,
                    Status = "Confirmed",
                    CreatedAt = DateTime.UtcNow.AddHours(-5)
                });
                await db.SaveChangesAsync();
            }
        }

        // 6. Örnek Antrenman Şablonları (Workout Templates)
        if (!await db.WorkoutTemplates.AnyAsync() && trainerSinan != null && trainerGulcin != null)
        {
            var squat = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Squat"));
            var bench = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Bench Press"));
            var row = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Bent-Over Row"));
            var plank = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Plank"));
            var legPress = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Leg Press"));
            var lunge = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Lunge"));
            var ohp = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Overhead Press"));
            var pullUp = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Pull-Up"));

            var templateFullBody = new WorkoutTemplate
            {
                TrainerId = trainerSinan.Id,
                Name = "Tüm Vücut Güç & Hipertrofi",
                Description = "Temel bileşik hareketlerle güç kazanımı ve tüm vücut kas aktivasyonu.",
                Category = "Strength",
                EstimatedDurationMinutes = 55,
                IsPublished = true,
                CreatedAt = DateTime.UtcNow.AddDays(-10)
            };

            if (squat != null)
                templateFullBody.Exercises.Add(new WorkoutExercise { ExerciseId = squat.Id, OrderIndex = 1, TargetSets = 4, TargetReps = "8-10", RestSeconds = 120, Notes = "Topuklardan itin, göğüs dik." });
            if (bench != null)
                templateFullBody.Exercises.Add(new WorkoutExercise { ExerciseId = bench.Id, OrderIndex = 2, TargetSets = 4, TargetReps = "8-10", RestSeconds = 90, Notes = "Omuz bıçaklarını kilitleyin." });
            if (row != null)
                templateFullBody.Exercises.Add(new WorkoutExercise { ExerciseId = row.Id, OrderIndex = 3, TargetSets = 3, TargetReps = "10-12", RestSeconds = 90, Notes = "Beli düz tutun." });
            if (plank != null)
                templateFullBody.Exercises.Add(new WorkoutExercise { ExerciseId = plank.Id, OrderIndex = 4, TargetSets = 3, TargetReps = "45sn", RestSeconds = 60, Notes = "Karın ve kalçayı sıkın." });

            var templateLowerBody = new WorkoutTemplate
            {
                TrainerId = trainerGulcin.Id,
                Name = "Alt Vücut & Bacak Gelişimi",
                Description = "Bacak, kalça ve hamstring odaklı yüksek hacimli antrenman.",
                Category = "Strength",
                EstimatedDurationMinutes = 50,
                IsPublished = true,
                CreatedAt = DateTime.UtcNow.AddDays(-7)
            };

            if (legPress != null)
                templateLowerBody.Exercises.Add(new WorkoutExercise { ExerciseId = legPress.Id, OrderIndex = 1, TargetSets = 4, TargetReps = "10-12", RestSeconds = 90 });
            if (squat != null)
                templateLowerBody.Exercises.Add(new WorkoutExercise { ExerciseId = squat.Id, OrderIndex = 2, TargetSets = 3, TargetReps = "10-12", RestSeconds = 90 });
            if (lunge != null)
                templateLowerBody.Exercises.Add(new WorkoutExercise { ExerciseId = lunge.Id, OrderIndex = 3, TargetSets = 3, TargetReps = "12-15", RestSeconds = 60 });

            db.WorkoutTemplates.AddRange(templateFullBody, templateLowerBody);
            await db.SaveChangesAsync();

            // Meltem için örnek geçmiş tamamlanmış antrenman logu (Progressive Overload grafiği için)
            var meltem = await db.Members.FirstOrDefaultAsync(m => m.Phone == "+905551234567");
            if (meltem != null && squat != null && bench != null)
            {
                var pastWorkout = new WorkoutLog
                {
                    MemberId = meltem.Id,
                    WorkoutTemplateId = templateFullBody.Id,
                    StartedAt = DateTime.UtcNow.AddDays(-3).AddHours(-2),
                    CompletedAt = DateTime.UtcNow.AddDays(-3).AddHours(-1),
                    DurationMinutes = 52,
                    Rating = 5,
                    Notes = "Meltem bugün Squat'ta yeni rekor kırdı! 60 kg çok rahat çıktı."
                };

                var elSquat = new ExerciseLog { ExerciseId = squat.Id, OrderIndex = 1 };
                elSquat.Sets.Add(new SetLog { SetNumber = 1, WeightKg = 50m, Reps = 10, SetType = "Warmup", IsCompleted = true });
                elSquat.Sets.Add(new SetLog { SetNumber = 2, WeightKg = 55m, Reps = 8, SetType = "Normal", IsCompleted = true });
                elSquat.Sets.Add(new SetLog { SetNumber = 3, WeightKg = 60m, Reps = 8, SetType = "Normal", IsCompleted = true });
                pastWorkout.ExerciseLogs.Add(elSquat);

                var elBench = new ExerciseLog { ExerciseId = bench.Id, OrderIndex = 2 };
                elBench.Sets.Add(new SetLog { SetNumber = 1, WeightKg = 35m, Reps = 10, SetType = "Normal", IsCompleted = true });
                elBench.Sets.Add(new SetLog { SetNumber = 2, WeightKg = 40m, Reps = 8, SetType = "Normal", IsCompleted = true });
                elBench.Sets.Add(new SetLog { SetNumber = 3, WeightKg = 45m, Reps = 6, SetType = "Normal", IsCompleted = true });
                pastWorkout.ExerciseLogs.Add(elBench);

                db.WorkoutLogs.Add(pastWorkout);
                await db.SaveChangesAsync();
            }
        }

        // 7. Ufuk (+905317741606) için Tamamlanmış Antrenman Logu & PR'lar
        var ufukAthlete = await db.Members.FirstOrDefaultAsync(m => m.Phone == "+905317741606");
        var squatEx = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Squat"));
        var benchEx = await db.Exercises.FirstOrDefaultAsync(e => e.Name.Contains("Bench Press"));
        var fullBodyTpl = await db.WorkoutTemplates.FirstOrDefaultAsync(t => t.Name.Contains("Tüm Vücut"));

        if (ufukAthlete != null && squatEx != null && benchEx != null && !await db.WorkoutLogs.AnyAsync(w => w.MemberId == ufukAthlete.Id))
        {
            var pastWorkoutUfuk = new WorkoutLog
            {
                MemberId = ufukAthlete.Id,
                WorkoutTemplateId = fullBodyTpl?.Id,
                StartedAt = DateTime.UtcNow.AddDays(-2).AddHours(-2),
                CompletedAt = DateTime.UtcNow.AddDays(-2).AddHours(-1),
                DurationMinutes = 58,
                Rating = 5,
                Notes = "Ufuk bugün Squat'ta 85 kg ve Bench'te 65 kg ile harika bir PR yaptı 💪"
            };

            var elSquatUfuk = new ExerciseLog { ExerciseId = squatEx.Id, OrderIndex = 1 };
            elSquatUfuk.Sets.Add(new SetLog { SetNumber = 1, WeightKg = 60m, Reps = 10, SetType = "Warmup", IsCompleted = true });
            elSquatUfuk.Sets.Add(new SetLog { SetNumber = 2, WeightKg = 75m, Reps = 8, SetType = "Normal", IsCompleted = true });
            elSquatUfuk.Sets.Add(new SetLog { SetNumber = 3, WeightKg = 85m, Reps = 8, SetType = "Normal", IsCompleted = true });
            pastWorkoutUfuk.ExerciseLogs.Add(elSquatUfuk);

            var elBenchUfuk = new ExerciseLog { ExerciseId = benchEx.Id, OrderIndex = 2 };
            elBenchUfuk.Sets.Add(new SetLog { SetNumber = 1, WeightKg = 50m, Reps = 10, SetType = "Normal", IsCompleted = true });
            elBenchUfuk.Sets.Add(new SetLog { SetNumber = 2, WeightKg = 60m, Reps = 8, SetType = "Normal", IsCompleted = true });
            elBenchUfuk.Sets.Add(new SetLog { SetNumber = 3, WeightKg = 65m, Reps = 8, SetType = "Normal", IsCompleted = true });
            pastWorkoutUfuk.ExerciseLogs.Add(elBenchUfuk);

            db.WorkoutLogs.Add(pastWorkoutUfuk);
            await db.SaveChangesAsync();
        }
    }
}
