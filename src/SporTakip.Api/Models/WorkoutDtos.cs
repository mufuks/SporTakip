namespace SporTakip.Api.Models;

/// <summary>
/// Egzersiz kütüphanesi görünüm DTO'su.
/// </summary>
public record ExerciseDto(
    int Id,
    string Name,
    string? NameTr,
    string MuscleGroup,
    string? Equipment,
    string? Instructions,
    string? ImageUrl,
    string? VideoUrl
);

/// <summary>
/// Antrenör tarafından yeni şablon oluşturma isteği.
/// </summary>
public record CreateWorkoutTemplateRequest(
    string Name,
    string? Description = null,
    string Category = "Strength",
    int EstimatedDurationMinutes = 60,
    bool IsPublished = true,
    List<CreateWorkoutTemplateExerciseRequest>? Exercises = null
);

/// <summary>
/// Şablon içi egzersiz ve hedef set/tekrar tanımlama isteği.
/// </summary>
public record CreateWorkoutTemplateExerciseRequest(
    int ExerciseId,
    int OrderIndex,
    int TargetSets = 3,
    string? TargetReps = "8-12",
    int RestSeconds = 90,
    string? Notes = null
);

/// <summary>
/// Şablon içi egzersiz görünüm DTO'su.
/// </summary>
public record WorkoutExerciseDto(
    int Id,
    int ExerciseId,
    string ExerciseName,
    string? ExerciseNameTr,
    string MuscleGroup,
    string? Equipment,
    int OrderIndex,
    int TargetSets,
    string? TargetReps,
    int RestSeconds,
    string? Notes
);

/// <summary>
/// Antrenman şablonu detay DTO'su.
/// </summary>
public record WorkoutTemplateDto(
    int Id,
    int TrainerId,
    string TrainerName,
    string Name,
    string? Description,
    string Category,
    int EstimatedDurationMinutes,
    bool IsPublished,
    DateTime CreatedAt,
    List<WorkoutExerciseDto> Exercises
);

/// <summary>
/// Canlı idman başlatma isteği.
/// TemplateId belirtilirse şablondaki egzersizler ve hedef set kadar boş SetLog satırları oluşturulur.
/// </summary>
public record StartWorkoutRequest(
    int? WorkoutTemplateId,
    string? Notes = null
);

/// <summary>
/// Tekil set tamamlama / güncelleme isteği (Canlı loglama).
/// </summary>
public record UpdateSetRequest(
    decimal? WeightKg,
    int? Reps,
    int? DurationSeconds,
    decimal? DistanceMeters,
    string SetType = "Normal",
    bool IsCompleted = true,
    string? Notes = null
);

/// <summary>
/// Canlı idman tamamlama isteği.
/// </summary>
public record FinishWorkoutRequest(
    int? Rating, // 1 - 5
    string? Notes
);

/// <summary>
/// Tekil set logu görünüm DTO'su.
/// </summary>
public record SetLogDto(
    int Id,
    int ExerciseLogId,
    int SetNumber,
    decimal? WeightKg,
    int? Reps,
    int? DurationSeconds,
    decimal? DistanceMeters,
    string SetType,
    bool IsCompleted,
    string? Notes,
    decimal? EstimatedOneRepMax
);

/// <summary>
/// Bir idmandaki tekil egzersiz ve setleri DTO'su.
/// </summary>
public record ExerciseLogDto(
    int Id,
    int WorkoutLogId,
    int ExerciseId,
    string ExerciseName,
    string? ExerciseNameTr,
    string MuscleGroup,
    string? Equipment,
    int OrderIndex,
    string? Notes,
    List<SetLogDto> Sets
);

/// <summary>
/// Antrenman oturumu genel detay DTO'su (Hiyerarşik: Oturum -> Egzersizler -> Setler).
/// </summary>
public record WorkoutLogDto(
    int Id,
    int MemberId,
    string MemberName,
    int? WorkoutTemplateId,
    string? TemplateName,
    DateTime StartedAt,
    DateTime? CompletedAt,
    int? DurationMinutes,
    int? Rating,
    string? Notes,
    List<ExerciseLogDto> ExerciseLogs
);

/// <summary>
/// Geçmiş bir setin gelişim kaydı (Progressive overload).
/// </summary>
public record ExerciseHistoryRecordDto(
    int WorkoutLogId,
    DateTime WorkoutDate,
    int SetNumber,
    decimal? WeightKg,
    int? Reps,
    int? DurationSeconds,
    string SetType,
    decimal? EstimatedOneRepMax,
    string? Notes
);

/// <summary>
/// Bir egzersiz için sporcunun kişisel rekorları ve gelişim geçmişi.
/// </summary>
public record ExerciseProgressDto(
    int ExerciseId,
    string ExerciseName,
    string? ExerciseNameTr,
    string MuscleGroup,
    decimal? PersonalRecordWeightKg,
    int? BestRepsAtPr,
    decimal? BestEstimatedOneRepMax,
    List<ExerciseHistoryRecordDto> History
);
