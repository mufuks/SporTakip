namespace SporTakip.Api.Models.Workout;

/// <summary>
/// Evrensel egzersiz kataloğu. Antrenörler ve sporcular tarafından paylaşılan
/// master veri. Hevy/Nike Training benzeri egzersiz kütüphanesi.
/// </summary>
public class Exercise
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;           // "Barbell Squat"
    public string? NameTr { get; set; }                         // "Barbell Squat (Çömelme)"
    
    /// <summary>Kas grubu: Chest, Back, Legs, Shoulders, Arms, Core, Cardio, FullBody</summary>
    public string MuscleGroup { get; set; } = "FullBody";
    
    /// <summary>Ekipman: Barbell, Dumbbell, Kettlebell, Bodyweight, Cable, Machine, Band</summary>
    public string? Equipment { get; set; }
    
    public string? ImageUrl { get; set; }
    public string? VideoUrl { get; set; }
    public string? Instructions { get; set; }
    
    public bool IsActive { get; set; } = true;
    
    // Navigation
    public ICollection<WorkoutExercise> WorkoutExercises { get; set; } = [];
}
