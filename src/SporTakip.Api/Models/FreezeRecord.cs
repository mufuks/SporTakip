namespace SporTakip.Api.Models;

/// <summary>Paket dondurma geçmişi. Dondurma süresince EndDate otomatik uzatılır.</summary>
public class FreezeRecord
{
    public int Id { get; set; }
    
    public int SubscriptionId { get; set; }
    public Subscription Subscription { get; set; } = null!;
    
    public DateTime FreezeStart { get; set; }
    public DateTime? FreezeEnd { get; set; }
    public string Reason { get; set; } = string.Empty; // "Tatil", "Sağlık Raporu", "Kişisel"
    public string? Notes { get; set; }
    
    /// <summary>EndDate'e eklenen gün sayısı.</summary>
    public int DaysAdded { get; set; } = 0;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
