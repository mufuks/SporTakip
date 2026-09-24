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

        // Güvenli sütun kontrolü (SQLite ALTER TABLE)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN HeightCm INTEGER NULL;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN WeightKg TEXT NULL;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN Age INTEGER NULL;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE Members ADD COLUMN Gender TEXT NULL;"); } catch { }

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
                Roles = UserRole.SuperAdmin,
                PhoneVerified = true
            };
            db.Users.Add(superAdmin);
            await db.SaveChangesAsync();
        }
        else if (!superAdmin.Roles.HasFlag(UserRole.SuperAdmin))
        {
            superAdmin.Roles |= UserRole.SuperAdmin;
            await db.SaveChangesAsync();
        }

        // 1. Antrenörler
        if (!await db.Trainers.AnyAsync())
        {
            var sinanUser = new AppUser
            {
                PhoneNumber = "+905321112233",
                FullName = "Sinan",
                Roles = UserRole.Coach | UserRole.Admin,
                PhoneVerified = true
            };
            var gulcinUser = new AppUser
            {
                PhoneNumber = "+905324445566",
                FullName = "Gülçin",
                Roles = UserRole.Coach,
                PhoneVerified = true
            };
            db.Users.AddRange(sinanUser, gulcinUser);
            await db.SaveChangesAsync();

            db.Trainers.AddRange(
                new Trainer { FullName = "Sinan", Role = "Salon Sahibi", DefaultShareRate = 0.30m, Phone = "+905321112233", UserId = sinanUser.Id, IsActive = true },
                new Trainer { FullName = "Gülçin", Role = "Eğitmen", DefaultShareRate = 0.40m, Phone = "+905324445566", UserId = gulcinUser.Id, IsActive = true }
            );
            await db.SaveChangesAsync();
        }

        var trainerSinan = await db.Trainers.FirstOrDefaultAsync(t => t.FullName.Contains("Sinan"));
        var trainerGulcin = await db.Trainers.FirstOrDefaultAsync(t => t.FullName.Contains("Gülçin"));

        // Sinan & Gülçin Kullanıcı & Rol Senkronizasyonu (Her açılışta garantiye al)
        var sinanUserSync = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905321112233");
        if (sinanUserSync == null)
        {
            sinanUserSync = new AppUser { PhoneNumber = "+905321112233", FullName = "Sinan", Roles = UserRole.Coach | UserRole.Admin, PhoneVerified = true };
            db.Users.Add(sinanUserSync);
            await db.SaveChangesAsync();
        }
        else if (sinanUserSync.Roles != (UserRole.Coach | UserRole.Admin))
        {
            sinanUserSync.Roles = UserRole.Coach | UserRole.Admin;
            await db.SaveChangesAsync();
        }

        var gulcinUserSync = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905324445566");
        if (gulcinUserSync == null)
        {
            gulcinUserSync = new AppUser { PhoneNumber = "+905324445566", FullName = "Gülçin", Roles = UserRole.Coach, PhoneVerified = true };
            db.Users.Add(gulcinUserSync);
            await db.SaveChangesAsync();
        }
        else if (!gulcinUserSync.Roles.HasFlag(UserRole.Coach))
        {
            gulcinUserSync.Roles = UserRole.Coach;
            await db.SaveChangesAsync();
        }

        if (trainerSinan != null && trainerSinan.UserId != sinanUserSync.Id)
        {
            trainerSinan.UserId = sinanUserSync.Id;
            await db.SaveChangesAsync();
        }

        if (trainerGulcin != null && trainerGulcin.UserId != gulcinUserSync.Id)
        {
            trainerGulcin.UserId = gulcinUserSync.Id;
            await db.SaveChangesAsync();
        }


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

        // 4. Örnek Sporcular (Meltem Yılmaz - v0 tasarımındaki sporcu)
        if (!await db.Members.AnyAsync())
        {
            var meltemUser = new AppUser
            {
                PhoneNumber = "+905551234567",
                FullName = "Meltem Yılmaz",
                Roles = UserRole.Athlete,
                PhoneVerified = true
            };
            var canUser = new AppUser
            {
                PhoneNumber = "+905559876543",
                FullName = "Can Demir",
                Roles = UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.AddRange(meltemUser, canUser);
            await db.SaveChangesAsync();

            var meltemMember = new Member
            {
                FullName = "Meltem Yılmaz",
                Phone = "+905551234567",
                Email = "meltem@example.com",
                UserId = meltemUser.Id,
                IsActive = true
            };
            var canMember = new Member
            {
                FullName = "Can Demir",
                Phone = "+905559876543",
                Email = "can@example.com",
                UserId = canUser.Id,
                Notes = "⚠️ Sağ omuz sıkışması: Overhead press dikkat.",
                IsActive = true
            };
            db.Members.AddRange(meltemMember, canMember);
            await db.SaveChangesAsync();

            // Meltem için Aktif Paket (v0 tasarımında görünen: 8 ders, 5 tamamlandı, 3 kalan, ödendi)
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

        // 4.1. Ufuk (+905317741606) Atlet Profili
        var ufukUser = await db.Users
            .Include(u => u.MemberProfile)
            .FirstOrDefaultAsync(u => u.PhoneNumber == "+905317741606");

        if (ufukUser == null)
        {
            ufukUser = new AppUser
            {
                PhoneNumber = "+905317741606",
                FullName = "Ufuk",
                Roles = UserRole.Athlete,
                PhoneVerified = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Users.Add(ufukUser);
            await db.SaveChangesAsync();
        }
        else if (ufukUser.FullName != "Ufuk")
        {
            ufukUser.FullName = "Ufuk";
            await db.SaveChangesAsync();
        }

        var ufukMember = await db.Members.FirstOrDefaultAsync(m => m.UserId == ufukUser.Id || m.Phone == "+905317741606");
        if (ufukMember == null)
        {
            ufukMember = new Member
            {
                FullName = "Ufuk",
                Phone = "+905317741606",
                Email = "ufuk@example.com",
                UserId = ufukUser.Id,
                Notes = "⚠️ Bel fıtığı (L4-L5): Ağır deadlift kısıtı, Trap Bar önerilir.",
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
            ufukMember.FullName = "Ufuk";
            ufukMember.UserId = ufukUser.Id;
            ufukMember.HeightCm ??= 176;
            ufukMember.WeightKg ??= 83m;
            ufukMember.Age ??= 38;
            ufukMember.Gender ??= "Erkek";
            if (string.IsNullOrWhiteSpace(ufukMember.Notes))
            {
                ufukMember.Notes = "⚠️ Bel fıtığı (L4-L5): Ağır deadlift kısıtı, Trap Bar önerilir.";
            }
            await db.SaveChangesAsync();
        }


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
