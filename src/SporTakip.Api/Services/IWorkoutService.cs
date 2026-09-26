using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public interface IWorkoutService
{
    // Egzersiz Kataloğu
    Task<List<ExerciseDto>> GetExercisesAsync(string? muscleGroup = null, CancellationToken ct = default);
    Task<ExerciseDto?> GetExerciseByIdAsync(int id, CancellationToken ct = default);
    Task<ExerciseDto> CreateExerciseAsync(CreateExerciseRequest request, CancellationToken ct = default);
    Task<ExerciseDto> UpdateExerciseAsync(int id, UpdateExerciseRequest request, CancellationToken ct = default);
    Task<bool> DeleteExerciseAsync(int id, CancellationToken ct = default);

    // Antrenör Şablon İşlemleri
    Task<WorkoutTemplateDto> CreateTemplateAsync(int trainerUserId, CreateWorkoutTemplateRequest request, CancellationToken ct = default);
    Task<List<WorkoutTemplateDto>> GetTemplatesAsync(bool onlyPublished = true, int? athleteUserId = null, CancellationToken ct = default);
    Task<WorkoutTemplateDto?> GetTemplateByIdAsync(int templateId, CancellationToken ct = default);

    // Sporcu Canlı İdman İşlemleri
    Task<WorkoutLogDto> StartWorkoutAsync(int athleteUserId, StartWorkoutRequest request, CancellationToken ct = default);
    Task<SetLogDto> UpdateSetAsync(int athleteUserId, int setLogId, UpdateSetRequest request, CancellationToken ct = default);
    Task<WorkoutLogDto> FinishWorkoutAsync(int athleteUserId, int workoutLogId, FinishWorkoutRequest request, CancellationToken ct = default);
    Task<WorkoutLogDto?> GetWorkoutLogByIdAsync(int userId, int workoutLogId, CancellationToken ct = default);
    Task<List<WorkoutLogDto>> GetMemberWorkoutHistoryAsync(int athleteUserId, int take = 20, CancellationToken ct = default);

    // Progressive Overload & 1RM & Ghost Weight
    Task<ExerciseProgressDto> GetExerciseProgressAsync(int athleteUserId, int exerciseId, CancellationToken ct = default);
    Task<ExercisePerformanceDto?> GetLastExercisePerformanceAsync(int athleteUserId, int exerciseId, CancellationToken ct = default);
}
