using SporTakip.Api.Models;

namespace SporTakip.Api.Models.Workout;

/// <summary>
/// Sporcunun belirli bir tarihte yaptığı antrenman oturumu.
/// Bir WorkoutTemplate'e bağlı olabilir veya serbest antrenman olarak kaydedilebilir.
/// </summary>
public class WorkoutLog
{
    public int Id { get; set; }
    
    public int MemberId { get; set; }
    public Member Member { get; set; } = null!;
    
    /// <summary>Null ise serbest (freestyle) antrenman.</summary>
    public int? WorkoutTemplateId { get; set; }
    public WorkoutTemplate? WorkoutTemplate { get; set; }
    
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    
    /// <summary>Toplam süre (dakika). CompletedAt set edildiğinde hesaplanır.</summary>
    public int? DurationMinutes { get; set; }
    
    public string? Notes { get; set; } // "Bugün ağırlıklar çok rahat geldi 💪"
    
    /// <summary>1-5 arası kişisel zorluk derecelendirmesi.</summary>
    public int? Rating { get; set; }
    
    // Navigation
    public ICollection<ExerciseLog> ExerciseLogs { get; set; } = [];
}
