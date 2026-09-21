namespace SporTakip.Api.Models.Workout;

/// <summary>Bir antrenman oturumundaki tek bir egzersizin kaydı.</summary>
public class ExerciseLog
{
    public int Id { get; set; }
    
    public int WorkoutLogId { get; set; }
    public WorkoutLog WorkoutLog { get; set; } = null!;
    
    public int ExerciseId { get; set; }
    public Exercise Exercise { get; set; } = null!;
    
    /// <summary>Oturum içindeki sıra numarası.</summary>
    public int OrderIndex { get; set; }
    
    public string? Notes { get; set; }
    
    // Navigation
    public ICollection<SetLog> Sets { get; set; } = [];
}
