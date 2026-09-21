namespace SporTakip.Api.Models.Identity;

/// <summary>
/// Telefon numarasına gönderilen OTP kodlarının takibi.
/// Brute-force koruması için deneme sayısı ve süre dolumu kontrolleri içerir.
/// </summary>
public class OtpChallenge
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public AppUser User { get; set; } = null!;
    
    /// <summary>SHA-256 ile hash'lenmiş 6 haneli OTP kodu.</summary>
    public string CodeHash { get; set; } = string.Empty;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    
    public int AttemptCount { get; set; } = 0;
    public bool IsUsed { get; set; } = false;
}
