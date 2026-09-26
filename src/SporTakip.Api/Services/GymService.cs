using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;

namespace SporTakip.Api.Services;

public class GymService(ApplicationDbContext db, IMemoryCache? cache = null)
{
    public async Task<DashboardStatsDto> GetDashboardStatsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var startOfMonth = new DateTime(now.Year, now.Month, 1);
        var endOfMonth = startOfMonth.AddMonths(1).AddTicks(-1);

        var activeMembersCount = await db.Members.CountAsync(m => m.IsActive, cancellationToken);
        var activeSubscriptions = await db.Subscriptions
            .AsNoTracking()
            .Include(s => s.Member)
            .Include(s => s.Package)
            .Include(s => s.Payments)
            .Where(s => s.Status == "Active")
            .ToListAsync(cancellationToken);

        var expiringSubscriptions = activeSubscriptions
            .Where(s => s.RemainingLessons <= 2)
            .Select(MapToSubscriptionSummary)
            .ToList();

        var unpaidSubscriptions = activeSubscriptions
            .Where(s => s.RemainingBalance > 0)
            .Select(MapToSubscriptionSummary)
            .ToList();

        // Bu ayki ödemeler (doğrudan DB agregasyonu)
        var totalCollectedThisMonth = await db.Payments
            .Where(p => p.PaymentDate >= startOfMonth && p.PaymentDate <= endOfMonth)
            .SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;

        // Bu ay başlayan paketlerin toplam cirosu ve Salon / Hoca payı (tekil SQL agregasyonu)
        var subShareSums = await db.Subscriptions
            .Where(s => s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                TotalRevenue = g.Sum(s => s.Price),
                SalonShare = g.Sum(s => s.SalonShareAmount),
                TrainerShare = g.Sum(s => s.TrainerShareAmount)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var totalRevenueThisMonth = subShareSums?.TotalRevenue ?? 0m;
        var salonShareThisMonth = subShareSums?.SalonShare ?? 0m;
        var trainerShareThisMonth = subShareSums?.TrainerShare ?? 0m;

        // Bekleyen toplam alacak (tüm aktif paketlerden)
        var totalPendingReceivables = activeSubscriptions.Sum(s => s.RemainingBalance);

        // Bu ay yapılan ders sayısı
        var lessonsThisMonth = await db.AttendanceRecords
            .CountAsync(a => a.LessonDate >= startOfMonth && a.LessonDate <= endOfMonth && a.Status == "Attended", cancellationToken);

        return new DashboardStatsDto(
            TotalActiveMembers: activeMembersCount,
            TotalActiveSubscriptions: activeSubscriptions.Count,
            ExpiringSubscriptionsCount: expiringSubscriptions.Count,
            TotalRevenueThisMonth: totalRevenueThisMonth,
            TotalCollectedThisMonth: totalCollectedThisMonth,
            TotalPendingReceivables: totalPendingReceivables,
            SalonTotalShareThisMonth: salonShareThisMonth,
            TrainerTotalShareThisMonth: trainerShareThisMonth,
            TotalLessonsConductedThisMonth: lessonsThisMonth,
            ExpiringSubscriptions: expiringSubscriptions,
            UnpaidSubscriptions: unpaidSubscriptions
        );
    }

    public async Task<List<MemberDto>> GetMembersAsync(string? search = null, int? page = null, int? pageSize = null, CancellationToken cancellationToken = default)
    {
        var query = db.Members.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(m => m.FullName.ToLower().Contains(s) || (m.Phone != null && m.Phone.Contains(s)));
        }

        query = query.OrderBy(m => m.FullName);

        if (page.HasValue && pageSize.HasValue && page.Value > 0 && pageSize.Value > 0)
        {
            query = query.Skip((page.Value - 1) * pageSize.Value).Take(pageSize.Value);
        }

        var projected = await query
            .Select(m => new
            {
                Member = m,
                ActiveSub = m.Subscriptions
                    .Where(s => s.Status == "Active")
                    .Select(s => new
                    {
                        Subscription = s,
                        PackageName = s.Package != null ? s.Package.Name : "Standart Paket",
                        PaidAmount = s.Payments.Sum(p => (decimal?)p.Amount) ?? 0m
                    })
                    .FirstOrDefault(),
                TotalSubscriptionsCount = m.Subscriptions.Count()
            })
            .ToListAsync(cancellationToken);

