namespace SporTakip.Api.Models;

public class Payment
{
    public int Id { get; set; }
    public int SubscriptionId { get; set; }
    public Subscription Subscription { get; set; } = null!;

    public decimal Amount { get; set; }
    public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
    public string PaymentMethod { get; set; } = "Nakit"; // Nakit, Havale/EFT, Kredi Kartı
    public string? Notes { get; set; }
}
