using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Api.Models;

public class Member
{
    public int Id { get; set; }
    
    /// <summary>V2: Kimlik tablosuna bağlantı. Null olabilir (V1'den gelen legacy kayıtlar).</summary>
    public int? UserId { get; set; }
    public AppUser? User { get; set; }
    
    public string FullName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>V2 Fiziksel Profil: Boy (cm)</summary>
    public int? HeightCm { get; set; }
    
    /// <summary>V2 Fiziksel Profil: Kilo (kg)</summary>
    public decimal? WeightKg { get; set; }
    
    /// <summary>V2 Fiziksel Profil: Yaş</summary>
    public int? Age { get; set; }
    
    /// <summary>V2 Fiziksel Profil: Cinsiyet ("Erkek", "Kadın", "Diğer")</summary>
    public string? Gender { get; set; }

    // Navigation (V1'den aynen korunuyor)
    public ICollection<Subscription> Subscriptions { get; set; } = [];
    
    // V2: Sporcu kendi rezervasyonlarını yapabilir
    public ICollection<Reservation> Reservations { get; set; } = [];
    
    // V2: Antrenman logları
    public ICollection<WorkoutLog> WorkoutLogs { get; set; } = [];
}
