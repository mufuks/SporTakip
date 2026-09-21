namespace SporTakip.Api.Models;

/// <summary>
/// Antrenör tarafından açılan saatlik seans yuvası.
/// BR-03 kapasite kontrolünün temel birimi.
/// Bir slot birden fazla sporcu rezervasyonunu barındırabilir (grup dersleri).
/// </summary>
public class SessionSlot
{
    public int Id { get; set; }
    
    public int TrainerId { get; set; }
    public Trainer Trainer { get; set; } = null!;
    
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    
    /// <summary>Salon genelindeki bu slot için maksimum sporcu kapasitesi (varsayılan 6, BR-03).</summary>
    public int Capacity { get; set; } = 6;
    
    /// <summary>GRUP, PT, OZEL — Paket tipiyle uyumlu.</summary>
    public string SessionType { get; set; } = "GRUP";
    
    public string? Title { get; set; } // "Fonksiyonel Antrenman", "Bacak & Core"
    public string? Notes { get; set; }
    
    /// <summary>Open, Full, Cancelled</summary>
    public string Status { get; set; } = "Open";
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation
    public ICollection<Reservation> Reservations { get; set; } = [];
    public ICollection<AttendanceRecord> AttendanceRecords { get; set; } = [];
}
