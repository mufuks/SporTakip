namespace SporTakip.Api.Models;

public class Subscription
{
    public int Id { get; set; }
    public int MemberId { get; set; }
    public Member Member { get; set; } = null!;

    public int PackageId { get; set; }
    public Package Package { get; set; } = null!;

    public int? PrimaryTrainerId { get; set; } // Asıl Hoca (müşteriyi getiren veya sorumlu antrenör)
    public Trainer? PrimaryTrainer { get; set; }

    public decimal Price { get; set; }
    public int TotalLessons { get; set; } = 8;
    public int CompletedLessons { get; set; } = 0;
    public int RemainingLessons => Math.Max(0, TotalLessons - CompletedLessons);

    public DateTime StartDate { get; set; } = DateTime.UtcNow.Date;
    public DateTime? EndDate { get; set; }
    public string Status { get; set; } = "Active"; // Active, Completed, Frozen, Cancelled
    public string? Notes { get; set; }

    // Gelir Dağılımı: Salon Payı (Sinan) & Hoca Hakedişi (Gülçin vb.)
    public decimal SalonShareRate { get; set; } = 0.10m; // Örn 0.10, 0.30, 0.40
    public decimal SalonShareAmount { get; set; } = 0m;  // Price * SalonShareRate
    public decimal TrainerShareAmount { get; set; } = 0m; // Price - SalonShareAmount

    // Navigation (V1'den aynen korunuyor)
    public ICollection<AttendanceRecord> Attendances { get; set; } = [];
    public ICollection<Payment> Payments { get; set; } = [];
    
    // V2: Paket dondurma geçmişi
    public ICollection<FreezeRecord> FreezeRecords { get; set; } = [];

    // Ödeme & Bakiye Hesaplayıcı (V1'den birebir korunuyor)
    public decimal PaidAmount => Payments.Sum(p => p.Amount);
    public decimal RemainingBalance => Math.Max(0, Price - PaidAmount);
    public bool IsFullyPaid => PaidAmount >= Price;
}
