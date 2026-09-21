using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Api.Models;

public class Trainer
{
    public int Id { get; set; }
    
    /// <summary>V2: Kimlik tablosuna bağlantı. Null olabilir (V1'den gelen legacy kayıtlar).</summary>
    public int? UserId { get; set; }
    public AppUser? User { get; set; }
    
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = "Eğitmen"; // "Salon Sahibi", "Eğitmen", "PT"
    public string? Phone { get; set; }
    public decimal DefaultShareRate { get; set; } = 0.40m; // %40 varsayılan hoca primi
    public bool IsActive { get; set; } = true;

    // Navigation (V1'den aynen korunuyor)
    public ICollection<AttendanceRecord> Attendances { get; set; } = [];
    
    // V2: Hoca tarafından açılan seans yuvaları
    public ICollection<SessionSlot> SessionSlots { get; set; } = [];
    
    // V2: Antrenman programları
    public ICollection<WorkoutTemplate> WorkoutTemplates { get; set; } = [];
}