        return projected.Select(item =>
        {
            var m = item.Member;
            SubscriptionSummaryDto? activeSubDto = null;
            if (item.ActiveSub != null)
            {
                var s = item.ActiveSub.Subscription;
                var paid = item.ActiveSub.PaidAmount;
                var remaining = Math.Max(0, s.Price - paid);
                activeSubDto = new SubscriptionSummaryDto(
                    s.Id,
                    m.Id,
                    m.FullName,
                    m.Phone,
                    m.Notes,
                    s.PackageId,
                    item.ActiveSub.PackageName,
                    s.Price,
                    s.TotalLessons,
                    s.CompletedLessons,
                    Math.Max(0, s.TotalLessons - s.CompletedLessons),
                    s.StartDate,
                    s.EndDate,
                    s.Status,
                    paid,
                    remaining,
                    remaining <= 0,
                    s.SalonShareAmount,
                    s.TrainerShareAmount
                );
            }

            var (bmi, bmiCategory) = CalculateBmi(m.HeightCm, m.WeightKg);
            return new MemberDto(
                m.Id,
                m.FullName,
                m.Phone,
                m.Email,
                m.Notes,
                m.IsActive,
                m.CreatedAt,
                activeSubDto,
                item.TotalSubscriptionsCount,
                m.HeightCm,
                m.WeightKg,
                m.Age,
                m.Gender,
                bmi,
                bmiCategory,
                m.MedicalConditions
            );
        }).ToList();
    }

    public static (decimal? Bmi, string? Category) CalculateBmi(int? heightCm, decimal? weightKg)
    {
        if (heightCm is null or <= 0 || weightKg is null or <= 0)
            return (null, null);

        var heightMeters = heightCm.Value / 100.0m;
        var bmi = Math.Round(weightKg.Value / (heightMeters * heightMeters), 1);
        var category = bmi switch
        {
            < 18.5m => "Zayıf",
            <= 24.9m => "Normal / Fit",
            <= 29.9m => "Fazla Kilolu",
            _ => "Yüksek (Obezite Sınırı)"
        };
        return (bmi, category);
    }

    public async Task<AthleteMetricsDto?> UpdateAthleteMetricsAsync(int memberId, UpdateAthleteMetricsDto dto, CancellationToken cancellationToken = default)
    {
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);
        if (member == null) return null;

        member.HeightCm = dto.HeightCm;
        member.WeightKg = dto.WeightKg;
        member.Age = dto.Age;
        member.Gender = dto.Gender?.Trim();

        await db.SaveChangesAsync(cancellationToken);

        var (bmi, category) = CalculateBmi(member.HeightCm, member.WeightKg);
        return new AthleteMetricsDto(
            member.Id,
            member.FullName,
            member.HeightCm,
            member.WeightKg,
            member.Age,
            member.Gender,
            bmi,
            category
        );
    }

    public async Task<MemberDto?> UpdateMemberNotesAsync(int memberId, string? notes, CancellationToken cancellationToken = default)
    {
        var member = await db.Members
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Package)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Payments)
            .FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);

        if (member == null) return null;

        member.Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        await db.SaveChangesAsync(cancellationToken);

        var activeSub = member.Subscriptions.FirstOrDefault(s => s.Status == "Active");
        var (bmi, bmiCategory) = CalculateBmi(member.HeightCm, member.WeightKg);
        return new MemberDto(
            member.Id,
            member.FullName,
            member.Phone,
            member.Email,
            member.Notes,
            member.IsActive,
            member.CreatedAt,
            activeSub != null ? MapToSubscriptionSummary(activeSub) : null,
            member.Subscriptions.Count,
            member.HeightCm,
            member.WeightKg,
            member.Age,
            member.Gender,
            bmi,
            bmiCategory,
            member.MedicalConditions
        );
    }


    public async Task<MemberDto?> GetMemberByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var m = await db.Members
            .AsNoTracking()
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Package)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Payments)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Attendances)
                    .ThenInclude(a => a.Trainer)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (m == null) return null;

        var activeSub = m.Subscriptions.FirstOrDefault(s => s.Status == "Active");
        var (bmi, bmiCategory) = CalculateBmi(m.HeightCm, m.WeightKg);
        return new MemberDto(
            m.Id,
            m.FullName,
            m.Phone,
            m.Email,
            m.Notes,
            m.IsActive,
            m.CreatedAt,
            activeSub != null ? MapToSubscriptionSummary(activeSub) : null,
            m.Subscriptions.Count,
            m.HeightCm,
            m.WeightKg,
            m.Age,
            m.Gender,
            bmi,
            bmiCategory,
            m.MedicalConditions
        );
    }

    public async Task<MemberDto> CreateMemberAsync(CreateMemberDto dto, CancellationToken cancellationToken = default)
    {
        var member = new Member
        {
            FullName = dto.FullName.Trim(),
            Phone = dto.Phone?.Trim(),
            Email = dto.Email?.Trim(),
            Notes = dto.Notes?.Trim(),
            MedicalConditions = dto.MedicalConditions?.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        db.Members.Add(member);
        await db.SaveChangesAsync(cancellationToken);

        return new MemberDto(member.Id, member.FullName, member.Phone, member.Email, member.Notes, member.IsActive, member.CreatedAt, null, 0, null, null, null, null, null, null, member.MedicalConditions);
    }

    public async Task<MemberDto?> UpdateMemberAsync(int memberId, UpdateMemberDto dto, CancellationToken cancellationToken = default)
    {
        var member = await db.Members
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Package)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Payments)
            .FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);

        if (member == null) return null;

        var normalizedPhone = string.IsNullOrWhiteSpace(dto.Phone) ? null : AuthService.NormalizePhoneNumber(dto.Phone);
        member.FullName = dto.FullName.Trim();
        member.Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
        member.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        member.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
        member.MedicalConditions = string.IsNullOrWhiteSpace(dto.MedicalConditions) ? null : dto.MedicalConditions.Trim();
        member.IsActive = dto.IsActive;

        if (dto.HeightCm.HasValue) member.HeightCm = dto.HeightCm;
        if (dto.WeightKg.HasValue) member.WeightKg = dto.WeightKg;
        if (dto.Age.HasValue) member.Age = dto.Age;
        if (!string.IsNullOrWhiteSpace(dto.Gender)) member.Gender = dto.Gender.Trim();

        if (member.UserId.HasValue)
        {
            var user = await db.Users.FindAsync(new object[] { member.UserId.Value }, cancellationToken);
            if (user != null)
            {
                user.FullName = member.FullName;
                user.IsActive = member.IsActive;
                if (!string.IsNullOrWhiteSpace(normalizedPhone))
                {
                    var conflict = await db.Users.AnyAsync(u => u.Id != user.Id && u.PhoneNumber == normalizedPhone, cancellationToken);
                    if (!conflict)
                    {
                        user.PhoneNumber = normalizedPhone;
                    }
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        var activeSub = member.Subscriptions.FirstOrDefault(s => s.Status == "Active");
        var (bmi, bmiCategory) = CalculateBmi(member.HeightCm, member.WeightKg);
        return new MemberDto(
            member.Id,
            member.FullName,
            member.Phone,
            member.Email,
            member.Notes,
            member.IsActive,
            member.CreatedAt,
            activeSub != null ? MapToSubscriptionSummary(activeSub) : null,
            member.Subscriptions.Count,
            member.HeightCm,
            member.WeightKg,
            member.Age,
            member.Gender,
            bmi,
            bmiCategory,
            member.MedicalConditions
        );
    }

    public async Task<List<PackageDto>> GetPackagesAsync(bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var cacheKey = includeInactive ? "packages_all" : "packages_active";
        if (cache != null && cache.TryGetValue(cacheKey, out List<PackageDto>? cached) && cached != null)
        {
            return cached;
        }

        var query = db.Packages.AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive);
        }

        var list = await query
            .OrderBy(p => p.PackageType)
            .ThenBy(p => p.LessonCount)
            .Select(p => new PackageDto(p.Id, p.Name, p.PackageType, p.LessonCount, p.DefaultPrice, p.ValidityDays, p.IsActive))
            .ToListAsync(cancellationToken);

        if (cache != null)
        {
            cache.Set(cacheKey, list, new MemoryCacheEntryOptions
            {
                SlidingExpiration = TimeSpan.FromMinutes(15)
            });
        }

        return list;
    }

    public async Task<PackageDto> CreatePackageAsync(CreatePackageDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Paket adı zorunludur.");
        if (dto.LessonCount <= 0)
            throw new ArgumentException("Ders sayısı en az 1 olmalıdır.");
        if (dto.DefaultPrice < 0)
            throw new ArgumentException("Paket fiyatı 0 veya daha büyük olmalıdır.");

        var package = new Package
        {
            Name = dto.Name.Trim(),
            PackageType = string.IsNullOrWhiteSpace(dto.PackageType) ? "GRUP" : dto.PackageType.Trim().ToUpperInvariant(),
            LessonCount = dto.LessonCount,
            DefaultPrice = dto.DefaultPrice,
            ValidityDays = dto.ValidityDays > 0 ? dto.ValidityDays : 35,
            IsActive = true
        };

        db.Packages.Add(package);
        await db.SaveChangesAsync(cancellationToken);

        cache?.Remove("packages_active");
        cache?.Remove("packages_all");

        return new PackageDto(package.Id, package.Name, package.PackageType, package.LessonCount, package.DefaultPrice, package.ValidityDays, package.IsActive);
    }

    public async Task<PackageDto> UpdatePackageAsync(int packageId, UpdatePackageDto dto, CancellationToken cancellationToken = default)
    {
        var package = await db.Packages.FindAsync([packageId], cancellationToken)
            ?? throw new InvalidOperationException("Güncellenecek paket bulunamadı.");

        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Paket adı zorunludur.");
        if (dto.LessonCount <= 0)
            throw new ArgumentException("Ders sayısı en az 1 olmalıdır.");
        if (dto.DefaultPrice < 0)
            throw new ArgumentException("Paket fiyatı 0 veya daha büyük olmalıdır.");

        package.Name = dto.Name.Trim();
        package.PackageType = string.IsNullOrWhiteSpace(dto.PackageType) ? "GRUP" : dto.PackageType.Trim().ToUpperInvariant();
        package.LessonCount = dto.LessonCount;
        package.DefaultPrice = dto.DefaultPrice;
        package.ValidityDays = dto.ValidityDays > 0 ? dto.ValidityDays : 35;
        package.IsActive = dto.IsActive;

        await db.SaveChangesAsync(cancellationToken);

        cache?.Remove("packages_active");
        cache?.Remove("packages_all");

        return new PackageDto(package.Id, package.Name, package.PackageType, package.LessonCount, package.DefaultPrice, package.ValidityDays, package.IsActive);
    }

    public async Task<bool> DeletePackageAsync(int packageId, CancellationToken cancellationToken = default)
    {
        var package = await db.Packages
            .Include(p => p.Subscriptions)
            .FirstOrDefaultAsync(p => p.Id == packageId, cancellationToken)
            ?? throw new InvalidOperationException("Silinecek paket bulunamadı.");

        if (package.Subscriptions.Count > 0)
        {
            // Kullanımda olan paketleri güvenle pasife al (soft delete)
            package.IsActive = false;
        }
        else
        {
            db.Packages.Remove(package);
        }

        await db.SaveChangesAsync(cancellationToken);

        cache?.Remove("packages_active");
        cache?.Remove("packages_all");

        return true;
    }


    public async Task<List<SubscriptionSummaryDto>> GetActiveSubscriptionsAsync(CancellationToken cancellationToken = default)
    {
        var subs = await db.Subscriptions
            .AsNoTracking()
            .Include(s => s.Member)
            .Include(s => s.Package)
            .Include(s => s.Payments)
            .Where(s => s.Status == "Active")
            .OrderBy(s => s.TotalLessons - s.CompletedLessons)
            .ToListAsync(cancellationToken);

        return subs.Select(MapToSubscriptionSummary).ToList();
    }

    public async Task<SubscriptionSummaryDto> CreateSubscriptionAsync(CreateSubscriptionDto dto, CancellationToken cancellationToken = default)
    {
        var package = await db.Packages.FindAsync([dto.PackageId], cancellationToken)
            ?? throw new InvalidOperationException("Paket bulunamadı.");

        var member = await db.Members.FindAsync([dto.MemberId], cancellationToken)
            ?? throw new InvalidOperationException("Müşteri bulunamadı.");

        var price = dto.Price > 0 ? dto.Price : package.DefaultPrice;
        var salonShare = price * dto.SalonShareRate;
        var trainerShare = Math.Max(0, price - salonShare);

        Trainer? primaryTrainer = null;
        if (dto.PrimaryTrainerId.HasValue)
        {
            primaryTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.Id == dto.PrimaryTrainerId.Value && t.IsActive, cancellationToken);
        }

        if (primaryTrainer == null)
        {
            primaryTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.Role == "Eğitmen", cancellationToken);
        }

        var subscription = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = primaryTrainer?.Id,
            Price = price,
            TotalLessons = package.LessonCount,
            CompletedLessons = 0,
            StartDate = dto.StartDate.Date,
            EndDate = dto.StartDate.Date.AddDays(package.ValidityDays),
            Status = "Active",
            Notes = dto.Notes,
            SalonShareRate = dto.SalonShareRate,
            SalonShareAmount = salonShare,
            TrainerShareAmount = trainerShare
        };

        db.Subscriptions.Add(subscription);
        await db.SaveChangesAsync(cancellationToken);

        if (dto.InitialPaymentAmount > 0)
        {
            var payment = new Payment
            {
                SubscriptionId = subscription.Id,
                Amount = dto.InitialPaymentAmount,
                PaymentDate = dto.StartDate,
                PaymentMethod = string.IsNullOrWhiteSpace(dto.PaymentMethod) ? "Nakit" : dto.PaymentMethod,
                Notes = "İlk ödeme / Peşinat"
            };
            db.Payments.Add(payment);
            await db.SaveChangesAsync(cancellationToken);
        }

        await db.Entry(subscription).Reference(s => s.Member).LoadAsync(cancellationToken);
        await db.Entry(subscription).Reference(s => s.Package).LoadAsync(cancellationToken);
        await db.Entry(subscription).Collection(s => s.Payments).LoadAsync(cancellationToken);

        return MapToSubscriptionSummary(subscription);
    }

    public async Task<AttendanceDto> MarkAttendanceAsync(MarkAttendanceDto dto, CancellationToken cancellationToken = default)
    {
        var subscription = await db.Subscriptions
            .Include(s => s.Member)
            .Include(s => s.Attendances)
            .FirstOrDefaultAsync(s => s.Id == dto.SubscriptionId, cancellationToken)
            ?? throw new InvalidOperationException("Abonelik bulunamadı.");

        if (subscription.Status != "Active" || subscription.RemainingLessons <= 0)
        {
            throw new InvalidOperationException("Bu pakette kalan ders hakkı bulunmuyor veya paket aktif değil.");
        }

        var attendingTrainer = dto.TrainerId.HasValue
            ? await db.Trainers.FindAsync([dto.TrainerId.Value], cancellationToken)
            : await db.Trainers.FirstOrDefaultAsync(t => t.Role == "Eğitmen", cancellationToken);

        var status = string.IsNullOrWhiteSpace(dto.Status) ? "Attended" : dto.Status;
        var unitPrice = subscription.TotalLessons > 0 ? (subscription.Price / subscription.TotalLessons) : 0m;

        // İkame Hoca (%40 Kuralı)
        bool isSubstitute = false;
        decimal substituteShare = 0m;
        decimal trainerShare = 0m;

        if (status == "Attended" || status == "Missed")
        {
            if (attendingTrainer != null && subscription.PrimaryTrainerId.HasValue && attendingTrainer.Id != subscription.PrimaryTrainerId)
            {
                // Farklı bir hoca derse girdiyse: İkame hoca %40 alır
                isSubstitute = true;
                substituteShare = unitPrice * 0.40m;
                trainerShare = substituteShare;
            }
            else
            {
                // Asıl hoca derse girdiyse
                trainerShare = unitPrice * (attendingTrainer?.DefaultShareRate ?? 0.40m);
            }
        }

        var lessonDate = dto.LessonDate ?? DateTime.UtcNow;
        var dayStart = lessonDate.Date;
        var dayEnd = dayStart.AddDays(1);

        // 1. Aynı gün ve saatte (veya aynı gün Scheduled durumunda) mevcut bir yoklama kaydı var mı?
        var existingRecord = await db.AttendanceRecords
            .Include(a => a.Subscription)
            .FirstOrDefaultAsync(a => a.SubscriptionId == subscription.Id 
                && a.LessonDate >= dayStart && a.LessonDate < dayEnd 
                && (a.LessonDate.Hour == lessonDate.Hour || a.Status == "Scheduled"), cancellationToken);

        AttendanceRecord attendance;
        if (existingRecord != null)
        {
            // Eğer bu saatteki seans için zaten "Attended" (Geldi) ise ve tekrar "Attended" deniyorsa: mükerrer ders düşmeyi engelle!
            if (existingRecord.Status == "Attended" && status == "Attended")
            {
                throw new InvalidOperationException($"Bu sporcu için saat {existingRecord.LessonDate:HH:mm} seansında zaten 'Geldi' yoklaması işlenmiş. Aynı saatte mükerrer ders düşülemez.");
            }

            // Bir kere yoklama alındıktan sonra katılım kesinleşir: "Geldiyse gelmiştir, sonradan gelmedi/iptal yapılamaz"
            if (existingRecord.Status == "Attended" && status == "Missed")
            {
                throw new InvalidOperationException($"Bu sporcu için saat {existingRecord.LessonDate:HH:mm} seansında katılım 'Geldi' olarak kesinleşmiştir. 'Gelmedi' olarak değiştirilemez.");
            }



            var oldStatus = existingRecord.Status;
            existingRecord.Status = status;
            existingRecord.LessonDate = lessonDate;
            if (attendingTrainer != null) existingRecord.TrainerId = attendingTrainer.Id;
            existingRecord.IsSubstitute = isSubstitute;
            existingRecord.SubstituteShareAmount = substituteShare;
            existingRecord.UnitLessonPrice = unitPrice;
            existingRecord.TrainerShareAmount = trainerShare;
            if (!string.IsNullOrWhiteSpace(dto.Notes)) existingRecord.Notes = dto.Notes;

            // Ders hakkı yönetimi:
            // Scheduled -> Attended veya Missed: 1 ders hakkı düş
            if (oldStatus == "Scheduled" && (status == "Attended" || status == "Missed"))
            {
                if (subscription.RemainingLessons <= 0)
                {
                    throw new InvalidOperationException("Bu pakette kalan ders hakkı bulunmuyor.");
                }
                subscription.CompletedLessons++;
            }
            // Attended veya Missed -> Excused (Mazeretli Telafi): Düşülmüş dersi iade et!
            else if ((oldStatus == "Attended" || oldStatus == "Missed") && status == "Excused")
            {
                if (subscription.CompletedLessons > 0)
                {
                    subscription.CompletedLessons--;
                }
            }
            // Excused -> Attended veya Missed: 1 ders hakkı düş
            else if (oldStatus == "Excused" && (status == "Attended" || status == "Missed"))
            {
                if (subscription.RemainingLessons <= 0)
                {
                    throw new InvalidOperationException("Bu pakette kalan ders hakkı bulunmuyor.");
                }
                subscription.CompletedLessons++;
            }

            if (subscription.CompletedLessons >= subscription.TotalLessons)
            {
                subscription.Status = "Completed";
            }
            else if (subscription.Status == "Completed" && subscription.CompletedLessons < subscription.TotalLessons)
            {
                subscription.Status = "Active";
            }

            attendance = existingRecord;
        }
        else
        {
            if (subscription.Status != "Active" || subscription.RemainingLessons <= 0)
            {
                throw new InvalidOperationException("Bu pakette kalan ders hakkı bulunmuyor veya paket aktif değil.");
            }

            var lessonNumber = subscription.CompletedLessons + 1;
            attendance = new AttendanceRecord
            {
                SubscriptionId = subscription.Id,
                LessonNumber = lessonNumber,
                LessonDate = lessonDate,
                TrainerId = attendingTrainer?.Id,
                Status = status,
                IsSubstitute = isSubstitute,
                SubstituteShareAmount = substituteShare,
                UnitLessonPrice = unitPrice,
                TrainerShareAmount = trainerShare,
                Notes = dto.Notes
            };
            db.AttendanceRecords.Add(attendance);

            if (status == "Attended" || status == "Missed")
            {
                subscription.CompletedLessons++;
                if (subscription.CompletedLessons >= subscription.TotalLessons)
                {
                    subscription.Status = "Completed";
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        return new AttendanceDto(
            attendance.Id,
            attendance.SubscriptionId,
            subscription.Member.FullName,
            attendance.LessonNumber,
            attendance.LessonDate,
            attendingTrainer?.Id,
            attendingTrainer?.FullName,
            attendance.Status,
            attendance.UnitLessonPrice,
            attendance.TrainerShareAmount,
            attendance.Notes
        );
    }

    public async Task<MarkAllSlotResultDto> MarkAllAttendedForSlotAsync(MarkAllSlotAttendanceDto dto, CancellationToken cancellationToken = default)
    {
        var targetDate = (dto.Date ?? DateTime.UtcNow).Date;
        var hour = dto.Hour;
        var slotStart = targetDate.AddHours(hour);
        var slotEnd = slotStart.AddHours(1);

        // İlgili saat dilimindeki tüm yoklama/seans kayıtlarını sargable aralıkla çek
        var records = await db.AttendanceRecords
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Member)
            .Include(a => a.Trainer)
            .Where(a => a.LessonDate >= slotStart && a.LessonDate < slotEnd)
            .ToListAsync(cancellationToken);

        if (records.Count == 0)
        {
            return new MarkAllSlotResultDto(0, 0, $"Saat {hour:D2}:00 için kayıtlı sporcu bulunamadı.");
        }

        Trainer? fallbackTrainer = null;
        if (dto.TrainerId.HasValue)
        {
            fallbackTrainer = await db.Trainers.FindAsync([dto.TrainerId.Value], cancellationToken);
        }
        fallbackTrainer ??= await db.Trainers.FirstOrDefaultAsync(t => t.Role == "Eğitmen", cancellationToken);

        int updatedCount = 0;

        foreach (var record in records)
        {
            if (record.Status == "Attended")
                continue;

            var subscription = record.Subscription;
            if (subscription == null)
                continue;

            var trainer = record.Trainer ?? fallbackTrainer;
            var unitPrice = subscription.TotalLessons > 0 ? (subscription.Price / subscription.TotalLessons) : 0m;

            bool isSubstitute = false;
            decimal substituteShare = 0m;
            decimal trainerShare = 0m;

            if (trainer != null && subscription.PrimaryTrainerId.HasValue && trainer.Id != subscription.PrimaryTrainerId)
            {
                isSubstitute = true;
                substituteShare = unitPrice * 0.40m;
                trainerShare = substituteShare;
            }
            else
            {
                trainerShare = unitPrice * (trainer?.DefaultShareRate ?? 0.40m);
            }

            if (record.Status == "Scheduled" || record.Status == "Excused")
            {
                if (subscription.RemainingLessons > 0)
                {
                    subscription.CompletedLessons++;
                    if (subscription.CompletedLessons >= subscription.TotalLessons)
                    {
                        subscription.Status = "Completed";
                    }
                }
            }

            record.Status = "Attended";
            record.UnitLessonPrice = unitPrice;
            record.TrainerShareAmount = trainerShare;
            record.SubstituteShareAmount = substituteShare;
            record.IsSubstitute = isSubstitute;
            if (record.TrainerId == null && trainer != null)
            {
                record.TrainerId = trainer.Id;
            }

            updatedCount++;
        }

        if (updatedCount > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return new MarkAllSlotResultDto(
            UpdatedCount: updatedCount,
            TotalCount: records.Count,
            Message: updatedCount > 0 
                ? $"Saat {hour:D2}:00 seansında {updatedCount} sporcu için yoklama 'Geldi' olarak kaydedildi."
                : $"Saat {hour:D2}:00 seansındaki tüm sporcular zaten 'Geldi' olarak işlenmiş."
        );
    }

    public async Task<PaymentDto> AddPaymentAsync(CreatePaymentDto dto, CancellationToken cancellationToken = default)
    {
        var sub = await db.Subscriptions
            .Include(s => s.Member)
            .FirstOrDefaultAsync(s => s.Id == dto.SubscriptionId, cancellationToken)
            ?? throw new InvalidOperationException("Abonelik bulunamadı.");

        var payment = new Payment
        {
            SubscriptionId = sub.Id,
            Amount = dto.Amount,
            PaymentDate = dto.PaymentDate ?? DateTime.UtcNow,
            PaymentMethod = dto.PaymentMethod,
            Notes = dto.Notes
        };

        db.Payments.Add(payment);
        await db.SaveChangesAsync(cancellationToken);

        return new PaymentDto(
            payment.Id,
            payment.SubscriptionId,
            sub.Member.FullName,
            payment.Amount,
            payment.PaymentDate,
            payment.PaymentMethod,
            payment.Notes
        );
    }

    public async Task<List<TrainerShareSummaryDto>> GetTrainerPayrollAsync(int year, int month, CancellationToken cancellationToken = default)
    {
        var startOfMonth = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endOfMonth = startOfMonth.AddMonths(1).AddTicks(-1);

        var trainers = await db.Trainers.AsNoTracking().Where(t => t.IsActive).ToListAsync(cancellationToken);
        var list = new List<TrainerShareSummaryDto>();

        var subsThisMonth = await db.Subscriptions
            .AsNoTracking()
            .Where(s => s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
            .ToListAsync(cancellationToken);

        var allAttendances = await db.AttendanceRecords
            .AsNoTracking()
            .Where(a => a.LessonDate >= startOfMonth && a.LessonDate <= endOfMonth && (a.Status == "Attended" || a.Status == "Missed"))
            .ToListAsync(cancellationToken);

        var attendancesByTrainer = allAttendances
            .Where(a => a.TrainerId.HasValue)
            .GroupBy(a => a.TrainerId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var salonShareTotal = subsThisMonth.Sum(s => s.SalonShareAmount);
        var subsByTrainer = subsThisMonth
            .Where(s => s.PrimaryTrainerId.HasValue)
            .GroupBy(s => s.PrimaryTrainerId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(s => s.TrainerShareAmount));

        foreach (var t in trainers)
        {
            var attendances = attendancesByTrainer.TryGetValue(t.Id, out var attList) ? attList : [];

            decimal packageShare = 0m;
            decimal lessonEarnings = attendances.Sum(a => a.TrainerShareAmount);

            if (t.Role == "Salon Sahibi")
            {
                // Salon Sahibi: Salon paylarının toplamı
                packageShare = salonShareTotal;
            }
            else
            {
                // Hocalar: Paket hakediş payı (varsa)
                packageShare = subsByTrainer.TryGetValue(t.Id, out var share) ? share : 0m;
            }

            list.Add(new TrainerShareSummaryDto(
                TrainerId: t.Id,
                TrainerName: t.FullName,
                Role: t.Role,
                TotalLessonsGiven: attendances.Count,
                TotalLessonEarnings: lessonEarnings,
                TotalPackageShare: packageShare,
                TotalEarnings: lessonEarnings + packageShare
            ));
        }

        return list;
    }

    public async Task<TrainerPersonalEarningsDto?> GetTrainerPersonalEarningsAsync(int userId, int year, int month, CancellationToken cancellationToken = default)
    {
        var trainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == userId && t.IsActive, cancellationToken);
        if (trainer == null)
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user != null)
            {
                var cleanPhone = user.PhoneNumber?.Replace("+90", "").Trim();
                trainer = await db.Trainers.FirstOrDefaultAsync(t => 
                    t.IsActive && (
                        (t.Phone != null && cleanPhone != null && t.Phone.Contains(cleanPhone)) ||
                        t.FullName.ToLower() == user.FullName.ToLower()
                    ), cancellationToken);
            }
        }

        if (trainer == null) return null;

        var startOfMonth = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endOfMonth = startOfMonth.AddMonths(1).AddTicks(-1);

        var attendances = await db.AttendanceRecords
            .AsNoTracking()
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Member)
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Package)
            .Where(a => a.TrainerId == trainer.Id && a.LessonDate >= startOfMonth && a.LessonDate <= endOfMonth && (a.Status == "Attended" || a.Status == "Missed"))
            .OrderByDescending(a => a.LessonDate)
            .ToListAsync(cancellationToken);

        int totalLessons = attendances.Count;
        int ownStudentLessons = attendances.Count(a => a.Subscription.PrimaryTrainerId == trainer.Id && !a.IsSubstitute);
        int substituteLessons = attendances.Count(a => a.Subscription.PrimaryTrainerId != trainer.Id || a.IsSubstitute);

        decimal lessonEarnings = attendances.Sum(a => a.TrainerShareAmount);

        decimal packageShare = 0m;
        if (trainer.Role == "Salon Sahibi")
        {
            var subsThisMonth = await db.Subscriptions
                .AsNoTracking()
                .Where(s => s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
                .ToListAsync(cancellationToken);
            packageShare = subsThisMonth.Sum(s => s.SalonShareAmount);
        }
        else
        {
            var myPrimarySubs = await db.Subscriptions
                .AsNoTracking()
                .Where(s => s.PrimaryTrainerId == trainer.Id && s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
                .ToListAsync(cancellationToken);
            packageShare = myPrimarySubs.Sum(s => s.TrainerShareAmount);
        }

        var lessonHistory = attendances.Select(a => new TrainerLessonHistoryItemDto(
            AttendanceId: a.Id,
            LessonDate: a.LessonDate,
            MemberName: a.Subscription?.Member?.FullName ?? "Bilinmiyor",
            PackageName: a.Subscription?.Package?.Name ?? "Standart",
            LessonNumber: a.LessonNumber,
            IsSubstitute: a.Subscription?.PrimaryTrainerId != trainer.Id || a.IsSubstitute,
            EarnedAmount: a.TrainerShareAmount,
            Status: a.Status,
            Notes: a.Notes
        )).ToList();

        return new TrainerPersonalEarningsDto(
            TrainerId: trainer.Id,
            TrainerName: trainer.FullName,
            Role: trainer.Role,
            Year: year,
            Month: month,
            TotalLessonsGiven: totalLessons,
            OwnStudentLessons: ownStudentLessons,
            SubstituteLessons: substituteLessons,
            TotalLessonEarnings: lessonEarnings,
            TotalPackageShare: packageShare,
            TotalEarnings: lessonEarnings + packageShare,
            LessonHistory: lessonHistory
        );
    }


    public async Task<List<TrainerDto>> GetTrainersAsync(CancellationToken cancellationToken = default)
    {
        return await db.Trainers
            .AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.Role == "Salon Sahibi" ? 0 : 1)
            .Select(t => new TrainerDto(t.Id, t.FullName, t.Role, t.Phone, t.DefaultShareRate, t.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<TrainerDto?> GetTrainerByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var t = await db.Trainers.AsNoTracking().FirstOrDefaultAsync(tr => tr.Id == id && tr.IsActive, cancellationToken);
        if (t == null) return null;
        return new TrainerDto(t.Id, t.FullName, t.Role, t.Phone, t.DefaultShareRate, t.IsActive);
    }

    public async Task<TrainerDto> CreateTrainerAsync(CreateTrainerDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            throw new ArgumentException("Eğitmen adı boş olamaz.", nameof(dto));

        var trainer = new Trainer
        {
            FullName = dto.FullName.Trim(),
            Role = string.IsNullOrWhiteSpace(dto.Role) ? "Eğitmen" : dto.Role.Trim(),
            Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim(),
            DefaultShareRate = dto.DefaultShareRate > 0 ? dto.DefaultShareRate : 0.40m,
            IsActive = true
        };

        db.Trainers.Add(trainer);
        await db.SaveChangesAsync(cancellationToken);

        return new TrainerDto(trainer.Id, trainer.FullName, trainer.Role, trainer.Phone, trainer.DefaultShareRate, trainer.IsActive);
    }

    public async Task<TrainerDto?> UpdateTrainerAsync(int id, UpdateTrainerDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            throw new ArgumentException("Eğitmen adı boş olamaz.", nameof(dto));

        var trainer = await db.Trainers.FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
        if (trainer == null) return null;

        var normalizedPhone = !string.IsNullOrWhiteSpace(dto.Phone) ? AuthService.NormalizePhoneNumber(dto.Phone) : null;
        trainer.FullName = dto.FullName.Trim();
        trainer.Role = string.IsNullOrWhiteSpace(dto.Role) ? "Eğitmen" : dto.Role.Trim();
        trainer.Phone = normalizedPhone;
        if (dto.DefaultShareRate >= 0)
            trainer.DefaultShareRate = dto.DefaultShareRate;
        trainer.IsActive = dto.IsActive;

        if (trainer.UserId.HasValue)
        {
            var user = await db.Users.FindAsync(new object[] { trainer.UserId.Value }, cancellationToken);
            if (user != null)
            {
                user.FullName = trainer.FullName;
                user.IsActive = trainer.IsActive;
                if (!string.IsNullOrWhiteSpace(normalizedPhone))
                {
                    var conflict = await db.Users.AnyAsync(u => u.Id != user.Id && u.PhoneNumber == normalizedPhone, cancellationToken);
                    if (!conflict)
                    {
                        user.PhoneNumber = normalizedPhone;
                    }
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        cache?.Remove("gym_info");
        return new TrainerDto(trainer.Id, trainer.FullName, trainer.Role, trainer.Phone, trainer.DefaultShareRate, trainer.IsActive);
    }


    public async Task<AttendanceDto> ScheduleSessionAsync(ScheduleSessionDto dto, CancellationToken cancellationToken = default)
    {
        var subscription = await db.Subscriptions
            .Include(s => s.Member)
            .FirstOrDefaultAsync(s => s.Id == dto.SubscriptionId, cancellationToken)
            ?? throw new InvalidOperationException("Abonelik bulunamadı.");

        if (subscription.Status != "Active" || subscription.RemainingLessons <= 0)
        {
            throw new InvalidOperationException("Bu pakette kalan ders hakkı bulunmuyor veya paket aktif değil.");
        }

        var trainer = dto.TrainerId.HasValue
            ? await db.Trainers.FindAsync([dto.TrainerId.Value], cancellationToken)
            : (subscription.PrimaryTrainerId.HasValue 
                ? await db.Trainers.FindAsync([subscription.PrimaryTrainerId.Value], cancellationToken)
                : await db.Trainers.FirstOrDefaultAsync(t => t.Role == "Eğitmen", cancellationToken));

        var scheduled = new AttendanceRecord
        {
            SubscriptionId = subscription.Id,
            LessonNumber = subscription.CompletedLessons + 1,
            LessonDate = dto.SessionTime,
            TrainerId = trainer?.Id,
            Status = "Scheduled",
            Notes = dto.Notes ?? "Planlanmış Seans"
        };

        db.AttendanceRecords.Add(scheduled);
        await db.SaveChangesAsync(cancellationToken);

        return new AttendanceDto(
            scheduled.Id,
            scheduled.SubscriptionId,
            subscription.Member.FullName,
            scheduled.LessonNumber,
            scheduled.LessonDate,
            trainer?.Id,
            trainer?.FullName,
            scheduled.Status,
            0m,
            0m,
            scheduled.Notes
        );
    }

    public async Task<List<HourlySlotCapacityDto>> GetHourlyStudioCapacityAsync(DateTime targetDate, CancellationToken cancellationToken = default)
    {
        var date = targetDate.Date;
        var nextDay = date.AddDays(1);
        var records = await db.AttendanceRecords
            .AsNoTracking()
            .Include(a => a.Trainer)
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Member)
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Package)
            .Where(a => a.LessonDate >= date && a.LessonDate < nextDay)
            .ToListAsync(cancellationToken);

        // Butik stüdyo operasyon saatleri: 09:00 - 21:00 (Kesintisiz saatlik çizelge)
        var operatingHours = new int[] { 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 };
        var result = new List<HourlySlotCapacityDto>();

        foreach (var hour in operatingHours)
        {
            var hourRecords = records.Where(r => r.LessonDate.Hour == hour).ToList();
            var totalCount = hourRecords.Count;
            var limit = 6;

            string statusLevel = totalCount >= limit 
                ? "Full" 
                : (totalCount >= 4 ? "Filling" : "Comfortable");

            var trainerBreakdown = hourRecords
                .GroupBy(r => new { Id = r.TrainerId ?? 0, Name = r.Trainer?.FullName ?? "Atanmamış" })
                .Select(g => new TrainerSlotBreakdownDto(
                    g.Key.Id,
                    g.Key.Name,
                    g.Count(),
                    g.Select(r => r.Subscription.Member.FullName).ToList()
                ))
                .ToList();

            var members = hourRecords.Select(r => new SlotMemberDto(
                AttendanceId: r.Id,
                SubscriptionId: r.SubscriptionId,
                MemberId: r.Subscription.MemberId,
                MemberName: r.Subscription.Member.FullName,
                MemberPhone: r.Subscription.Member.Phone,
                PackageName: r.Subscription.Package.Name,
                RemainingLessons: r.Subscription.RemainingLessons,
                TrainerId: r.TrainerId,
                TrainerName: r.Trainer?.FullName,
                Status: r.Status
            )).ToList();

            var timeSlotStr = $"{hour:D2}:00";

            result.Add(new HourlySlotCapacityDto(
                TimeSlot: timeSlotStr,
                Hour: hour,
                TotalMembers: totalCount,
                CapacityLimit: limit,
                StatusLevel: statusLevel,
                Trainers: trainerBreakdown,
                Members: members
            ));
        }

        return result;
    }

    public async Task<MonthCalendarDto> GetMonthlyCalendarAsync(int year, int month, CancellationToken cancellationToken = default)
    {
        var firstDayOfMonth = new DateTime(year, month, 1);
        var daysInMonth = DateTime.DaysInMonth(year, month);
        var lastDayOfMonth = new DateTime(year, month, daysInMonth);

        // ISO DayOfWeek: Pazartesi=1, ..., Pazar=7
        int firstDayIsoOfWeek = firstDayOfMonth.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)firstDayOfMonth.DayOfWeek;
        int leadingDaysCount = firstDayIsoOfWeek - 1;

        var gridStartDate = firstDayOfMonth.AddDays(-leadingDaysCount);
        int totalDaysNeeded = leadingDaysCount + daysInMonth;
        int trailingDaysCount = (7 - (totalDaysNeeded % 7)) % 7;
        int totalCells = totalDaysNeeded + trailingDaysCount;
        var gridEndDate = gridStartDate.AddDays(totalCells - 1);

        var records = await db.AttendanceRecords
            .AsNoTracking()
            .Include(a => a.Trainer)
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Member)
            .Where(a => a.LessonDate >= gridStartDate && a.LessonDate < gridEndDate.AddDays(1))
            .ToListAsync(cancellationToken);

        var culture = new System.Globalization.CultureInfo("tr-TR");
        var monthName = firstDayOfMonth.ToString("MMMM yyyy", culture);

        var days = new List<MonthCalendarDayDto>();
        int totalMonthSessions = 0;
        int totalMonthAthletes = 0;

        for (int i = 0; i < totalCells; i++)
        {
            var date = gridStartDate.AddDays(i);
            bool isCurrentMonth = date.Month == month && date.Year == year;
            bool isToday = date.Date == DateTime.UtcNow.Date;

            var dayRecords = records.Where(r => r.LessonDate.Date == date.Date).ToList();

            var slots = dayRecords
                .GroupBy(r => new { r.LessonDate.Hour, TrainerName = r.Trainer?.FullName ?? "Genel" })
                .OrderBy(g => g.Key.Hour)
                .Select(g => new CalendarSlotSummaryDto(
                    TimeSlot: $"{g.Key.Hour:D2}:00",
                    Hour: g.Key.Hour,
                    TrainerName: g.Key.TrainerName,
                    AthleteCount: g.Count()
                ))
                .ToList();

            int daySessions = slots.Count;
            int dayAthletes = dayRecords.Count;

            if (isCurrentMonth)
            {
                totalMonthSessions += daySessions;
                totalMonthAthletes += dayAthletes;
            }

            string statusLevel = "Empty";
            if (dayAthletes > 0)
            {
                statusLevel = dayAthletes >= 6 ? "Full" : (dayAthletes >= 4 ? "Filling" : "Comfortable");
            }

            int isoDayOfWeek = date.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)date.DayOfWeek;

            days.Add(new MonthCalendarDayDto(
                Date: date,
                Day: date.Day,
                DayOfWeek: isoDayOfWeek,
                IsCurrentMonth: isCurrentMonth,
                IsToday: isToday,
                TotalSessions: daySessions,
                TotalAthletes: dayAthletes,
                StatusLevel: statusLevel,
                Slots: slots
            ));
        }

        return new MonthCalendarDto(
            Year: year,
            Month: month,
            MonthName: monthName,
            TotalMonthSessions: totalMonthSessions,
            TotalMonthAthletes: totalMonthAthletes,
            Days: days
        );
    }


    public static SubscriptionSummaryDto MapToSubscriptionSummary(Subscription s)
    {
        return new SubscriptionSummaryDto(
            s.Id,
            s.MemberId,
            s.Member?.FullName ?? "Bilinmiyor",
            s.Member?.Phone,
            s.Member?.Notes,
            s.PackageId,
            s.Package?.Name ?? "Standart Paket",
            s.Price,
            s.TotalLessons,
            s.CompletedLessons,
            s.RemainingLessons,
            s.StartDate,
            s.EndDate,
            s.Status,
            s.PaidAmount,
            s.RemainingBalance,
            s.IsFullyPaid,
            s.SalonShareAmount,
            s.TrainerShareAmount
        );
    }

    /// <summary>
    /// Stüdyo genel iletişim ve adres bilgilerini döner. Telefon numarası sistemdeki aktif Salon Sahibi'nden (Admin) dinamik olarak çekilir.
    /// </summary>
    public async Task<GymInfoDto> GetGymInfoAsync(CancellationToken cancellationToken = default)
    {
        const string cacheKey = "gym_info";
        if (cache != null && cache.TryGetValue(cacheKey, out GymInfoDto? cached) && cached != null)
        {
            return cached;
        }

        // 1. Rolü "Salon Sahibi" olan aktif antrenörü bul
        var ownerTrainer = await db.Trainers
            .AsNoTracking()
            .Where(t => t.IsActive && (t.Role == "Salon Sahibi" || t.Role.Contains("Sahip")))
            .OrderBy(t => t.Id)
            .FirstOrDefaultAsync(cancellationToken);

        string? ownerPhone = ownerTrainer?.Phone;
        string? ownerName = ownerTrainer?.FullName;

        // Trainer üzerinde telefon yoksa bağlı AppUser'dan al
        if (string.IsNullOrWhiteSpace(ownerPhone) && ownerTrainer?.UserId != null)
        {
            var user = await db.Users.FindAsync([ownerTrainer.UserId.Value], cancellationToken);
            if (user != null)
            {
                ownerPhone = user.PhoneNumber;
                ownerName ??= user.FullName;
            }
        }

        // 2. Trainer kaydında bulunamadıysa Admin rolüne sahip aktif ilk kullanıcıdan al
        if (string.IsNullOrWhiteSpace(ownerPhone))
        {
            var adminUser = await db.Users
                .AsNoTracking()
                .Where(u => u.IsActive && u.Roles.HasFlag(UserRole.Admin) && !u.Roles.HasFlag(UserRole.SuperAdmin))
                .OrderBy(u => u.Id)
                .FirstOrDefaultAsync(cancellationToken)
                ?? await db.Users.AsNoTracking().Where(u => u.IsActive && u.Roles.HasFlag(UserRole.Admin)).FirstOrDefaultAsync(cancellationToken);

            if (adminUser != null)
            {
                ownerPhone = adminUser.PhoneNumber;
                ownerName ??= adminUser.FullName;
            }
        }

        // Güvenli varsayılan
        ownerPhone ??= "+905321112233";
        ownerName ??= "Salon Sahibi";

        var cleanDigits = new string(ownerPhone.Where(char.IsDigit).ToArray());
        var cleanPhone = cleanDigits.StartsWith("0") ? "90" + cleanDigits[1..] : (cleanDigits.StartsWith("90") ? cleanDigits : "90" + cleanDigits);
        var formatted = FormatPhoneDisplay(ownerPhone);

        var result = new GymInfoDto(
            StudioName: "Compound Athletic Stüdyosu",
            Address: "İhsaniye, Erkal Sk. No:5A, 16600 Nilüfer / Bursa",
            MapsUrl: "https://maps.google.com/?q=%C4%B0hsaniye,+Erkal+Sk.+No:5A,+16600+Nil%C3%BCfer/Bursa",
            WorkingHours: "Hafta İçi: 07:00 – 22:00 | Hafta Sonu: 09:00 – 18:00",
            OwnerName: ownerName,
            OwnerPhone: ownerPhone,
            FormattedPhone: formatted,
            CleanPhone: cleanPhone
        );

        if (cache != null)
        {
            cache.Set(cacheKey, result, new MemoryCacheEntryOptions
            {
                SlidingExpiration = TimeSpan.FromMinutes(15)
            });
        }

        return result;
    }

    private static string FormatPhoneDisplay(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("90") && digits.Length == 12)
        {
            return $"+90 {digits.Substring(2, 3)} {digits.Substring(5, 3)} {digits.Substring(8, 2)} {digits.Substring(10, 2)}";
        }
        if (digits.StartsWith("0") && digits.Length == 11)
        {
            return $"+90 {digits.Substring(1, 3)} {digits.Substring(4, 3)} {digits.Substring(7, 2)} {digits.Substring(9, 2)}";
        }
        if (digits.Length == 10)
        {
            return $"+90 {digits.Substring(0, 3)} {digits.Substring(3, 3)} {digits.Substring(6, 2)} {digits.Substring(8, 2)}";
        }
        return phone;
    }
}
