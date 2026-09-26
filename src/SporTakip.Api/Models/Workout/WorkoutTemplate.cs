using SporTakip.Api.Models;

namespace SporTakip.Api.Models.Workout;

/// <summary>
/// Antrenör tarafından hazırlanan program şablonu.
/// Bir antrenör birden fazla template oluşturabilir (Bacak Günü, Üst Vücut, Kardiyo vb.).
/// </summary>
public class WorkoutTemplate
{
    public int Id { get; set; }
    
    public int TrainerId { get; set; }
    public Trainer Trainer { get; set; } = null!;
    
    public string Name { get; set; } = string.Empty;       // "Bacak & Core Güç Programı"
    public string? Description { get; set; }
    
    /// <summary>Strength, HIIT, Mobility, Cardio, Mixed</summary>
    public string Category { get; set; } = "Strength";
    
    /// <summary>Tahmini süre (dakika).</summary>
    public int EstimatedDurationMinutes { get; set; } = 60;
    
    public bool IsPublished { get; set; } = false;
    
    /// <summary>
    /// Eğer null ise tüm salon üyelerine açık genel şablondur.
    /// Eğer belirli bir MemberId set edilmişse yalnızca o sporcuya özel atanmış kişisel programdır.
    /// </summary>
    public int? AssignedMemberId { get; set; }
    public Member? AssignedMember { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    
    // Navigation
    public ICollection<WorkoutExercise> Exercises { get; set; } = [];
    public ICollection<WorkoutLog> WorkoutLogs { get; set; } = [];
}
