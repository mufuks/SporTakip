using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public partial class GymService
{
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
            if (dto.LessonDate.HasValue) existingRecord.LessonDate = dto.LessonDate.Value;
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

        var pendingScheduledCount = await db.AttendanceRecords
            .CountAsync(a => a.SubscriptionId == subscription.Id && a.Status == "Scheduled", cancellationToken);

        var scheduled = new AttendanceRecord
        {
            SubscriptionId = subscription.Id,
            LessonNumber = subscription.CompletedLessons + pendingScheduledCount + 1,
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
}
