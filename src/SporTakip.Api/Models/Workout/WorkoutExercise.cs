namespace SporTakip.Api.Models.Workout;

/// <summary>
/// Program şablonu içindeki egzersiz sırası ve set/tekrar hedefi.
/// Join tablosu: WorkoutTemplate ↔ Exercise (N:N, sıralı).
/// </summary>
public class WorkoutExercise
{
    public int Id { get; set; }
    
    public int WorkoutTemplateId { get; set; }
    public WorkoutTemplate WorkoutTemplate { get; set; } = null!;
    
    public int ExerciseId { get; set; }
    public Exercise Exercise { get; set; } = null!;
    
    /// <summary>Program içindeki sıra numarası (1, 2, 3...).</summary>
    public int OrderIndex { get; set; }
    
    /// <summary>Hedef set sayısı.</summary>
    public int TargetSets { get; set; } = 3;
    
    /// <summary>Hedef tekrar aralığı (örn: "8-12", "AMRAP").</summary>
    public string? TargetReps { get; set; }
    
    /// <summary>Setler arası dinlenme süresi (saniye).</summary>
    public int RestSeconds { get; set; } = 90;
    
    public string? Notes { get; set; } // "Tempo: 3-1-2"
}
