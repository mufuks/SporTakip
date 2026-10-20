using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public partial class GymService
{
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
                    .Where(s => s.Status == "Active" || s.Status == "Frozen")
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
                    s.TrainerShareAmount,
                    null,
                    m.MedicalConditions
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

    public async Task<AthleteMetricsDto?> UpdateAthleteMetricsAsync(int memberId, UpdateAthleteMetricsDto dto, CancellationToken cancellationToken = default)
    {
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);
        if (member == null) return null;

        var oldWeight = member.WeightKg;
        member.HeightCm = dto.HeightCm;
        member.WeightKg = dto.WeightKg;
        member.Age = dto.Age;
        member.Gender = dto.Gender?.Trim();

        if (dto.WeightKg.HasValue && dto.WeightKg > 0 && dto.WeightKg != oldWeight)
        {
            db.BodyMetricLogs.Add(new BodyMetricLog
            {
                MemberId = member.Id,
                RecordedAt = DateTime.UtcNow,
                WeightKg = dto.WeightKg.Value,
                Notes = "Profil güncellemesi",
                CreatedAt = DateTime.UtcNow
            });
        }

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

    public async Task<BodyMetricsProgressDto?> GetMemberBodyMetricsProgressAsync(int memberId, CancellationToken cancellationToken = default)
    {
        var member = await db.Members
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);
            
        if (member == null) return null;

        var logs = await db.BodyMetricLogs
            .AsNoTracking()
            .Where(b => b.MemberId == memberId)
            .OrderBy(b => b.RecordedAt)
            .Select(b => new BodyMetricLogDto(
                b.Id,
                b.MemberId,
                b.RecordedAt,
                b.WeightKg,
                b.BodyFatPercentage,
                b.MuscleMassKg,
                b.Notes,
                b.CreatedAt
            ))
            .ToListAsync(cancellationToken);

        var startingWeight = logs.Count > 0 ? logs[0].WeightKg : member.WeightKg;
        var currentWeight = logs.Count > 0 ? logs[^1].WeightKg : member.WeightKg;
        var totalChange = (currentWeight.HasValue && startingWeight.HasValue) ? currentWeight.Value - startingWeight.Value : (decimal?)null;
        var minWeight = logs.Count > 0 ? logs.Min(l => l.WeightKg) : member.WeightKg;
        var maxWeight = logs.Count > 0 ? logs.Max(l => l.WeightKg) : member.WeightKg;
        var (bmi, bmiCategory) = CalculateBmi(member.HeightCm, currentWeight);

        return new BodyMetricsProgressDto(
            member.Id,
            member.FullName,
            member.HeightCm,
            currentWeight,
            startingWeight,
            totalChange,
            minWeight,
            maxWeight,
            bmi,
            bmiCategory,
            logs
        );
    }

    public async Task<BodyMetricLogDto?> AddBodyMetricLogAsync(int memberId, CreateBodyMetricLogDto dto, CancellationToken cancellationToken = default)
    {
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);
        if (member == null) return null;

        var recordedAt = dto.RecordedAt ?? DateTime.UtcNow;

        var log = new BodyMetricLog
        {
            MemberId = memberId,
            RecordedAt = recordedAt,
            WeightKg = dto.WeightKg,
            BodyFatPercentage = dto.BodyFatPercentage,
            MuscleMassKg = dto.MuscleMassKg,
            Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        db.BodyMetricLogs.Add(log);

        var latestLogDate = await db.BodyMetricLogs
            .Where(b => b.MemberId == memberId)
            .MaxAsync(b => (DateTime?)b.RecordedAt, cancellationToken);

        if (latestLogDate == null || recordedAt >= latestLogDate.Value)
        {
            member.WeightKg = dto.WeightKg;
        }

        await db.SaveChangesAsync(cancellationToken);

        return new BodyMetricLogDto(
            log.Id,
            log.MemberId,
            log.RecordedAt,
            log.WeightKg,
            log.BodyFatPercentage,
            log.MuscleMassKg,
            log.Notes,
            log.CreatedAt
        );
    }

    public async Task<bool> DeleteBodyMetricLogAsync(int memberId, int logId, CancellationToken cancellationToken = default)
    {
        var log = await db.BodyMetricLogs.FirstOrDefaultAsync(b => b.MemberId == memberId && b.Id == logId, cancellationToken);
        if (log == null) return false;

        db.BodyMetricLogs.Remove(log);
        await db.SaveChangesAsync(cancellationToken);

        var latestRemainingLog = await db.BodyMetricLogs
            .Where(b => b.MemberId == memberId)
            .OrderByDescending(b => b.RecordedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);
        if (member != null)
        {
            if (latestRemainingLog != null)
            {
                member.WeightKg = latestRemainingLog.WeightKg;
            }
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<MemberDto?> UpdateMemberNotesAsync(int memberId, string? notes, string? medicalConditions = null, CancellationToken cancellationToken = default)
    {
        var member = await db.Members
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Package)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Payments)
            .FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);

        if (member == null) return null;

        if (notes != null)
        {
            member.Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        }
        if (medicalConditions != null)
        {
            member.MedicalConditions = string.IsNullOrWhiteSpace(medicalConditions) ? null : medicalConditions.Trim();
        }
        await db.SaveChangesAsync(cancellationToken);

        var activeSub = member.Subscriptions.FirstOrDefault(s => s.Status == "Active" || s.Status == "Frozen");
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
                .ThenInclude(s => s.FreezeRecords)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Attendances)
                    .ThenInclude(a => a.Trainer)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (m == null) return null;

        var activeSub = m.Subscriptions.FirstOrDefault(s => s.Status == "Active" || s.Status == "Frozen");
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
            m.MedicalConditions,
            m.UserId
        );
    }

    public async Task<MemberDto?> GetMemberByUserIdAsync(int userId, CancellationToken cancellationToken = default)
    {
        var member = await db.Members
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.UserId == userId, cancellationToken);

        if (member == null) return null;
        return await GetMemberByIdAsync(member.Id, cancellationToken);
    }

    public async Task<MemberDto> CreateMemberAsync(CreateMemberDto dto, CancellationToken cancellationToken = default)
    {
        var normalizedPhone = string.IsNullOrWhiteSpace(dto.Phone) ? null : AuthService.NormalizePhoneNumber(dto.Phone);
        int? linkedUserId = null;
        if (!string.IsNullOrWhiteSpace(normalizedPhone))
        {
            var existingUser = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == normalizedPhone, cancellationToken);
            if (existingUser != null)
            {
                linkedUserId = existingUser.Id;
            }
        }

        var member = new Member
        {
            FullName = dto.FullName.Trim(),
            Phone = normalizedPhone ?? dto.Phone?.Trim(),
            Email = dto.Email?.Trim(),
            Notes = dto.Notes?.Trim(),
            MedicalConditions = dto.MedicalConditions?.Trim(),
            UserId = linkedUserId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        db.Members.Add(member);
        await db.SaveChangesAsync(cancellationToken);

        return new MemberDto(member.Id, member.FullName, member.Phone, member.Email, member.Notes, member.IsActive, member.CreatedAt, null, 0, null, null, null, null, null, null, member.MedicalConditions, member.UserId);
    }

    public async Task<MemberDto?> UpdateMemberAsync(int memberId, UpdateMemberDto dto, CancellationToken cancellationToken = default)
    {
        var member = await db.Members
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Package)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.Payments)
            .Include(m => m.Subscriptions)
                .ThenInclude(s => s.FreezeRecords)
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

        var activeSub = member.Subscriptions.FirstOrDefault(s => s.Status == "Active" || s.Status == "Frozen");
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
}
