namespace SporTakip.Api.Models;

public class Package
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty; // "Grup 8 Ders", "Özel PT 8 Ders"
    public string PackageType { get; set; } = "GRUP"; // GRUP, PT, OZEL
    public int LessonCount { get; set; } = 8;
    public decimal DefaultPrice { get; set; } = 3000m;
    public int ValidityDays { get; set; } = 35; // 5 hafta geçerli
    public bool IsActive { get; set; } = true;

    public ICollection<Subscription> Subscriptions { get; set; } = [];
}
