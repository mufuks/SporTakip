namespace SporTakip.Api.Models;

/// <summary>
/// Sporcu veya hoca/admin tarafından yapılan seans rezervasyonu.
/// Waitlist (yedek liste) ve 3 saat iptal kuralının yapısal altyapısını sağlar.
/// </summary>
public class Reservation
{
    public int Id { get; set; }
    
    public int SessionSlotId { get; set; }
    public SessionSlot SessionSlot { get; set; } = null!;
    
    public int MemberId { get; set; }
    public Member Member { get; set; } = null!;
    
    public int SubscriptionId { get; set; }
    public Subscription Subscription { get; set; } = null!;
    
    /// <summary>Kim tarafından oluşturuldu: Athlete, Coach, Admin</summary>
    public string BookedBy { get; set; } = "Coach";
    
    /// <summary>
    /// Confirmed  — Onaylı, kapasitede yer var.
    /// Waitlisted — Yedek listede, yer açılırsa otomatik onaylanır.
    /// CancelledByAthlete — Sporcu tarafından iptal edildi.
    /// CancelledByCoach  — Hoca/admin tarafından iptal edildi.
    /// NoShow     — Derse gelmedi (3 saat kuralı sonrası).
    /// CheckedIn  — Yoklaması alındı, AttendanceRecord oluşturuldu.
    /// </summary>
    public string Status { get; set; } = "Confirmed";
    
    /// <summary>Waitlist sırası (0 = onaylı, 1+ = yedek sırası).</summary>
    public int WaitlistPosition { get; set; } = 0;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CancelledAt { get; set; }
    public string? CancellationReason { get; set; }
    
    // V2: Yoklama ile 1:1 bağlantı
    public AttendanceRecord? AttendanceRecord { get; set; }
}
