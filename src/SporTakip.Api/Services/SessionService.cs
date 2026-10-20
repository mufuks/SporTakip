using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Api.Services;

public class SessionService(
    ApplicationDbContext db,
    ILogger<SessionService> logger) : ISessionService
{
    public async Task<SessionSlotDto> CreateSlotAsync(int trainerOrAdminUserId, CreateSessionSlotRequest request, CancellationToken ct = default)
    {
        if (request.EndTime <= request.StartTime)
        {
            throw new ArgumentException("Bitiş saati başlangıç saatinden sonra olmalıdır.");
        }

        var duration = request.EndTime - request.StartTime;
        if (duration.TotalMinutes < 15 || duration.TotalHours > 6)
        {
            throw new ArgumentException("Seans süresi en az 15 dakika, en fazla 6 saat olabilir.");
        }

        if (request.Capacity < 1 || request.Capacity > 30)
        {
            throw new ArgumentException("Kapasite kontenjanı 1 ile 30 kişi arasında olmalıdır.");
        }

        Trainer? trainer = null;
        if (request.TrainerId.HasValue)
        {
            trainer = await db.Trainers.FindAsync([request.TrainerId.Value], ct);
        }
        else
        {
            trainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == trainerOrAdminUserId, ct);
        }

        if (trainer == null)
        {
            // Eğer hoca profili yoksa sistemdeki ilk antrenörü veya salon sahibini seç
            trainer = await db.Trainers.FirstOrDefaultAsync(ct)
                ?? throw new InvalidOperationException("Slot oluşturmak için geçerli bir antrenör bulunamadı.");
        }

        // Antrenör Çakışma Kontrolü (Trainer Double-Booking Prevention)
        var conflict = await db.SessionSlots
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TrainerId == trainer.Id 
                && s.Status != "Cancelled" 
                && s.StartTime < request.EndTime 
                && s.EndTime > request.StartTime, ct);

        if (conflict != null)
        {
            throw new InvalidOperationException(
                $"Seçilen antrenörün ({trainer.FullName}) bu zaman diliminde ({conflict.StartTime:HH:mm} - {conflict.EndTime:HH:mm}) '{conflict.Title ?? "Seans"}' başlıklı başka bir aktif seansı bulunmaktadır.");
        }

        WorkoutTemplate? workoutTemplate = null;
        if (request.WorkoutTemplateId.HasValue && request.WorkoutTemplateId.Value > 0)
        {
            workoutTemplate = await db.WorkoutTemplates
                .Include(w => w.Exercises)
                .FirstOrDefaultAsync(w => w.Id == request.WorkoutTemplateId.Value, ct);
        }

        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Capacity = request.Capacity > 0 ? request.Capacity : 6,
            SessionType = string.IsNullOrWhiteSpace(request.SessionType) ? "GRUP" : request.SessionType,
            Title = request.Title,
            Notes = request.Notes,
            Status = "Open",
            WorkoutTemplateId = workoutTemplate?.Id,
            WorkoutTemplate = workoutTemplate,
            CreatedAt = DateTime.UtcNow
        };

        db.SessionSlots.Add(slot);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("📅 [SESSION CREATED] Slot #{SlotId}: {TrainerName} | {StartTime:yyyy-MM-dd HH:mm} - {EndTime:HH:mm} (Kapasite: {Capacity})",
            slot.Id, trainer.FullName, slot.StartTime, slot.EndTime, slot.Capacity);

        return MapToDto(slot, trainer.FullName);
    }

    public async Task<List<SessionSlotDto>> GetSlotsAsync(DateTime startDate, DateTime endDate, int? trainerId = null, CancellationToken ct = default)
    {
        var query = db.SessionSlots
            .AsNoTracking()
            .Include(s => s.Trainer)
            .Include(s => s.WorkoutTemplate)
                .ThenInclude(w => w!.Exercises)
            .Include(s => s.Reservations)
                .ThenInclude(r => r.Member)
            .Where(s => s.StartTime >= startDate && s.StartTime <= endDate);

        if (trainerId.HasValue)
        {
            query = query.Where(s => s.TrainerId == trainerId.Value);
        }

        var slots = await query.OrderBy(s => s.StartTime).ToListAsync(ct);
        return slots.Select(s => MapToDto(s, s.Trainer.FullName)).ToList();
    }

    public async Task<SessionSlotDto?> GetSlotByIdAsync(int slotId, CancellationToken ct = default)
    {
        var slot = await db.SessionSlots
            .AsNoTracking()
            .Include(s => s.Trainer)
            .Include(s => s.WorkoutTemplate)
                .ThenInclude(w => w!.Exercises)
            .Include(s => s.Reservations)
                .ThenInclude(r => r.Member)
            .FirstOrDefaultAsync(s => s.Id == slotId, ct);

        if (slot == null) return null;

        return MapToDto(slot, slot.Trainer.FullName);
    }

    public async Task<SessionSlotDto> UpdateSlotAsync(int trainerOrAdminUserId, int slotId, UpdateSessionSlotRequest request, CancellationToken ct = default)
    {
        var slot = await db.SessionSlots
            .Include(s => s.Trainer)
            .Include(s => s.WorkoutTemplate)
                .ThenInclude(w => w!.Exercises)
            .Include(s => s.Reservations)
                .ThenInclude(r => r.Member)
            .FirstOrDefaultAsync(s => s.Id == slotId, ct)
            ?? throw new KeyNotFoundException("Seans bulunamadı.");

        var targetStartTime = request.StartTime ?? slot.StartTime;
        var targetEndTime = request.EndTime ?? (request.StartTime.HasValue && slot.EndTime <= request.StartTime.Value 
            ? request.StartTime.Value.AddHours(1) 
            : slot.EndTime);

        if (targetEndTime <= targetStartTime)
        {
            throw new ArgumentException("Bitiş saati başlangıç saatinden sonra olmalıdır.");
        }

        var duration = targetEndTime - targetStartTime;
        if (duration.TotalMinutes < 15 || duration.TotalHours > 6)
        {
            throw new ArgumentException("Seans süresi en az 15 dakika, en fazla 6 saat olabilir.");
        }

        var targetTrainerId = request.TrainerId ?? slot.TrainerId;
        var targetStatus = request.Status ?? slot.Status;

        // 1. Kapasite ve Mevcut Kayıt Kontrolü (Capacity Sanity Check)
        if (request.Capacity.HasValue)
        {
            if (request.Capacity.Value < 1 || request.Capacity.Value > 30)
            {
                throw new ArgumentException("Kapasite kontenjanı 1 ile 30 kişi arasında olmalıdır.");
            }

            var activeReservationsCount = slot.Reservations.Count(r => r.Status == "Confirmed" || r.Status == "CheckedIn");
            if (request.Capacity.Value < activeReservationsCount)
            {
                throw new InvalidOperationException(
                    $"Kapasite ({request.Capacity.Value}), şu anda seansa kayıtlı aktif sporcu sayısından ({activeReservationsCount}) daha az olamaz.");
            }
            slot.Capacity = request.Capacity.Value;
        }

        // 2. Antrenör Çakışma Kontrolü (Trainer Double-Booking Prevention)
        if (targetStatus != "Cancelled")
        {
            var conflict = await db.SessionSlots
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id != slotId 
                    && s.TrainerId == targetTrainerId 
                    && s.Status != "Cancelled" 
                    && s.StartTime < targetEndTime 
                    && s.EndTime > targetStartTime, ct);

            if (conflict != null)
            {
                var trainer = await db.Trainers.FindAsync([targetTrainerId], ct);
                throw new InvalidOperationException(
                    $"Seçilen antrenörün ({trainer?.FullName ?? "Hoca"}) bu zaman diliminde ({conflict.StartTime:HH:mm} - {conflict.EndTime:HH:mm}) '{conflict.Title ?? "Seans"}' başlıklı başka bir aktif seansı bulunmaktadır.");
            }
        }

        slot.StartTime = targetStartTime;
        slot.EndTime = targetEndTime;

        if (request.TrainerId.HasValue && request.TrainerId.Value != slot.TrainerId)
        {
            var trainer = await db.Trainers.FindAsync([request.TrainerId.Value], ct)
                ?? throw new ArgumentException("Seçilen antrenör bulunamadı.");
            slot.TrainerId = trainer.Id;
            slot.Trainer = trainer;
        }

        if (!string.IsNullOrWhiteSpace(request.SessionType))
        {
            slot.SessionType = request.SessionType;
        }

        if (request.Title != null)
        {
            slot.Title = request.Title;
        }

        if (request.Notes != null)
        {
            slot.Notes = request.Notes;
        }

        if (request.WorkoutTemplateId.HasValue)
        {
            if (request.WorkoutTemplateId.Value <= 0)
            {
                slot.WorkoutTemplateId = null;
                slot.WorkoutTemplate = null;
            }
            else
            {
                var template = await db.WorkoutTemplates
                    .Include(w => w.Exercises)
                    .FirstOrDefaultAsync(w => w.Id == request.WorkoutTemplateId.Value, ct)
                    ?? throw new ArgumentException("Seçilen antrenman programı şablonu bulunamadı.");
                slot.WorkoutTemplateId = template.Id;
                slot.WorkoutTemplate = template;
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            slot.Status = request.Status;
            if (request.Status == "Cancelled")
            {
                foreach (var res in slot.Reservations.Where(r => r.Status == "Confirmed" || r.Status == "Waitlisted"))
                {
                    res.Status = "CancelledByCoach";
                    res.CancellationReason = "Seans antrenör tarafından iptal edildi.";
                    res.CancelledAt = DateTime.UtcNow;
                }
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("✏️ [SESSION UPDATED] Slot #{SlotId}: {TrainerName} | {StartTime:yyyy-MM-dd HH:mm} - {EndTime:HH:mm} (Kapasite: {Capacity}, Durum: {Status})",
            slot.Id, slot.Trainer.FullName, slot.StartTime, slot.EndTime, slot.Capacity, slot.Status);

        return MapToDto(slot, slot.Trainer.FullName);
    }

    public async Task<bool> CancelSlotAsync(int trainerOrAdminUserId, int slotId, CancellationToken ct = default)
    {
        var slot = await db.SessionSlots
            .Include(s => s.Reservations)
            .FirstOrDefaultAsync(s => s.Id == slotId, ct);

        if (slot == null) return false;

        slot.Status = "Cancelled";

        foreach (var res in slot.Reservations.Where(r => r.Status == "Confirmed" || r.Status == "Waitlisted"))
        {
            res.Status = "CancelledByCoach";
            res.CancellationReason = "Seans antrenör tarafından iptal edildi.";
            res.CancelledAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("❌ [SESSION CANCELLED] Slot #{SlotId} antrenör/admin tarafından iptal edildi.", slotId);
        return true;
    }

    // ── Helper Metotlar ──

    private static SessionSlotDto MapToDto(SessionSlot slot, string trainerName)
    {
        var confirmedCount = slot.Reservations.Count(r => r.Status == "Confirmed" || r.Status == "CheckedIn");
        var waitlistCount = slot.Reservations.Count(r => r.Status == "Waitlisted");
        var remainingCapacity = Math.Max(0, slot.Capacity - confirmedCount);

        var capacityStatus = confirmedCount switch
        {
            <= 3 => "Comfortable", // 🟢 Rahat (0-3 kişi)
            <= 5 => "Filling",     // 🟡 Doluyor (4-5 kişi)
            _    => "Critical"     // 🔴 Kritik Dolu (6+ kişi)
        };

        var reservationDtos = slot.Reservations
            .OrderBy(r => r.WaitlistPosition)
            .ThenBy(r => r.CreatedAt)
            .Select(r => new ReservationSummaryDto(
                r.Id,
                r.MemberId,
                r.Member?.FullName ?? "Bilinmeyen Sporcu",
                r.Member?.Phone,
                r.Status,
                r.WaitlistPosition,
                r.CreatedAt
            ))
            .ToList();

        return new SessionSlotDto(
            slot.Id,
            slot.TrainerId,
            trainerName,
            slot.StartTime,
            slot.EndTime,
            slot.Capacity,
            confirmedCount,
            waitlistCount,
            remainingCapacity,
            capacityStatus,
            slot.SessionType,
            slot.Title,
            slot.Notes,
            slot.Status,
            reservationDtos,
            slot.WorkoutTemplateId,
            slot.WorkoutTemplate?.Name,
            slot.WorkoutTemplate?.Category,
            slot.WorkoutTemplate?.EstimatedDurationMinutes,
            slot.WorkoutTemplate?.Exercises?.Count
        );
    }
}
