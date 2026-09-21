namespace SporTakip.Api.Models.Identity;

/// <summary>
/// Merkezi kimlik tablosu. Admin, Coach ve Athlete rolleri bu tablo üzerinden yönetilir.
/// Member ve Trainer profilleri bu tabloya FK ile bağlanır.
/// </summary>
public class AppUser
{
    public int Id { get; set; }
    
    /// <summary>
    /// Kullanıcının normalize edilmiş telefon numarası (E.164 formatı: +905XXXXXXXXX).
    /// Giriş (OTP) ve benzersiz kimlik anahtarı olarak kullanılır.
    /// </summary>
    public string PhoneNumber { get; set; } = string.Empty;
    
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? AvatarUrl { get; set; }
    
    /// <summary>Roller: Admin, Coach, Athlete. Bir kullanıcı birden fazla role sahip olabilir.</summary>
    public UserRole Roles { get; set; } = UserRole.Athlete;
    
    public bool IsActive { get; set; } = true;
    public bool PhoneVerified { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    
    // Navigation
    public Member? MemberProfile { get; set; }
    public Trainer? TrainerProfile { get; set; }
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
    public ICollection<OtpChallenge> OtpChallenges { get; set; } = [];
}

/// <summary>
/// Flag enum: Bir kullanıcı hem Coach hem Athlete olabilir.
/// Veritabanında int olarak saklanır (bitmask).
/// </summary>
[Flags]
public enum UserRole
{
    Athlete = 1,
    Coach   = 2,
    Admin   = 4
}
