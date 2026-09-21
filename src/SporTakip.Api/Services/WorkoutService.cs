using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Api.Services;

public class WorkoutService : IWorkoutService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<WorkoutService> _logger;

    public WorkoutService(ApplicationDbContext db, ILogger<WorkoutService> logger)
    {
        _db = db;
        _logger = logger;
    }

    #region Egzersiz Kataloğu

    public async Task<List<ExerciseDto>> GetExercisesAsync(string? muscleGroup = null, CancellationToken ct = default)
    {
        var query = _db.Exercises.AsNoTracking().Where(e => e.IsActive);

        if (!string.IsNullOrWhiteSpace(muscleGroup))
        {
            var mgLower = muscleGroup.Trim().ToLower();
            query = query.Where(e => e.MuscleGroup.ToLower() == mgLower);
        }

        var list = await query.OrderBy(e => e.Name).ToListAsync(ct);
        return list.Select(MapToExerciseDto).ToList();
    }

    public async Task<ExerciseDto?> GetExerciseByIdAsync(int id, CancellationToken ct = default)
    {
        var ex = await _db.Exercises.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);
        return ex == null ? null : MapToExerciseDto(ex);
    }

    #endregion

    #region Antrenör Şablon İşlemleri

    public async Task<WorkoutTemplateDto> CreateTemplateAsync(int trainerUserId, CreateWorkoutTemplateRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Şablon adı boş bırakılamaz.", nameof(request));

        var trainer = await _db.Trainers.FirstOrDefaultAsync(t => t.UserId == trainerUserId, ct);
        if (trainer == null)
        {
            // Eğer antrenör profili bulunamadıysa ilk aktif antrenörü al (Admin tarafından oluşturuluyorsa)
            trainer = await _db.Trainers.FirstOrDefaultAsync(t => t.IsActive, ct);
            if (trainer == null)
                throw new InvalidOperationException("Şablon atamak için geçerli bir antrenör kaydı bulunamadı.");
        }

        var template = new WorkoutTemplate
        {
            TrainerId = trainer.Id,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? "Strength" : request.Category.Trim(),
            EstimatedDurationMinutes = request.EstimatedDurationMinutes > 0 ? request.EstimatedDurationMinutes : 60,
            IsPublished = request.IsPublished,
            CreatedAt = DateTime.UtcNow
        };

        if (request.Exercises != null && request.Exercises.Count > 0)
        {
            foreach (var reqEx in request.Exercises)
            {
                template.Exercises.Add(new WorkoutExercise
                {
                    ExerciseId = reqEx.ExerciseId,
                    OrderIndex = reqEx.OrderIndex,
                    TargetSets = reqEx.TargetSets > 0 ? reqEx.TargetSets : 3,
                    TargetReps = string.IsNullOrWhiteSpace(reqEx.TargetReps) ? "8-12" : reqEx.TargetReps.Trim(),
                    RestSeconds = reqEx.RestSeconds > 0 ? reqEx.RestSeconds : 90,
                    Notes = reqEx.Notes?.Trim()
                });
            }
        }

        _db.WorkoutTemplates.Add(template);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Yeni antrenman şablonu oluşturuldu: Id={Id}, Ad={Name}, EgzersizSayısı={Count}",
            template.Id, template.Name, template.Exercises.Count);

        return await GetTemplateByIdAsync(template.Id, ct)
               ?? throw new InvalidOperationException("Oluşturulan şablon yüklenemedi.");
    }

    public async Task<List<WorkoutTemplateDto>> GetTemplatesAsync(bool onlyPublished = true, CancellationToken ct = default)
    {
        var query = _db.WorkoutTemplates
            .AsNoTracking()
            .Include(t => t.Trainer)
            .Include(t => t.Exercises)
                .ThenInclude(we => we.Exercise)
            .AsQueryable();

        if (onlyPublished)
            query = query.Where(t => t.IsPublished);

        var list = await query.OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        return list.Select(MapToTemplateDto).ToList();
    }

    public async Task<WorkoutTemplateDto?> GetTemplateByIdAsync(int templateId, CancellationToken ct = default)
    {
        var template = await _db.WorkoutTemplates
            .AsNoTracking()
            .Include(t => t.Trainer)
            .Include(t => t.Exercises)
                .ThenInclude(we => we.Exercise)
            .FirstOrDefaultAsync(t => t.Id == templateId, ct);

        return template == null ? null : MapToTemplateDto(template);
    }

    #endregion

    #region Sporcu Canlı İdman İşlemleri (Hevy / Nike Training Mantığı)

    public async Task<WorkoutLogDto> StartWorkoutAsync(int athleteUserId, StartWorkoutRequest request, CancellationToken ct = default)
    {
        var member = await _db.Members.FirstOrDefaultAsync(m => m.UserId == athleteUserId, ct);
        if (member == null)
            throw new KeyNotFoundException("Giriş yapan kullanıcıya ait aktif sporcu profili bulunamadı.");

        var workoutLog = new WorkoutLog
        {
            MemberId = member.Id,
            WorkoutTemplateId = request.WorkoutTemplateId,
            StartedAt = DateTime.UtcNow,
            Notes = request.Notes?.Trim()
        };

        // Eğer bir şablondan başlatıldıysa şablondaki egzersizleri kopyala ve BOŞ SETLERİ otomatik türet (Pre-allocation)
        if (request.WorkoutTemplateId.HasValue)
        {
            var template = await _db.WorkoutTemplates
                .Include(t => t.Exercises)
                    .ThenInclude(we => we.Exercise)
                .FirstOrDefaultAsync(t => t.Id == request.WorkoutTemplateId.Value, ct);

            if (template != null)
            {
                foreach (var we in template.Exercises.OrderBy(e => e.OrderIndex))
                {
                    var exerciseLog = new ExerciseLog
                    {
                        ExerciseId = we.ExerciseId,
                        OrderIndex = we.OrderIndex,
                        Notes = we.Notes
                    };

                    int targetSets = Math.Clamp(we.TargetSets, 1, 20);
                    for (int s = 1; s <= targetSets; s++)
                    {
                        exerciseLog.Sets.Add(new SetLog
                        {
                            SetNumber = s,
                            WeightKg = null,
                            Reps = null,
                            DurationSeconds = null,
                            DistanceMeters = null,
                            SetType = "Normal",
                            IsCompleted = false
                        });
                    }

                    workoutLog.ExerciseLogs.Add(exerciseLog);
                }
            }
        }

        _db.WorkoutLogs.Add(workoutLog);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Canlı idman başlatıldı: WorkoutLogId={Id}, Sporcu={MemberId}, Şablon={TemplateId}",
            workoutLog.Id, member.Id, request.WorkoutTemplateId);

        return await GetWorkoutLogByIdAsync(athleteUserId, workoutLog.Id, ct)
               ?? throw new InvalidOperationException("Başlatılan idman oturumu yüklenemedi.");
    }

    public async Task<SetLogDto> UpdateSetAsync(int athleteUserId, int setLogId, UpdateSetRequest request, CancellationToken ct = default)
    {
        var setLog = await _db.SetLogs
            .Include(s => s.ExerciseLog)
                .ThenInclude(el => el.WorkoutLog)
                    .ThenInclude(wl => wl.Member)
            .FirstOrDefaultAsync(s => s.Id == setLogId, ct);

        if (setLog == null)
            throw new KeyNotFoundException($"Set kaydı bulunamadı: Id={setLogId}");

        var workoutMemberUserId = setLog.ExerciseLog.WorkoutLog.Member.UserId;
        if (workoutMemberUserId != null && workoutMemberUserId != athleteUserId)
        {
            // Kullanıcı yetkisi kontrolü
            throw new UnauthorizedAccessException("Bu set kaydını güncelleme yetkiniz bulunmuyor.");
        }

        // Değerleri güncelle
        setLog.WeightKg = request.WeightKg;
        setLog.Reps = request.Reps;
        setLog.DurationSeconds = request.DurationSeconds;
        setLog.DistanceMeters = request.DistanceMeters;
        setLog.SetType = string.IsNullOrWhiteSpace(request.SetType) ? "Normal" : request.SetType.Trim();
        setLog.IsCompleted = request.IsCompleted;
        setLog.Notes = request.Notes?.Trim();

        await _db.SaveChangesAsync(ct);

        return new SetLogDto(
            setLog.Id,
            setLog.ExerciseLogId,
            setLog.SetNumber,
            setLog.WeightKg,
            setLog.Reps,
            setLog.DurationSeconds,
            setLog.DistanceMeters,
            setLog.SetType,
            setLog.IsCompleted,
            setLog.Notes,
            CalculateOneRepMax(setLog.WeightKg, setLog.Reps)
        );
    }

    public async Task<WorkoutLogDto> FinishWorkoutAsync(int athleteUserId, int workoutLogId, FinishWorkoutRequest request, CancellationToken ct = default)
    {
        var workout = await _db.WorkoutLogs
            .Include(wl => wl.Member)
            .Include(wl => wl.ExerciseLogs)
                .ThenInclude(el => el.Sets)
            .Include(wl => wl.ExerciseLogs)
                .ThenInclude(el => el.Exercise)
            .Include(wl => wl.WorkoutTemplate)
            .FirstOrDefaultAsync(wl => wl.Id == workoutLogId, ct);

        if (workout == null)
            throw new KeyNotFoundException($"İdman oturumu bulunamadı: Id={workoutLogId}");

        if (workout.Member.UserId != null && workout.Member.UserId != athleteUserId)
            throw new UnauthorizedAccessException("Bu idman oturumunu tamamlama yetkiniz bulunmuyor.");

        workout.CompletedAt = DateTime.UtcNow;
        var diff = workout.CompletedAt.Value - workout.StartedAt;
        workout.DurationMinutes = Math.Max(1, (int)Math.Round(diff.TotalMinutes));

        if (request.Rating.HasValue)
            workout.Rating = Math.Clamp(request.Rating.Value, 1, 5);

        if (!string.IsNullOrWhiteSpace(request.Notes))
        {
            workout.Notes = string.IsNullOrWhiteSpace(workout.Notes)
                ? request.Notes.Trim()
                : $"{workout.Notes} | {request.Notes.Trim()}";
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("İdman tamamlandı: WorkoutLogId={Id}, Süre={Min}dk, Rating={Rating}",
            workout.Id, workout.DurationMinutes, workout.Rating);

        return MapToWorkoutLogDto(workout);
    }

    public async Task<WorkoutLogDto?> GetWorkoutLogByIdAsync(int userId, int workoutLogId, CancellationToken ct = default)
    {
        var workout = await _db.WorkoutLogs
            .AsNoTracking()
            .Include(wl => wl.Member)
            .Include(wl => wl.WorkoutTemplate)
            .Include(wl => wl.ExerciseLogs)
                .ThenInclude(el => el.Exercise)
            .Include(wl => wl.ExerciseLogs)
                .ThenInclude(el => el.Sets)
            .FirstOrDefaultAsync(wl => wl.Id == workoutLogId, ct);

        if (workout == null)
            return null;

        return MapToWorkoutLogDto(workout);
    }

    public async Task<List<WorkoutLogDto>> GetMemberWorkoutHistoryAsync(int athleteUserId, int take = 20, CancellationToken ct = default)
    {
        var member = await _db.Members.FirstOrDefaultAsync(m => m.UserId == athleteUserId, ct);
        if (member == null)
            return [];

        var list = await _db.WorkoutLogs
            .AsNoTracking()
            .Include(wl => wl.Member)
            .Include(wl => wl.WorkoutTemplate)
            .Include(wl => wl.ExerciseLogs)
                .ThenInclude(el => el.Exercise)
            .Include(wl => wl.ExerciseLogs)
                .ThenInclude(el => el.Sets)
            .Where(wl => wl.MemberId == member.Id)
            .OrderByDescending(wl => wl.StartedAt)
            .Take(take)
            .ToListAsync(ct);

        return list.Select(MapToWorkoutLogDto).ToList();
    }

    #endregion

    #region Progressive Overload & 1RM Gelişim Takibi

    public async Task<ExerciseProgressDto> GetExerciseProgressAsync(int athleteUserId, int exerciseId, CancellationToken ct = default)
    {
        var exercise = await _db.Exercises.AsNoTracking().FirstOrDefaultAsync(e => e.Id == exerciseId, ct);
        if (exercise == null)
            throw new KeyNotFoundException($"Egzersiz bulunamadı: Id={exerciseId}");

        var member = await _db.Members.FirstOrDefaultAsync(m => m.UserId == athleteUserId, ct);
        if (member == null)
            throw new KeyNotFoundException("Aktif sporcu profili bulunamadı.");

        // Tamamlanmış ve verisi girilmiş setleri en yeni tarihten eskiye doğru çek
        var completedSets = await _db.SetLogs
            .AsNoTracking()
            .Include(sl => sl.ExerciseLog)
                .ThenInclude(el => el.WorkoutLog)
            .Where(sl => sl.ExerciseLog.ExerciseId == exerciseId &&
                         sl.ExerciseLog.WorkoutLog.MemberId == member.Id &&
                         sl.IsCompleted &&
                         (sl.WeightKg != null || sl.Reps != null || sl.DurationSeconds != null))
            .OrderByDescending(sl => sl.ExerciseLog.WorkoutLog.StartedAt)
            .ThenBy(sl => sl.SetNumber)
            .ToListAsync(ct);

        var history = new List<ExerciseHistoryRecordDto>();
        decimal? maxWeight = null;
        int? bestRepsAtMaxWeight = null;
        decimal? best1Rm = null;

        foreach (var set in completedSets)
        {
            var e1rm = CalculateOneRepMax(set.WeightKg, set.Reps);

            if (set.WeightKg.HasValue)
            {
                if (maxWeight == null || set.WeightKg.Value > maxWeight.Value)
                {
                    maxWeight = set.WeightKg.Value;
                    bestRepsAtMaxWeight = set.Reps;
                }
                else if (set.WeightKg.Value == maxWeight.Value && (set.Reps ?? 0) > (bestRepsAtMaxWeight ?? 0))
                {
                    bestRepsAtMaxWeight = set.Reps;
                }
            }

            if (e1rm.HasValue && (best1Rm == null || e1rm.Value > best1Rm.Value))
            {
                best1Rm = e1rm.Value;
            }

            history.Add(new ExerciseHistoryRecordDto(
                set.ExerciseLog.WorkoutLogId,
                set.ExerciseLog.WorkoutLog.StartedAt,
                set.SetNumber,
                set.WeightKg,
                set.Reps,
                set.DurationSeconds,
                set.SetType,
                e1rm,
                set.Notes
            ));
        }

        return new ExerciseProgressDto(
            exercise.Id,
            exercise.Name,
            exercise.NameTr,
            exercise.MuscleGroup,
            maxWeight,
            bestRepsAtMaxWeight,
            best1Rm,
            history
        );
    }

    #endregion

    #region Yardımcı Metotlar

    public static decimal? CalculateOneRepMax(decimal? weightKg, int? reps)
    {
        if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0)
            return null;

        if (reps == 1)
            return Math.Round(weightKg.Value, 1);

        // Standart Epley Formülü: Weight * (1 + Reps / 30)
        var epley = weightKg.Value * (1m + ((decimal)reps.Value / 30m));
        return Math.Round(epley, 1);
    }

    private static ExerciseDto MapToExerciseDto(Exercise e) =>
        new(e.Id, e.Name, e.NameTr, e.MuscleGroup, e.Equipment, e.Instructions, e.ImageUrl, e.VideoUrl);

    private static WorkoutTemplateDto MapToTemplateDto(WorkoutTemplate t) =>
        new(
            t.Id,
            t.TrainerId,
            t.Trainer?.FullName ?? "Antrenör",
            t.Name,
            t.Description,
            t.Category,
            t.EstimatedDurationMinutes,
            t.IsPublished,
            t.CreatedAt,
            t.Exercises
                .OrderBy(e => e.OrderIndex)
                .Select(e => new WorkoutExerciseDto(
                    e.Id,
                    e.ExerciseId,
                    e.Exercise?.Name ?? string.Empty,
                    e.Exercise?.NameTr,
                    e.Exercise?.MuscleGroup ?? "FullBody",
                    e.Exercise?.Equipment,
                    e.OrderIndex,
                    e.TargetSets,
                    e.TargetReps,
                    e.RestSeconds,
                    e.Notes
                ))
                .ToList()
        );

    private static WorkoutLogDto MapToWorkoutLogDto(WorkoutLog log) =>
        new(
            log.Id,
            log.MemberId,
            log.Member?.FullName ?? "Sporcu",
            log.WorkoutTemplateId,
            log.WorkoutTemplate?.Name,
            log.StartedAt,
            log.CompletedAt,
            log.DurationMinutes,
            log.Rating,
            log.Notes,
            log.ExerciseLogs
                .OrderBy(el => el.OrderIndex)
                .Select(el => new ExerciseLogDto(
                    el.Id,
                    el.WorkoutLogId,
                    el.ExerciseId,
                    el.Exercise?.Name ?? string.Empty,
                    el.Exercise?.NameTr,
                    el.Exercise?.MuscleGroup ?? "FullBody",
                    el.Exercise?.Equipment,
                    el.OrderIndex,
                    el.Notes,
                    el.Sets
                        .OrderBy(s => s.SetNumber)
                        .Select(s => new SetLogDto(
                            s.Id,
                            s.ExerciseLogId,
                            s.SetNumber,
                            s.WeightKg,
                            s.Reps,
                            s.DurationSeconds,
                            s.DistanceMeters,
                            s.SetType,
                            s.IsCompleted,
                            s.Notes,
                            CalculateOneRepMax(s.WeightKg, s.Reps)
                        ))
                        .ToList()
                ))
                .ToList()
        );

    #endregion
}
