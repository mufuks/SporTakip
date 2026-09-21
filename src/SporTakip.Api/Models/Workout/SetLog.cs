namespace SporTakip.Api.Models.Workout;

/// <summary>
/// Bir egzersiz logundaki tekil set kaydı.
/// Sporcu tarafından canlı olarak (antrenman esnasında) girilir.
/// </summary>
public class SetLog
{
    public int Id { get; set; }
    
    public int ExerciseLogId { get; set; }
    public ExerciseLog ExerciseLog { get; set; } = null!;
    
    /// <summary>Set numarası (1, 2, 3...).</summary>
    public int SetNumber { get; set; }
    
    /// <summary>Kaldırılan ağırlık (kg). Bodyweight için null.</summary>
    public decimal? WeightKg { get; set; }
    
    /// <summary>Yapılan tekrar sayısı.</summary>
    public int? Reps { get; set; }
    
    /// <summary>Süre bazlı egzersizler için (saniye, örn: Plank 60sn).</summary>
    public int? DurationSeconds { get; set; }
    
    /// <summary>Setler arası mesafe (metre, örn: Farmer Walk 40m).</summary>
    public decimal? DistanceMeters { get; set; }
    
    /// <summary>Normal, Warmup, Dropset, Failure</summary>
    public string SetType { get; set; } = "Normal";
    
    public bool IsCompleted { get; set; } = false;
    public string? Notes { get; set; }
}
