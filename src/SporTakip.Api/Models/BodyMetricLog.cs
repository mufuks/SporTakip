namespace SporTakip.Api.Models;

/// <summary>
/// Sporcunun zaman içindeki kilo, yağ oranı ve vücut kompozisyonu ölçüm geçmişi (Progress Timeline).
/// </summary>
public class BodyMetricLog
{
    public int Id { get; set; }
    
    public int MemberId { get; set; }
    public Member? Member { get; set; }
    
    /// <summary>Ölçümün yapıldığı tarih ve saat (UTC)</summary>
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>Kilo (kg) - Örn: 78.50</summary>
    public decimal WeightKg { get; set; }
    
    /// <summary>Vücut Yağ Oranı (%) - Örn: 14.50</summary>
    public decimal? BodyFatPercentage { get; set; }
    
    /// <summary>İskelet Kası / Kas Kütlesi (kg) - Örn: 38.20</summary>
    public decimal? MuscleMassKg { get; set; }
    
    /// <summary>Ölçüm Notu (Örn: "Sabah aç karnına tartı", "Yeni diyet 2. hafta")</summary>
    public string? Notes { get; set; }
    
    /// <summary>Kayıt oluşturulma zamanı</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
