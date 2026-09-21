namespace SporTakip.Api.Models;

/// <summary>
/// Yoklama kaydı. V1'deki tüm iş kuralları (İkame %40, ders düşme, UnitLessonPrice) 
/// birebir korunuyor. V2'de opsiyonel olarak bir SessionSlot'a ve Reservation'a 
/// bağlanabiliyor.
/// </summary>
public class AttendanceRecord
{
    public int Id { get; set; }
    public int SubscriptionId { get; set; }
    public Subscription Subscription { get; set; } = null!;

    public int LessonNumber { get; set; } // 1..8..12
    public DateTime LessonDate { get; set; } = DateTime.UtcNow;

    public int? TrainerId { get; set; } // Derse fiilen giren antrenör
    public Trainer? Trainer { get; set; }

    // V1 İkame Hoca alanları — AYNEN KORUNUYOR
    public bool IsSubstitute { get; set; } = false; // İkame hoca mı girdi?
    public decimal SubstituteShareAmount { get; set; } = 0m; // İkame hocaya giden %40 prim

    // V1 Yoklama durumları — AYNEN KORUNUYOR
    // "Attended" (Geldi), "Missed" (Gelmedi/Yandı), "Excused" (Mazeretli/Telafi), "Scheduled" (V1 legacy)
    public string Status { get; set; } = "Attended";
    public decimal UnitLessonPrice { get; set; } = 0m; // [Ücret / TotalLessons] örn 375 TL
    public decimal TrainerShareAmount { get; set; } = 0m; // Eğitmenin bu dersten kazandığı prim
    public string? Notes { get; set; }
    
    // V2: Hangi seans yuvasında gerçekleşti (opsiyonel, V1 legacy kayıtlar için null)
    public int? SessionSlotId { get; set; }
    public SessionSlot? SessionSlot { get; set; }
    
    // V2: Hangi rezervasyondan geldi (opsiyonel)
    public int? ReservationId { get; set; }
    public Reservation? Reservation { get; set; }
}
